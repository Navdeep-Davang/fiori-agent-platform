using GovernanceService as service from '../../../srv/governance-service';

// ── McpServers ────────────────────────────────────────────────────────────

annotate service.McpServers with @(
  UI.SelectionFields: [ name, transportType, environment, health, status ],
  UI.LineItem: [
    { Value: name, Label: '{i18n>Name}' },
    { Value: destinationName, Label: '{i18n>Destination}' },
    { Value: transportType, Label: '{i18n>Transport}' },
    { Value: environment, Label: '{i18n>Environment}' },
    {
      Value: health,
      Criticality: (health = 'OK' ? 3 : (health = 'FAIL' ? 1 : 2)),
      Label: '{i18n>Health}'
    },
    { Value: status, Label: '{i18n>Status}' },
    { Value: ownerTeam, Label: '{i18n>OwnerTeam}' },
    { Value: lastHealthCheck, Label: '{i18n>LastHealthCheck}' }
  ],
  UI.HeaderInfo: {
    TypeName: '{i18n>McpServer}',
    TypeNamePlural: '{i18n>McpServers}',
    Title: { Value: name },
    Description: { Value: description }
  },
  UI.Facets: [
    {
      $Type: 'UI.CollectionFacet',
      Label: '{i18n>GeneralInformation}',
      ID: 'GeneralInformation',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Connection', Label: '{i18n>Connection}' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Settings', Label: '{i18n>Settings}' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status', Label: '{i18n>Status}' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', Target: 'tools/@UI.LineItem', Label: '{i18n>Tools}' }
  ],
  UI.FieldGroup #Connection: {
    Data: [
      { Value: destinationName },
      { Value: baseUrl },
      { Value: authType },
      { Value: transportType }
    ]
  },
  UI.FieldGroup #Settings: {
    Data: [
      { Value: environment },
      { Value: ownerTeam }
    ]
  },
  UI.FieldGroup #Status: {
    Data: [
      {
        Value: health,
        Criticality: (health = 'OK' ? 3 : (health = 'FAIL' ? 1 : 2))
      },
      { Value: lastHealthCheck },
      { Value: status }
    ]
  },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'GovernanceService.testConnection', Label: '{i18n>TestConnection}' },
    { $Type: 'UI.DataFieldForAction', Action: 'GovernanceService.syncTools', Label: '{i18n>SyncTools}' }
  ]
);

annotate service.McpServers with {
  status @Common.ValueListWithFixedValues: true;
}

// ── Tools ─────────────────────────────────────────────────────────────────

annotate service.Tools with @(
  UI.SelectionFields: [ name, server_ID, riskLevel, status ],
  UI.LineItem: [
    { Value: name, Label: '{i18n>Name}' },
    { Value: server.name, Label: '{i18n>McpServer}' },
    {
      Value: riskLevel,
      Criticality: (riskLevel = 'Low' ? 3 : (riskLevel = 'Medium' ? 2 : 1)),
      Label: '{i18n>RiskLevel}'
    },
    { Value: elevated, Label: '{i18n>Elevated}' },
    { Value: status, Label: '{i18n>Status}' },
    { Value: modifiedAt, Label: '{i18n>ModifiedAt}' }
  ],
  UI.HeaderInfo: {
    TypeName: '{i18n>Tool}',
    TypeNamePlural: '{i18n>Tools}',
    Title: { Value: name },
    Description: { Value: description }
  },
  UI.Facets: [
    {
      $Type: 'UI.CollectionFacet',
      Label: '{i18n>GeneralInformation}',
      ID: 'GeneralInformation',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Details', Label: '{i18n>Details}' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Governance', Label: '{i18n>Governance}' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Schema', Label: '{i18n>Schema}' }
  ],
  UI.FieldGroup #Details: {
    Data: [
      { Value: name },
      { Value: server_ID },
      { Value: status },
      { Value: modifiedAt }
    ]
  },
  UI.FieldGroup #Governance: {
    Data: [
      {
        Value: riskLevel,
        Criticality: (riskLevel = 'Low' ? 3 : (riskLevel = 'Medium' ? 2 : 1))
      },
      { Value: elevated }
    ]
  },
  UI.FieldGroup #Schema: {
    Data: [
      { Value: inputSchema },
      { Value: outputSchema }
    ]
  },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'GovernanceService.runTest', Label: '{i18n>RunTest}' }
  ]
);

annotate service.Tools with {
  inputSchema @UI.MultiLineText: true;
  outputSchema @UI.MultiLineText: true;
  status @Common.ValueListWithFixedValues: true;
  riskLevel @Common.ValueListWithFixedValues: true;
}

// ── Agents ────────────────────────────────────────────────────────────────

annotate service.Agents with @(
  UI.SelectionFields: [ name, status, modelProfile ],
  UI.LineItem: [
    { Value: name, Label: '{i18n>Name}' },
    { Value: description, Label: '{i18n>Description}' },
    { Value: modelProfile, Label: '{i18n>ModelProfile}' },
    { Value: status, Label: '{i18n>Status}' },
    { Value: createdBy, Label: '{i18n>CreatedBy}' }
  ],
  UI.HeaderInfo: {
    TypeName: '{i18n>Agent}',
    TypeNamePlural: '{i18n>Agents}',
    Title: { Value: name },
    Description: { Value: description }
  },
  UI.Facets: [
    {
      $Type: 'UI.CollectionFacet',
      Label: '{i18n>GeneralInformation}',
      ID: 'GeneralInformation',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#BasicInfo', Label: '{i18n>BasicInfo}' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#SystemPrompt', Label: '{i18n>SystemPrompt}' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', Target: 'tools/@UI.LineItem', Label: '{i18n>ToolAssignments}' },
    { $Type: 'UI.ReferenceFacet', Target: 'groups/@UI.LineItem', Label: '{i18n>GroupMembership}' }
  ],
  UI.FieldGroup #BasicInfo: {
    Data: [
      { Value: name },
      { Value: description },
      { Value: modelProfile },
      { Value: identityMode },
      { Value: status },
      { Value: createdBy }
    ]
  },
  UI.FieldGroup #SystemPrompt: {
    Data: [
      { Value: systemPrompt }
    ]
  }
);

annotate service.Agents with {
  systemPrompt @UI.MultiLineText: true;
  status @Common.ValueListWithFixedValues: true;
  modelProfile @Common.ValueListWithFixedValues: true;
  identityMode @Common.ValueListWithFixedValues: true;
}

annotate service.AgentTools with @(
  UI.LineItem: [
    { Value: tool.name, Label: '{i18n>Tool}' },
    {
      Value: tool.riskLevel,
      Criticality: (tool.riskLevel = 'Low' ? 3 : (tool.riskLevel = 'Medium' ? 2 : 1)),
      Label: '{i18n>RiskLevel}'
    },
    { Value: tool.elevated, Label: '{i18n>Elevated}' },
    { Value: permissionOverride, Label: '{i18n>PermissionOverride}' }
  ]
);

// ── AgentGroups ───────────────────────────────────────────────────────────

annotate service.AgentGroups with @(
  UI.SelectionFields: [ name, claimKey, status ],
  UI.LineItem: [
    { Value: name, Label: '{i18n>Name}' },
    { Value: claimKey, Label: '{i18n>ClaimKey}' },
    { Value: status, Label: '{i18n>Status}' }
  ],
  UI.HeaderInfo: {
    TypeName: '{i18n>AgentGroup}',
    TypeNamePlural: '{i18n>AgentGroups}',
    Title: { Value: name },
    Description: { Value: description }
  },
  UI.Facets: [
    {
      $Type: 'UI.CollectionFacet',
      Label: '{i18n>ClaimMapping}',
      ID: 'ClaimMapping',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Details', Label: '{i18n>Details}' },
        { $Type: 'UI.ReferenceFacet', Target: 'claimValues/@UI.LineItem', Label: '{i18n>ClaimValues}' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', Target: 'agents/@UI.LineItem', Label: '{i18n>AgentAssignments}' }
  ],
  UI.FieldGroup #Details: {
    Data: [
      { Value: name },
      { Value: description },
      { Value: claimKey },
      { Value: status }
    ]
  }
);

annotate service.AgentGroupClaimValues with @(
  UI.LineItem: [
    { Value: value, Label: '{i18n>ClaimValue}' }
  ]
);

annotate service.AgentGroupAgents with @(
  UI.LineItem: [
    { Value: agent.name, Label: '{i18n>Agent}' },
    { Value: agent.status, Label: '{i18n>Status}' },
    { Value: agent.modelProfile, Label: '{i18n>ModelProfile}' }
  ]
);
