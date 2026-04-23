sap.ui.define(
    ["sap/ui/core/UIComponent", "sap/ui/model/json/JSONModel"],
    function (UIComponent, JSONModel) {
        "use strict";

        function clone(a) {
            return JSON.parse(JSON.stringify(a));
        }

        return UIComponent.extend("acp.admin.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                UIComponent.prototype.init.apply(this, arguments);

                var oData = {
                    user: {
                        displayName: "Jamie Chen",
                        email: "jamie.chen@example.com",
                        roles: "Agent.Admin, Agent.User",
                        dept: "procurement"
                    },
                    overview: {
                        mcpCount: 2,
                        draftToolCount: 1,
                        activeToolCount: 4,
                        agentCount: 3,
                        activeAgentCount: 2,
                        groupCount: 3
                    },
                    servers: [],
                    serversFull: [],
                    tools: [],
                    toolsFull: [],
                    agents: [],
                    agentsFull: [],
                    agentTools: [],
                    agentToolsFull: [],
                    groups: [],
                    groupsFull: [],
                    filterTools: {
                        search: "",
                        server: "",
                        risk: "",
                        lifecycle: "",
                        elevated: ""
                    },
                    filterAgents: {
                        search: "",
                        status: "",
                        model: "",
                        dept: ""
                    },
                    filterAgentTools: {
                        agent: "",
                        tool: "",
                        approved: "",
                        permissionOverride: ""
                    },
                    filterGroups: {
                        search: "",
                        claimKey: "",
                        status: ""
                    },
                    playgroundMessages: [
                        {
                            author: "System",
                            text: "Mock playground: messages are local only until chat wiring is enabled."
                        }
                    ],
                    playgroundDraft: "",
                    playgroundSystemPrompt:
                        "You are a procurement assistant. Follow company policy and cite tools when used.",
                    playgroundTemperature: 0.7
                };

                oData.serversFull = [
                    {
                        name: "Procurement Data MCP",
                        destinationName: "PYTHON_MCP_SERVICE",
                        baseUrl: "http://localhost:8000",
                        transportType: "HTTP",
                        environment: "dev",
                        ownerTeam: "IT Platform",
                        health: "UNKNOWN",
                        status: "Active",
                        lastSync: "— (mock)"
                    },
                    {
                        name: "Knowledge Base MCP",
                        destinationName: "PYTHON_MCP_SERVICE",
                        baseUrl: "http://localhost:8000",
                        transportType: "HTTP",
                        environment: "dev",
                        ownerTeam: "IT Platform",
                        health: "OK",
                        status: "Active",
                        lastSync: "2026-04-20 09:12 (mock)"
                    }
                ];
                oData.servers = clone(oData.serversFull);

                oData.toolsFull = [
                    {
                        name: "lookup_vendor",
                        serverName: "Procurement Data MCP",
                        riskLevel: "Low",
                        elevated: false,
                        status: "Active"
                    },
                    {
                        name: "create_purchase_requisition",
                        serverName: "Procurement Data MCP",
                        riskLevel: "Medium",
                        elevated: false,
                        status: "Active"
                    },
                    {
                        name: "kb_search",
                        serverName: "Knowledge Base MCP",
                        riskLevel: "Low",
                        elevated: false,
                        status: "Draft"
                    },
                    {
                        name: "run_sql_readonly",
                        serverName: "Procurement Data MCP",
                        riskLevel: "High",
                        elevated: true,
                        status: "Disabled"
                    }
                ];
                oData.tools = clone(oData.toolsFull);

                oData.agentsFull = [
                    {
                        name: "Procurement Assistant",
                        modelProfile: "Quality",
                        identityMode: "Delegated",
                        status: "Active",
                        assignedTools: 2,
                        deptGate: "procurement"
                    },
                    {
                        name: "Finance Copilot",
                        modelProfile: "Fast",
                        identityMode: "Mixed",
                        status: "Draft",
                        assignedTools: 0,
                        deptGate: "finance"
                    },
                    {
                        name: "IT Helpdesk Agent",
                        modelProfile: "Fast",
                        identityMode: "Delegated",
                        status: "Archived",
                        assignedTools: 1,
                        deptGate: "it"
                    }
                ];
                oData.agents = clone(oData.agentsFull);

                oData.agentToolsFull = [
                    {
                        agentName: "Procurement Assistant",
                        toolName: "lookup_vendor",
                        permissionOverride: "Inherit",
                        approved: true,
                        lastReviewed: "2026-04-18"
                    },
                    {
                        agentName: "Procurement Assistant",
                        toolName: "create_purchase_requisition",
                        permissionOverride: "ForceDelegated",
                        approved: true,
                        lastReviewed: "2026-04-18"
                    },
                    {
                        agentName: "IT Helpdesk Agent",
                        toolName: "kb_search",
                        permissionOverride: "Inherit",
                        approved: false,
                        lastReviewed: "—"
                    }
                ];
                oData.agentTools = clone(oData.agentToolsFull);

                oData.groupsFull = [
                    {
                        name: "Department — Procurement",
                        claimKey: "dept",
                        status: "Active",
                        claimValues: "procurement, finance, it",
                        assignedAgents: "Procurement Assistant, Finance Copilot"
                    },
                    {
                        name: "Elevated tools — break-glass",
                        claimKey: "role",
                        status: "Active",
                        claimValues: "Agent.Admin",
                        assignedAgents: "Procurement Assistant"
                    },
                    {
                        name: "Pilot — sandbox",
                        claimKey: "dept",
                        status: "Disabled",
                        claimValues: "sandbox",
                        assignedAgents: "—"
                    }
                ];
                oData.groups = clone(oData.groupsFull);

                this.setModel(new JSONModel(oData), "mock");
            }
        });
    }
);
