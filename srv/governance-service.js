const cds = require('@sap/cds')
const axios = require('axios')
const { getDestination } = require('@sap-cloud-sdk/connectivity')
const { SELECT, INSERT, UPDATE } = cds.ql
const { forwardHeadersForPython } = require('./python-trust')
const {
  operatorSafeHttpError,
  syncToolsTimeoutMs,
  testConnectionTimeoutMs
} = require('./governance-net-errors')

const PYTHON_URL = () => process.env.PYTHON_URL || 'http://localhost:8000'

async function resolveMcpBaseUrl(server) {
  const destName = server.destinationName?.trim()
  if (destName) {
    try {
      const dest = await getDestination({ destinationName: destName })
      if (dest?.url) return dest.url.replace(/\/$/, '')
    } catch {
      /* local dev without Destination service — fall through */
    }
  }
  let base = server.baseUrl?.trim() || ''
  if (base.includes('localhost')) {
    base = base.replace('localhost', '127.0.0.1')
  }
  if (base) return base.replace(/\/$/, '')
  throw new Error('McpServer has no resolvable URL (destination or baseUrl)')
}

module.exports = cds.service.impl(async function () {
  const { McpServers, Tools, Agents } = this.entities

  this.before('UPDATE', Tools, async req => {
    if (req.data.elevated === undefined) return
    const id = req.data.ID
    if (!id) return
    const prev = await SELECT.one.from(Tools).columns('elevated').where({ ID: id })
    if (prev && prev.elevated !== req.data.elevated && !req.user?.is('Agent.Admin')) {
      return req.reject(403, 'Only Agent.Admin may change elevated flag')
    }
  })

  this.before('CREATE', Agents, async req => {
    req.data.createdBy = req.user?.id || req.user?.email || 'unknown'
  })

  const LOG = cds.log('governance')
  this.on('testConnection', McpServers, async req => {
    LOG.info(`testConnection triggered. Params: ${JSON.stringify(req.params)}`)
    const id = req.params[0]?.ID || req.params[0]
    const srv = await SELECT.one.from(McpServers).where({ ID: id })
    if (!srv) {
      LOG.error(`McpServer not found for ID: ${id}`)
      return req.reject(404, 'McpServer not found')
    }
    let base
    try {
      base = await resolveMcpBaseUrl(srv)
      LOG.info(`Resolved base URL: ${base}`)
    } catch (e) {
      LOG.error(`Failed to resolve base URL: ${e.message}`)
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      })
      return req.reject(400, e.message || String(e))
    }
    try {
      LOG.info(`Calling health endpoint: ${base}/health`)
      const { status } = await axios.get(`${base}/health`, {
        timeout: testConnectionTimeoutMs(),
        validateStatus: () => true,
        headers: forwardHeadersForPython(req.user)
      })
      LOG.info(`Health check response status: ${status}`)
      const ok = status === 200
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: ok ? 'OK' : 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      })
      if (!ok) return req.reject(400, `HTTP ${status}`)
      return 'OK'
    } catch (e) {
      LOG.error(`Health check failed: ${e.message}`)
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      })
      return req.reject(500, `FAIL: ${operatorSafeHttpError(e, { phase: 'testConnection' })}`)
    }
  })

  this.on('syncTools', McpServers, async req => {
    const id = req.params[0]?.ID || req.params[0]
    const srv = await SELECT.one.from(McpServers).where({ ID: id })
    if (!srv) return req.reject(404, 'McpServer not found')
    /* Plan 07 B.3 — strict: only after Test connection (health === OK) */
    if (srv.health !== 'OK') {
      return req.reject(400, 'McpServer health must be OK. Run Test connection on this server first, then sync tools.')
    }
    let base
    try {
      base = await resolveMcpBaseUrl(srv)
    } catch (e) {
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      })
      return req.reject(400, operatorSafeHttpError(e))
    }

    try {
      const { data } = await axios.post(`${base}/mcp/tools/list`, {}, {
        timeout: syncToolsTimeoutMs(),
        headers: forwardHeadersForPython(req.user)
      })
      const tools = Array.isArray(data?.tools) ? data.tools : Array.isArray(data) ? data : []
      let n = 0
      const toolNames = []
      for (const t of tools) {
        const name = t.name || t.toolName
        if (!name) continue
        const existing = await SELECT.one.from(Tools).where({ server_ID: id, name })
        const row = {
          name,
          description: t.description || '',
          server_ID: id,
          inputSchema: typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema || {}),
          outputSchema: t.outputSchema
            ? typeof t.outputSchema === 'string'
              ? t.outputSchema
              : JSON.stringify(t.outputSchema)
            : '',
          riskLevel: 'Low',
          elevated: false,
          status: 'Draft',
          modifiedAt: new Date()
        }
        if (existing) {
          await UPDATE(Tools).set(row).where({ ID: existing.ID })
        } else {
          await INSERT.into(Tools).entries({ ...row, ID: cds.utils.uuid() })
        }
        n++
        toolNames.push(name)
      }
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: 'OK', lastHealthCheck: new Date() }).where({ ID: id })
      })
      if (n === 0) {
        return 'No tools were returned from the MCP. Check /mcp/tools/list and server logs.'
      }
      const maxList = 40
      if (n <= maxList) {
        return `Synced ${n} tool(s). Names: ${toolNames.join(', ')}`
      }
      return `Synced ${n} tool(s). Names: ${toolNames
        .slice(0, maxList)
        .join(', ')} …and ${n - maxList} more (open Tools catalog for the full list).`
    } catch (e) {
      await cds.tx(async () => {
        await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      })
      return req.reject(500, `Sync failed: ${operatorSafeHttpError(e, { phase: 'syncTools' })}`)
    }
  })

  this.on('runTest', Tools, async req => {
    if (!req.user?.is('Agent.Admin')) return req.reject(403, 'Admin only')
    const tid = req.params[0].ID
    const tool = await SELECT.one.from(Tools).where({ ID: tid })
    if (!tool) return req.reject(404, 'Tool not found')
    const mcp = await SELECT.one.from(McpServers).where({ ID: tool.server_ID })
    if (!mcp) return req.reject(404, 'McpServer not found')
    try {
      await resolveMcpBaseUrl(mcp)
    } catch (e) {
      return e.message || String(e)
    }
    let args = {}
    try {
      args = typeof req.data.args === 'string' ? JSON.parse(req.data.args || '{}') : req.data.args || {}
    } catch {
      args = {}
    }
    const { data } = await axios.post(
      `${PYTHON_URL()}/tool-test`,
      { toolName: tool.name, args },
      { timeout: 120000, headers: forwardHeadersForPython(req.user) }
    )
    return data?.result != null ? String(data.result) : JSON.stringify(data)
  })
})
