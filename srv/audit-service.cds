using acp from '../db/schema';

/**
 * Read-only chat audit surface for Agent.Audit only.
 * End-user chat uses ChatService; auditors must not use ChatService for cross-user reads.
 */
service AuditService @(path: '/odata/v4/audit') {

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Audit'] }
  ])
  entity AuditedChatSessions as projection on acp.ChatSession;

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Audit'] }
  ])
  entity AuditedChatMessages as projection on acp.ChatMessage;

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Audit'] }
  ])
  entity AuditedToolCallRecords as projection on acp.ToolCallRecord;
}
