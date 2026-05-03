using acp from '../db/schema';

service ChatService @(path: '/odata/v4/chat') {

  @(restrict: [
    { grant: ['READ'], to: ['Agent.User'], where: 'userId = $user' },
    { grant: ['CREATE'], to: ['Agent.User'] },
    { grant: ['UPDATE'], to: ['Agent.User'], where: 'userId = $user' },
    { grant: ['DELETE'], to: ['Agent.User'], where: 'userId = $user' }
  ])
  entity ChatSessions as projection on acp.ChatSession;

  @(restrict: [
    { grant: ['READ'], to: ['Agent.User'], where: 'session.userId = $user' },
    { grant: ['CREATE'], to: ['Agent.User'] }
  ])
  entity ChatMessages as projection on acp.ChatMessage;

  @(restrict: [
    { grant: ['READ'], to: ['Agent.User'], where: 'message.session.userId = $user' }
  ])
  entity ToolCallRecords as projection on acp.ToolCallRecord;
}
