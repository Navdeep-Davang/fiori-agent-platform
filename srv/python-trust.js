/** Role names from CDS User (roles map scope keys to truthy values). */
function userRolesList(user) {
  const r = user?.roles
  if (!r) return []
  return Object.keys(r).filter(k => r[k])
}

/**
 * Headers CAP sends to Python on the private hop (defense in depth + user context).
 * Set ACP_INTERNAL_TOKEN in CAP env; Python must match on X-Internal-Token when configured.
 */
function forwardHeadersForPython(user) {
  const h = {
    'X-AC-User-Id': user?.id || '',
    'X-AC-Dept': String(user?.attr?.dept ?? user?.attr?.Dept ?? ''),
    'X-AC-Roles': JSON.stringify(userRolesList(user))
  }
  const tok = process.env.ACP_INTERNAL_TOKEN || ''
  if (tok) h['X-Internal-Token'] = tok
  return h
}

module.exports = { forwardHeadersForPython, userRolesList }
