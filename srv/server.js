const cds = require('@sap/cds')
const axios = require('axios')
const readline = require('readline')
const { randomUUID } = require('crypto')

const PYTHON_URL = () => process.env.PYTHON_URL || 'http://localhost:8000'

/** Bearer token for MCP calls when a tool is elevated (optional; set on CF for delegated-identity servers). */
const MCP_MACHINE_TOKEN = () => process.env.MCP_MACHINE_TOKEN || ''

function deptValueEmpty(v) {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0 || String(v[0]).trim() === ''
  return String(v).trim() === ''
}

/** Decode Bearer JWT payload (middle segment) without verification — only after CAP auth has validated the token. */
function decodeJwtPayloadFromBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1].trim()
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
      return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'))
    } catch {
      return null
    }
  }
}

/** Prefer App Router–forwarded `Authorization`; fall back to `x-forwarded-access-token` if present. */
function getAuthHeader(req) {
  if (!req) return ''
  const a = typeof req.get === 'function' ? req.get('authorization') : ''
  const b = req.headers && (req.headers.authorization || req.headers.Authorization)
  const h = (a && String(a)) || (b && String(b)) || ''
  if (h) return h
  const xfat =
    (typeof req.get === 'function' && (req.get('x-forwarded-access-token') || req.get('X-Forwarded-Access-Token'))) ||
    (req.headers && (req.headers['x-forwarded-access-token'] || req.headers['X-Forwarded-Access-Token']))
  if (xfat && typeof xfat === 'string') {
    const t = xfat.trim()
    return /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`
  }
  return ''
}

/**
 * CAP `user.attr` sometimes omits claims that are still present under JWT `xs.user.attributes`.
 * Merge those into a flat copy so gating matches HANA claim keys (e.g. `dept`, `customAttribute1`).
 */
function mergeJwtXsUserAttributes(baseAttr, authHeader) {
  const out = { ...baseAttr }
  const payload = decodeJwtPayloadFromBearer(authHeader)
  if (!payload) return out
  const xs = payload['xs.user.attributes'] || payload['xs_user_attributes']
  if (!xs || typeof xs !== 'object') return out
  for (const [k, v] of Object.entries(xs)) {
    const val = Array.isArray(v) ? v[0] : v
    if (out[k] == null || (typeof out[k] === 'string' && out[k].trim() === '')) {
      out[k] = val
    }
  }
  return out
}

/**
 * When BTP has not yet mapped IAS → XSUAA `dept`, the JWT may still carry `customAttribute1` (etc.).
 * Agent gating uses `claimKey` **dept** in HANA; we synthesize `attr.dept` from common IAS attribute keys.
 * Pass `authHeader` for XSUAA/IAS so `xs.user.attributes` from the Bearer JWT is merged when flat `user.attr` is incomplete.
 */
function attrForAgentGating(user, authHeader) {
  const base = user?.attr && typeof user.attr === 'object' ? { ...user.attr } : {}
  const raw = mergeJwtXsUserAttributes(base, authHeader)
  if (!deptValueEmpty(raw.dept)) return raw

  const candidates = [
    'customAttribute1',
    'CustomAttribute1',
    'department',
    'Department',
    'deptCode',
    'Dept'
  ]
  for (const ck of candidates) {
    if (!Object.prototype.hasOwnProperty.call(raw, ck)) continue
    const val = raw[ck]
    if (!deptValueEmpty(val)) {
      raw.dept = Array.isArray(val) ? val[0] : val
      return raw
    }
  }
  for (const k of Object.keys(raw)) {
    const kl = k.toLowerCase()
    if (kl === 'customattribute1' || kl === 'department') {
      const val = raw[k]
      if (!deptValueEmpty(val)) {
        raw.dept = Array.isArray(val) ? val[0] : val
        break
      }
    }
  }
  return raw
}

function claimPairs(user, authHeader) {
  const attr = attrForAgentGating(user, authHeader)
  const out = []
  for (const [key, v] of Object.entries(attr)) {
    if (v == null) continue
    for (const val of Array.isArray(v) ? v : [v]) out.push({ key, value: String(val) })
  }
  return out
}

function identityDebugEnabled() {
  return process.env.ACP_DEBUG_IDENTITY === 'true' || process.env.ACP_DEBUG_IDENTITY === '1'
}

function maskSubject(sub) {
  if (!sub || typeof sub !== 'string') return null
  return sub.length <= 12 ? `${sub.slice(0, 3)}…` : `${sub.slice(0, 8)}…`
}

/** Safe structured snapshot for troubleshooting IAS → XSUAA `dept` (enable with ACP_DEBUG_IDENTITY). */
function buildIdentityDebug(user, authHeader) {
  const payload = decodeJwtPayloadFromBearer(authHeader)
  const gated = attrForAgentGating(user, authHeader)
  const pairs = claimPairs(user, authHeader)
  const xs = payload && (payload['xs.user.attributes'] || payload['xs_user_attributes'])
  const xsKeys = xs && typeof xs === 'object' ? Object.keys(xs) : []
  const xsCopy = xs && typeof xs === 'object' ? { ...xs } : null
  let jwtKeys = []
  if (payload) {
    jwtKeys = Object.keys(payload).filter(k => k !== 'xs.user.attributes' && k !== 'xs_user_attributes')
  }
  let hint = null
  if (!payload && !pairs.length) {
    hint =
      'Bearer JWT not decoded from this request (no Authorization / x-forwarded-access-token). App Router should forward the token to CAP.'
  } else if (!xsKeys.length && !pairs.length) {
    hint =
      'No xs.user.attributes and no claim pairs after gating — configure BTP Trust / role attribute mapping from IAS (e.g. customAttribute1 → dept). Use GetUser via scripts/ias-scim.ps1 to confirm IAS stores the attribute.'
  }
  return {
    bearerPresent: !!authHeader,
    jwtDecoded: !!payload,
    jwtTopLevelClaimKeys: jwtKeys,
    maskedSubject: maskSubject(user?.id),
    capUserAttrKeys: Object.keys(user?.attr || {}),
    capUserAttr: user?.attr && typeof user.attr === 'object' ? { ...user.attr } : {},
    xsUserAttributesKeys: xsKeys,
    xsUserAttributes: xsCopy,
    claimPairs: pairs,
    gatedDeptEffective: deptValueEmpty(gated.dept)
      ? null
      : String(Array.isArray(gated.dept) ? gated.dept[0] : gated.dept).trim(),
    gatedAttrKeys: Object.keys(gated),
    hint
  }
}

async function allowedAgentIdsForUser(user, authHeader) {
  const pairs = claimPairs(user, authHeader)
  const ids = new Set()
  if (!pairs.length) return ids
  const db = await cds.connect.to('db')
  for (const { key, value } of pairs) {
    const k = String(key).trim()
    const v = String(value).trim()
    if (!k || !v) continue
    const rows = await db.run(
      `SELECT DISTINCT aga.agent_ID AS agent_ID FROM acp_AgentGroupAgent aga
       INNER JOIN acp_AgentGroup g ON aga.group_ID = g.ID
       INNER JOIN acp_AgentGroupClaimValue v ON v.group_ID = g.ID
       WHERE LOWER(TRIM(v.value)) = LOWER(TRIM(?)) AND LOWER(TRIM(g.claimKey)) = LOWER(TRIM(?)) AND g.status = 'Active'`,
      [v, k]
    )
    for (const r of rows || []) {
      const aid = r.agent_ID ?? r.AGENT_ID
      if (aid != null) ids.add(aid)
    }
  }
  return ids
}

/**
 * Hybrid dev fallback: list all Active agents only for **dummy** auth when claims match nothing.
 * For **xsuaa/jwt/ias**, do not list every agent unless `ACP_HYBRID_XSUAA_AGENT_FALLBACK=true` (dev escape hatch).
 */
function hybridAgentFallbackEnabled() {
  if (process.env.ACP_STRICT_AGENT_GATING === 'true') return false
  const profiles = cds.env.profiles || []
  const envHybrid = (process.env.CDS_ENV || '')
    .split(',')
    .map(s => s.trim())
    .includes('hybrid')
  const isHybrid = profiles.includes('hybrid') || envHybrid
  if (!isHybrid) return false
  const kind = cds.requires.auth?.kind
  if (kind === 'dummy') return true
  if (kind === 'xsuaa' || kind === 'jwt' || kind === 'ias') {
    return process.env.ACP_HYBRID_XSUAA_AGENT_FALLBACK === 'true'
  }
  return false
}

let _warnedHybridAgentFallback = false

async function allActiveAgentIds(db) {
  const rows = await db.run(`SELECT ID FROM acp_Agent WHERE status = 'Active'`)
  return new Set((rows || []).map(r => r.ID ?? r.id))
}

/**
 * Group/claim-based IDs when data is deployed; otherwise in hybrid+dummy only, all Active agents
 * (so the chat UI works until `npm run deploy:hana` loads CSV seeds).
 */
async function resolvedAllowedAgentIdsForUser(user, precomputedClaimIds, authHeader) {
  const ids = precomputedClaimIds != null ? precomputedClaimIds : await allowedAgentIdsForUser(user, authHeader)
  if (ids.size) return ids
  if (!hybridAgentFallbackEnabled()) return ids
  const db = await cds.connect.to('db')
  const all = await allActiveAgentIds(db)
  if (!all.size) return ids
  if (!_warnedHybridAgentFallback) {
    _warnedHybridAgentFallback = true
    console.warn(
      '[acp] hybrid: no AgentGroup match for user attributes; listing all Active agents (dummy or ACP_HYBRID_XSUAA_AGENT_FALLBACK). ' +
        'For XSUAA users, set IAS/BTP attribute mapping so JWT includes `dept` matching `acp-AgentGroupClaimValue`. ' +
        'Set ACP_STRICT_AGENT_GATING=true to disable fallback.'
    )
  }
  return all
}

async function userMayUseAgent(user, agentId, authHeader) {
  const ids = await resolvedAllowedAgentIdsForUser(user, null, authHeader)
  return ids.has(agentId)
}

async function loadAgentBundle(agentId) {
  const db = await cds.connect.to('db')
  const [agent] = await db.run(`SELECT * FROM acp_Agent WHERE ID = ? AND status = 'Active'`, [agentId])
  if (!agent) return null
  const tools = await db.run(
    `SELECT agt.permissionOverride AS permissionOverride, t.name AS name, t.description AS description,
            t.inputSchema AS inputSchema, t.elevated AS elevated, t.status AS status,
            s.destinationName AS destinationName, s.baseUrl AS baseUrl
     FROM acp_AgentTool AS agt
     INNER JOIN acp_Tool t ON t.ID = agt.tool_ID
     INNER JOIN acp_McpServer s ON s.ID = t.server_ID
     WHERE agt.agent_ID = ? AND t.status = 'Active'`,
    [agentId]
  )
  return { agent, tools: tools || [] }
}

function effectiveElevated(perm, toolElev, identityMode) {
  if (perm === 'ForceDelegated') return false
  if (perm === 'ForceElevated') {
    if (identityMode === 'Mixed' && toolElev) return true
    return null
  }
  return !!toolElev
}

function safeJson(s) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s || {}
  } catch {
    return {}
  }
}

const mockedUsers = require('@sap/cds/lib/srv/middlewares/auth/mocked-users')
const { forwardHeadersForPython } = require('./python-trust')

cds.on('bootstrap', app => {
  const express = require('express')
  app.use('/api', express.json())

  const kind = cds.requires.auth?.kind
  const dummyAllowed = kind === 'dummy' && process.env.ACP_USE_DUMMY_AUTH === 'true'
  const useJwt = kind === 'xsuaa' || kind === 'jwt' || kind === 'ias'

  if (kind === 'dummy' && !dummyAllowed) {
    app.use('/api', (req, res) => {
      res.status(401).json({
        error:
          'Dummy auth disabled. Set ACP_USE_DUMMY_AUTH=true for local Basic auth, or use `cds watch --profile hybrid` with XSUAA (`cds bind`). See README.'
      })
    })
  } else if (dummyAllowed) {
    const userStore = mockedUsers(cds.env.requires.auth)
    app.use('/api', cds.middlewares.context())
    app.use('/api', (req, res, next) => {
      const auth = req.headers.authorization
      if (!auth?.match(/^basic/i)) {
        return res.set('WWW-Authenticate', 'Basic realm="Users"').status(401).end()
      }
      const [id, pwd] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
      const u = userStore.verify(id, pwd)
      if (u.failed) return res.status(401).json({ error: u.failed })
      req.user = u
      const ctx = cds.context
      if (ctx) ctx.user = u
      next()
    })
  } else if (useJwt) {
    app.use('/api', cds.middlewares.context())
    app.use('/api', cds.middlewares.auth())
    app.use('/api', (req, res, next) => {
      req.user = cds.context.user
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })
  }

  app.get('/api/me', async (req, res) => {
    try {
      const user = req.user
      if (!user) return res.status(401).json({ error: 'Unauthorized' })
      const authHeader = getAuthHeader(req)
      const roles = user.roles ? Object.keys(user.roles).filter(k => k && user.roles[k]) : []
      const pairs = claimPairs(user, authHeader)
      const gated = attrForAgentGating(user, authHeader)
      const origDept = user.attr?.dept
      const de = gated.dept
      const deptEffective = deptValueEmpty(de) ? null : String(Array.isArray(de) ? de[0] : de).trim()
      const body = {
        id: user.id,
        roles,
        attrKeys: Object.keys(user.attr || {}),
        claimPairCount: pairs.length,
        deptEffective,
        deptMappedFromFallback: deptValueEmpty(origDept) && deptEffective != null && deptEffective !== ''
      }
      if (identityDebugEnabled()) {
        body.debug = buildIdentityDebug(user, authHeader)
        const wantToken =
          req.query &&
          (req.query.acpLogToken === '1' || String(req.query.acpLogToken).toLowerCase() === 'true')
        if (wantToken) {
          const m = authHeader.match(/^Bearer\s+(.+)$/i)
          body.accessToken = m ? m[1].trim() : null
          body._acpLogTokenNote =
            'Dev only: raw access JWT for decode-jwt.ps1 / jwt.io. Do not paste into chat or commit logs. Rotate if leaked.'
        }
      }
      res.json(body)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get('/api/agents', async (req, res) => {
    try {
      const user = req.user
      if (!user?.is?.('Agent.User')) return res.status(403).json({ error: 'Agent.User required' })
      const authHeader = getAuthHeader(req)
      const idsFromClaims = await allowedAgentIdsForUser(user, authHeader)
      const ids = await resolvedAllowedAgentIdsForUser(user, idsFromClaims, authHeader)
      const gated = attrForAgentGating(user, authHeader)
      const deptMissing = deptValueEmpty(gated.dept)
      if (identityDebugEnabled()) {
        console.info('[acp] identity-debug /api/agents', JSON.stringify(buildIdentityDebug(user, authHeader)))
      }
      if (!ids.size && deptMissing) {
        console.warn(
          '[acp] No agents: no usable department value after mapping (`dept` or customAttribute1/department). Set IAS user attribute and/or BTP trust mapping to XSUAA `dept`. Values must match ACP_AGENTGROUPCLAIMVALUE (e.g. procurement, finance, it). Set ACP_DEBUG_IDENTITY=true for structured JWT claim logging.'
        )
      }
      if (!ids.size) return res.json({ agents: [] })
      const db = await cds.connect.to('db')
      const placeholders = [...ids].map(() => '?').join(',')
      const rows = await db.run(
        `SELECT ID, name, description, modelProfile FROM acp_Agent WHERE status = 'Active' AND ID IN (${placeholders})`,
        [...ids]
      )
      const agents = (rows || []).map(a => ({
        id: a.ID ?? a.id,
        name: a.name ?? a.NAME,
        description: a.description ?? a.DESCRIPTION,
        modelProfile: a.modelProfile ?? a.MODELPROFILE
      }))
      return res.json({ agents })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: e.message })
    }
  })

  app.post('/api/chat', async (req, res) => {
    const user = req.user
    if (!user?.is?.('Agent.User')) return res.status(403).json({ error: 'Agent.User required' })
    const authHeader = getAuthHeader(req)

    const { agentId, message, sessionId } = req.body || {}
    if (!agentId || !message) return res.status(400).json({ error: 'agentId and message required' })

    try {
      if (!(await userMayUseAgent(user, agentId, authHeader))) return res.status(403).json({ error: 'Agent not accessible' })

      const bundle = await loadAgentBundle(agentId)
      if (!bundle?.agent) return res.status(404).json({ error: 'Agent not found' })

      const effectiveTools = []
      for (const row of bundle.tools) {
        const toolName = row.name ?? row.NAME
        if (!toolName) continue
        const perm = (row.permissionOverride ?? row.PERMISSIONOVERRIDE) || 'Inherit'
        const eff = effectiveElevated(perm, row.elevated ?? row.ELEVATED, bundle.agent.identityMode)
        if (eff === null) {
          return res.status(400).json({ error: 'Invalid permission override for tool ' + (toolName || '?') })
        }
        let mcpServerUrl = ''
        const destName = row.destinationName ?? row.DESTINATIONNAME
        if (destName) {
          try {
            const { getDestination } = require('@sap-cloud-sdk/connectivity')
            const dest = await getDestination({ destinationName: destName })
            mcpServerUrl = dest?.url?.replace(/\/$/, '') || ''
          } catch {
            mcpServerUrl = ''
          }
        }
        const baseUrl = row.baseUrl ?? row.BASEURL
        if (!mcpServerUrl && baseUrl) mcpServerUrl = String(baseUrl).replace(/\/$/, '')
        const machineTok = eff ? MCP_MACHINE_TOKEN() : ''
        effectiveTools.push({
          name: toolName,
          description: (row.description ?? row.DESCRIPTION) || '',
          inputSchema: safeJson(row.inputSchema ?? row.INPUTSCHEMA),
          mcpServerUrl,
          elevated: eff,
          machineToken: machineTok || null
        })
      }

      const db = await cds.connect.to('db')
      let history = []
      if (sessionId) {
        const msgs = await db.run(
          `SELECT role, content FROM acp_ChatMessage WHERE session_ID = ? ORDER BY timestamp ASC`,
          [sessionId]
        )
        history = (msgs || []).map(m => ({ role: m.role, content: m.content }))
      }

      const authHeader = getAuthHeader(req)
      const a = bundle.agent
      const payload = {
        agentConfig: {
          systemPrompt: a.systemPrompt ?? a.SYSTEMPROMPT,
          modelProfile: a.modelProfile ?? a.MODELPROFILE,
          identityMode: a.identityMode ?? a.IDENTITYMODE
        },
        effectiveTools,
        message,
        history,
        userInfo: {
          userId: user.id,
          email: user.email || user.id,
          groups: []
        },
        userToken: authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
      }

      const py = await axios.post(`${PYTHON_URL()}/chat`, payload, {
        headers: forwardHeadersForPython(user),
        responseType: 'stream',
        timeout: 0,
        validateStatus: () => true
      })

      if (py.status >= 400) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Python service returned ' + py.status })}\n\n`)
        return res.end()
      }

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const rl = readline.createInterface({ input: py.data })
      let assistantText = ''
      const toolRecords = []
      let streamCompletedNormally = false

      const handleLine = line => {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6).trim())
            if (evt.type === 'done') {
              streamCompletedNormally = true
              return
            }
            if (evt.type === 'token' && evt.content) assistantText += evt.content
            if (evt.type === 'tool_result') {
              toolRecords.push({
                toolName: evt.toolName,
                summary: evt.summary || '',
                durationMs: evt.durationMs || 0,
                args: evt.args
              })
            }
          } catch {
            /* ignore */
          }
        }
        res.write(line + '\n')
      }

      for await (const line of rl) handleLine(line)

      if (streamCompletedNormally && user?.id) {
        const uid = user.id
        const now = new Date().toISOString()
        let sid = sessionId
        if (!sid) {
          sid = randomUUID()
          await db.run(
            `INSERT INTO acp_ChatSession (ID, agentId, userId, title, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`,
            [sid, agentId, uid, String(message).slice(0, 40), now, now]
          )
        } else {
          await db.run(`UPDATE acp_ChatSession SET updatedAt = ? WHERE ID = ? AND userId = ?`, [now, sid, uid])
        }

        const userMsgId = randomUUID()
        const asstMsgId = randomUUID()
        await db.run(
          `INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp) VALUES (?,?,?,?,?)`,
          [userMsgId, sid, 'user', message, now]
        )
        await db.run(
          `INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp) VALUES (?,?,?,?,?)`,
          [asstMsgId, sid, 'assistant', assistantText || '(empty)', new Date().toISOString()]
        )

        for (const tr of toolRecords) {
          await db.run(
            `INSERT INTO acp_ToolCallRecord (ID, message_ID, toolName, arguments, resultSummary, durationMs, elevatedUsed, timestamp) VALUES (?,?,?,?,?,?,?,?)`,
            [
              randomUUID(),
              asstMsgId,
              tr.toolName || 'unknown',
              JSON.stringify(tr.args || {}),
              tr.summary || '',
              tr.durationMs || 0,
              0,
              new Date().toISOString()
            ]
          )
        }

        res.write(
          `data: ${JSON.stringify({ type: 'done', sessionId: sid, messageId: asstMsgId })}\n\n`
        )
      }

      res.end()
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.status(500).json({ error: e.message })
      else res.end()
    }
  })

  /** Persist user + partial assistant turn when the browser aborts the SSE stream (Stop). */
  app.post('/api/chat/save-partial', async (req, res) => {
    const user = req.user
    if (!user?.is?.('Agent.User')) return res.status(403).json({ error: 'Agent.User required' })
    const authHeader = getAuthHeader(req)
    const { agentId, sessionId, userMessage, assistantContent } = req.body || {}
    if (!agentId || userMessage == null || userMessage === '') {
      return res.status(400).json({ error: 'agentId and userMessage required' })
    }
    try {
      if (!(await userMayUseAgent(user, agentId, authHeader))) return res.status(403).json({ error: 'Agent not accessible' })
      const db = await cds.connect.to('db')
      const uid = user.id
      const now = new Date().toISOString()
      const assistantText = String(assistantContent ?? '')
      let sid = sessionId || null
      if (sid) {
        const rows = await db.run(`SELECT ID FROM acp_ChatSession WHERE ID = ? AND userId = ?`, [sid, uid])
        if (!rows?.length) return res.status(403).json({ error: 'Session not found' })
        await db.run(`UPDATE acp_ChatSession SET updatedAt = ? WHERE ID = ?`, [now, sid])
      } else {
        sid = randomUUID()
        await db.run(
          `INSERT INTO acp_ChatSession (ID, agentId, userId, title, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`,
          [sid, agentId, uid, String(userMessage).slice(0, 40), now, now]
        )
      }
      const userMsgId = randomUUID()
      const asstMsgId = randomUUID()
      await db.run(
        `INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp) VALUES (?,?,?,?,?)`,
        [userMsgId, sid, 'user', String(userMessage), now]
      )
      await db.run(
        `INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp) VALUES (?,?,?,?,?)`,
        [asstMsgId, sid, 'assistant', assistantText || '[stopped]', new Date().toISOString()]
      )
      return res.json({ sessionId: sid, messageId: asstMsgId })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: e.message })
    }
  })
})

module.exports = cds.server
