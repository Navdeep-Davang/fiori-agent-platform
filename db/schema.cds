namespace acp;

// ─── MCP Server ──────────────────────────────────────────────────────────────

entity McpServer {
  key ID              : UUID;
  name                : String(100);
  description         : String(500);
  destinationName     : String(200);
  baseUrl             : String(500);
  authType            : String enum { None; Destination; CredentialStore };
  transportType       : String enum { HTTP; stdio };
  environment         : String enum { dev; prod };
  ownerTeam           : String(100);
  status              : String(20) enum { Active; Disabled } default 'Active';
  health              : String(20) enum { OK; FAIL; UNKNOWN } default 'UNKNOWN';
  lastHealthCheck     : Timestamp;
  tools               : Composition of many Tool on tools.server = $self;
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

entity Tool {
  key ID              : UUID;
  name                : String(200);
  description         : LargeString;
  server              : Association to McpServer;
  inputSchema         : LargeString;
  outputSchema        : LargeString;
  riskLevel           : String(20) enum { Low; Medium; High } default 'Low';
  elevated            : Boolean default false;
  status              : String(20) enum { Draft; Active; Disabled } default 'Draft';
  modifiedAt          : Timestamp;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

entity Agent {
  key ID              : UUID;
  name                : String(100);
  description         : String(500);
  systemPrompt        : LargeString;
  modelProfile        : String(20) enum { Fast; Quality } default 'Fast';
  identityMode        : String(20) enum { Delegated; Mixed } default 'Delegated';
  status              : String(20) enum { Draft; Active; Archived } default 'Draft';
  createdBy           : String(200);
  tools               : Composition of many AgentTool on tools.agent = $self;
}

entity AgentTool {
  key ID                : UUID;
  agent                 : Association to Agent;
  tool                  : Association to Tool;
  permissionOverride    : String(30) enum { Inherit; ForceDelegated; ForceElevated } default 'Inherit';
}

entity AgentGroup {
  key ID              : UUID;
  name                : String(100);
  description         : String(500);
  claimKey            : String(100);
  status              : String(20) enum { Active; Disabled } default 'Active';
  claimValues         : Composition of many AgentGroupClaimValue on claimValues.group = $self;
  agents              : Composition of many AgentGroupAgent on agents.group = $self;
}

entity AgentGroupClaimValue {
  key ID              : UUID;
  group               : Association to AgentGroup;
  value               : String(200);
}

entity AgentGroupAgent {
  key ID              : UUID;
  group               : Association to AgentGroup;
  agent               : Association to Agent;
}

entity ChatSession {
  key ID              : UUID;
  agentId             : UUID;
  userId              : String(200);
  title               : String(200);
  createdAt           : Timestamp;
  updatedAt           : Timestamp;
  messages            : Composition of many ChatMessage on messages.session = $self;
}

entity ChatMessage {
  key ID              : UUID;
  session             : Association to ChatSession;
  role                : String(20) enum { user; assistant };
  content             : LargeString;
  timestamp           : Timestamp;
  toolCalls           : Composition of many ToolCallRecord on toolCalls.message = $self;
}

entity ToolCallRecord {
  key ID              : UUID;
  message             : Association to ChatMessage;
  toolName            : String(200);
  arguments           : LargeString;
  resultSummary       : LargeString;
  durationMs          : Integer;
  elevatedUsed        : Boolean default false;
  timestamp           : Timestamp;
}
