const cds = require('@sap/cds')
const axios = require('axios')
const readline = require('readline')
const { randomUUID } = require('crypto')

const PYTHON_URL = () => process.env.PYTHON_URL || 'http://localhost:8000'

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
    for (const r of rows || []) ids.add(r.agent_ID)
  }
  return ids
}

async function userMayUseAgent(user, agentId) {
  const ids = await allowedAgentIdsForUser(user)
  return ids.has(agentId)
}

async function loadAgentBundle(agentId) {
  const db = await cds.connect.to('db')
  const [agent] = await db.run(`SELECT * FROM acp_Agent WHERE ID = ? AND status = 'Active'`, [agentId])
  if (!agent) return null
  const tools = await db.run(
    `SELECT at.permissionOverride AS permissionOverride, t.name AS name, t.description AS description,
            t.inputSchema AS inputSchema, t.elevated AS elevated, t.status AS status,
            s.destinationName AS destinationName, s.baseUrl AS baseUrl
     FROM acp_AgentTool at
     INNER JOIN acp_Tool t ON t.ID = at.tool_ID
     INNER JOIN acp_McpServer s ON s.ID = t.server_ID
     WHERE at.agent_ID = ? AND t.status = 'Active'`,
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
      const ids = await allowedAgentIdsForUser(user)
      if (!ids.size) return res.json({ agents: [] })
      const db = await cds.connect.to('db')
      const placeholders = [...ids].map(() => '?').join(',')
      const rows = await db.run(
        `SELECT ID, name, description, modelProfile FROM acp_Agent WHERE status = 'Active' AND ID IN (${placeholders})`,
        [...ids]
      )
      const agents = (rows || []).map(a => ({
        id: a.ID,
        name: a.name,
        description: a.description,
        modelProfile: a.modelProfile
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
        const perm = row.permissionOverride || 'Inherit'
        const eff = effectiveElevated(perm, row.elevated, bundle.agent.identityMode)
        if (eff === null) return res.status(400).json({ error: 'Invalid permission override for tool ' + row.name })
        let mcpServerUrl = ''
        if (row.destinationName) {
          try {
            const { getDestination } = require('@sap-cloud-sdk/connectivity')
            const dest = await getDestination({ destinationName: row.destinationName })
            mcpServerUrl = dest?.url?.replace(/\/$/, '') || ''
          } catch {
            mcpServerUrl = ''
          }
        }
        if (!mcpServerUrl && row.baseUrl) mcpServerUrl = String(row.baseUrl).replace(/\/$/, '')
        effectiveTools.push({
          name: row.name,
          description: row.description || '',
          inputSchema: safeJson(row.inputSchema),
          mcpServerUrl,
          elevated: eff,
          machineToken: null
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
      const payload = {
        agentConfig: {
          systemPrompt: bundle.agent.systemPrompt,
          modelProfile: bundle.agent.modelProfile,
          identityMode: bundle.agent.identityMode
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
      let forwardedDone = null

      const handleLine = line => {
        res.write(line + '\n')
        if (!line.startsWith('data: ')) return
        try {
          const evt = JSON.parse(line.slice(6).trim())
          if (evt.type === 'token' && evt.content) assistantText += evt.content
          if (evt.type === 'tool_result') {
            toolRecords.push({
              toolName: evt.toolName,
              summary: evt.summary || '',
              durationMs: evt.durationMs || 0,
              args: evt.args
            })
          }
          if (evt.type === 'done') forwardedDone = evt
        } catch {
          /* ignore */
        }
      }

      for await (const line of rl) handleLine(line)

      if (forwardedDone && user?.id) {
        const uid = user.id
        const now = new Date().toISOString()
        let sid = sessionId || forwardedDone.sessionId
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
      }

      res.end()
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.status(500).json({ error: e.message })
      else res.end()
    }
  })
})

module.exports = cds.server
