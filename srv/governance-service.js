const cds = require('@sap/cds')
const axios = require('axios')
const { getDestination } = require('@sap-cloud-sdk/connectivity')
const { SELECT, INSERT, UPDATE } = cds.ql

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
  if (server.baseUrl?.trim()) return server.baseUrl.replace(/\/$/, '')
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

  this.on('testConnection', McpServers, async req => {
    const id = req.params[0].ID
    const srv = await SELECT.one.from(McpServers).where({ ID: id })
    if (!srv) return req.reject(404, 'McpServer not found')
    let base
    try {
      base = await resolveMcpBaseUrl(srv)
    } catch (e) {
      await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      return e.message || String(e)
    }
    try {
      const { status } = await axios.get(`${base}/health`, { timeout: 15000, validateStatus: () => true })
      const ok = status === 200
      await UPDATE(McpServers).set({ health: ok ? 'OK' : 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      return ok ? 'OK' : `HTTP ${status}`
    } catch (e) {
      await UPDATE(McpServers).set({ health: 'FAIL', lastHealthCheck: new Date() }).where({ ID: id })
      return `FAIL: ${e.message}`
    }
  })

  this.on('syncTools', McpServers, async req => {
    const id = req.params[0].ID
    const srv = await SELECT.one.from(McpServers).where({ ID: id })
    if (!srv) return req.reject(404, 'McpServer not found')
    const base = await resolveMcpBaseUrl(srv)
    const { data } = await axios.post(`${base}/mcp/tools/list`, {}, { timeout: 60000 })
    const tools = Array.isArray(data?.tools) ? data.tools : Array.isArray(data) ? data : []
    let n = 0
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
    }
    return `Synced ${n} tools`
  })

  this.on('runTest', Tools, async req => {
    if (!req.user?.is('Agent.Admin')) return req.reject(403, 'Admin only')
    const tid = req.params[0].ID
    const tool = await SELECT.one.from(Tools).where({ ID: tid })
    if (!tool) return req.reject(404, 'Tool not found')
    const mcp = await SELECT.one.from(McpServers).where({ ID: tool.server_ID })
    if (!mcp) return req.reject(404, 'McpServer not found')
    const base = await resolveMcpBaseUrl(mcp)
    let args = {}
    try {
      args = typeof req.data.args === 'string' ? JSON.parse(req.data.args || '{}') : req.data.args || {}
    } catch {
      args = {}
    }
    const { data } = await axios.post(
      `${PYTHON_URL()}/tool-test`,
      { mcpServerUrl: base, toolName: tool.name, args },
      { timeout: 120000 }
    )
    return data?.result != null ? String(data.result) : JSON.stringify(data)
  })
})
