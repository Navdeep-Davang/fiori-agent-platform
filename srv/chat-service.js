const cds = require('@sap/cds')
const { SELECT } = cds.ql

module.exports = cds.service.impl(async function () {
  const { ChatMessages, ChatSessions } = this.entities

  this.before('CREATE', ChatMessages, async req => {
    const sid = req.data.session_ID
    if (!sid) return
    const session = await SELECT.one.from(ChatSessions).columns('userId').where({ ID: sid })
    if (!session) return req.reject(404, 'Chat session not found')
    if (session.userId !== req.user.id) return req.reject(403, 'Cannot post messages to this session')
  })
})
