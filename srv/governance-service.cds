using acp from '../db/schema';

service GovernanceService @(path: '/odata/v4/governance') {

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Author', 'Agent.Admin', 'Agent.Audit'] },
    { grant: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], to: ['Agent.Admin'] }
  ])
  entity McpServers as projection on acp.McpServer actions {
    action testConnection() returns String;
    action syncTools()      returns String;
  };

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Author', 'Agent.Admin', 'Agent.Audit'] },
    { grant: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], to: ['Agent.Admin'] }
  ])
  entity Tools as projection on acp.Tool actions {
    @(requires: 'Agent.Admin')
    action runTest(args: LargeString) returns LargeString;
  };

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Author', 'Agent.Admin', 'Agent.Audit'] },
    { grant: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], to: ['Agent.Author', 'Agent.Admin'] }
  ])
  entity Agents as projection on acp.Agent;

  entity AgentTools as projection on acp.AgentTool;

  @(restrict: [
    { grant: ['READ'], to: ['Agent.Admin', 'Agent.Audit'] },
    { grant: ['WRITE', 'CREATE', 'UPDATE', 'DELETE'], to: ['Agent.Admin'] }
  ])
  entity AgentGroups as projection on acp.AgentGroup;

  entity AgentGroupClaimValues as projection on acp.AgentGroupClaimValue;
  entity AgentGroupAgents       as projection on acp.AgentGroupAgent;
}
