const cds = require('@sap/cds')
const axios = require('axios')
const readline = require('readline')
const { randomUUID } = require('crypto')

const PYTHON_URL = () => process.env.PYTHON_URL || 'http://localhost:8000'

/** Bearer token for MCP calls when a tool is elevated (optional; set on CF for delegated-identity servers). */
const MCP_MACHINE_TOKEN = () => process.env.MCP_MACHINE_TOKEN || ''

function claimPairs(user) {
  const attr = user?.attr || {}
  const out = []
  for (const [key, v] of Object.entries(attr)) {
    if (v == null) continue
    for (const val of Array.isArray(v) ? v : [v]) out.push({ key, value: String(val) })
  }
  return out
}

async function allowedAgentIdsForUser(user) {
  const pairs = claimPairs(user)
  const ids = new Set()
  if (!pairs.length) return ids
  const db = await cds.connect.to('db')
  for (const { key, value } of pairs) {
    const rows = await db.run(
      `SELECT DISTINCT aga.agent_ID AS agent_ID FROM acp_AgentGroupAgent aga
       INNER JOIN acp_AgentGroup g ON aga.group_ID = g.ID
       INNER JOIN acp_AgentGroupClaimValue v ON v.group_ID = g.ID
       WHERE v.value = ? AND g.claimKey = ? AND g.status = 'Active'`,
      [value, key]
    )
    for (const r of rows || []) {
      const aid = r.agent_ID ?? r.AGENT_ID
      if (aid != null) ids.add(aid)
    }
  }
  return ids
}

/** Hybrid local dev: schema + agents often exist without CSV group/claim rows after bind. */
function hybridDummyAuth() {
  if (process.env.ACP_STRICT_AGENT_GATING === 'true') return false
  const profiles = cds.env.profiles || []
  const envHybrid = (process.env.CDS_ENV || '')
    .split(',')
    .map(s => s.trim())
    .includes('hybrid')
  return (profiles.includes('hybrid') || envHybrid) && cds.requires.auth?.kind === 'dummy'
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
async function resolvedAllowedAgentIdsForUser(user) {
  const ids = await allowedAgentIdsForUser(user)
  if (ids.size) return ids
  if (!hybridDummyAuth()) return ids
  const db = await cds.connect.to('db')
  const all = await allActiveAgentIds(db)
  if (!all.size) return ids
  if (!_warnedHybridAgentFallback) {
    _warnedHybridAgentFallback = true
    console.warn(
      '[acp] hybrid: no AgentGroup match for user attributes; listing all Active agents. ' +
        'Run `npm run deploy:hana` to load CSV seeds and enforce group-based access. ' +
        'Set ACP_STRICT_AGENT_GATING=true to disable this fallback.'
    )
  }
  return all
}

async function userMayUseAgent(user, agentId) {
  const ids = await resolvedAllowedAgentIdsForUser(user)
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

cds.on('bootstrap', app => {
  const userStore = mockedUsers(cds.env.requires.auth)
  const express = require('express')
  app.use('/api', express.json())
  app.use('/api', (req, res, next) => {
    const auth = req.headers.authorization
    if (!auth?.match(/^basic/i)) {
      return res.set('WWW-Authenticate', 'Basic realm="Users"').status(401).end()
    }
    const [id, pwd] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
    const u = userStore.verify(id, pwd)
    if (u.failed) return res.status(401).json({ error: u.failed })
    req.user = u
    next()
  })

  app.get('/api/agents', async (req, res) => {
    try {
      const user = req.user
      if (!user?.is?.('Agent.User')) return res.status(403).json({ error: 'Agent.User required' })
      const ids = await resolvedAllowedAgentIdsForUser(user)
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

    const { agentId, message, sessionId } = req.body || {}
    if (!agentId || !message) return res.status(400).json({ error: 'agentId and message required' })

    try {
      if (!(await userMayUseAgent(user, agentId))) return res.status(403).json({ error: 'Agent not accessible' })

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

      const authHeader = req.headers.authorization || ''
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
    const { agentId, sessionId, userMessage, assistantContent } = req.body || {}
    if (!agentId || userMessage == null || userMessage === '') {
      return res.status(400).json({ error: 'agentId and userMessage required' })
    }
    try {
      if (!(await userMayUseAgent(user, agentId))) return res.status(403).json({ error: 'Agent not accessible' })
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
