/**
 * Operator-safe messages for outbound HTTP from governance actions (testConnection, syncTools).
 * D.3: avoid raw axios stack traces in API responses; optional hostname masking in production.
 */
function maskEnabled() {
  const v = process.env.ACP_MASK_HOSTS_IN_ERRORS
  return v === 'true' || v === '1'
}

/**
 * Map Node/axios errors to a short string for req.reject() and logs.
 * @param {Error} err
 * @param {object} [ctx] e.g. { phase: 'syncTools' }
 */
function operatorSafeHttpError(err, ctx = {}) {
  if (!err) return 'Unknown error'
  const code = err.code
  const msg = String(err.message || err)
  const lower = msg.toLowerCase()

  if (code === 'ECONNABORTED' || lower.includes('timeout') || err.code === 'ETIMEDOUT') {
    if (ctx.phase === 'syncTools') {
      return (
        'Sync tools timed out. The MCP may have many tools or be slow. Try again, increase ACP_SYNC_TOOLS_TIMEOUT_MS, or check the server.'
      )
    }
    return 'Health check timed out. The MCP may be slow or not responding; try again or check the server.'
  }
  if (code === 'ECONNREFUSED') {
    return 'Connection refused — nothing is listening at the target URL, or the port is wrong. Verify the process and the McpServer base URL/destination.'
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'Host name could not be resolved. Check the URL, BTP destination name, and network/DNS.'
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return 'Connection was reset by the remote end. Check the MCP service and any TLS/proxy in front of it.'
  }

  if (maskEnabled()) {
    return 'Remote service error. Check the MCP base URL, destination, and that the process is up. (Details hidden when ACP_MASK_HOSTS_IN_ERRORS is set.)'
  }

  const short = msg.length > 400 ? msg.slice(0, 400) + '…' : msg
  return short
}

function syncToolsTimeoutMs() {
  const n = Number(process.env.ACP_SYNC_TOOLS_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 120000
}

function testConnectionTimeoutMs() {
  const n = Number(process.env.ACP_TEST_CONNECTION_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 15000
}

module.exports = {
  operatorSafeHttpError,
  maskEnabled,
  syncToolsTimeoutMs,
  testConnectionTimeoutMs
}
