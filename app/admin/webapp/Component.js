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
                        groupCount: 3,
                        skillCount: 0
                    },
                    servers: [],
                    serversFull: [],
                    tools: [],
                    toolsFull: [],
                    agents: [],
                    agentsFull: [],
                    agentToolsFull: [],
                    /** Skill-mediated tool exposure (mock); complements AgentTool allowlist. */
                    agentSkillToolLinksFull: [],
                    /** Unified view: built from agentToolsFull + agentSkillToolLinksFull in controller. */
                    agentCapabilities: [],
                    skills: [],
                    skillsFull: [],
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
                    filterSkills: {
                        search: "",
                        status: ""
                    },
                    filterAgentCapabilities: {
                        agent: "",
                        routeType: "",
                        tool: "",
                        skill: "",
                        search: ""
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
                oData.agentSkillToolLinksFull = [
                    {
                        agentName: "Procurement Assistant",
                        skillName: "Procurement vendor intake SOP",
                        toolName: "create_purchase_requisition",
                        governanceNote:
                            "Procedure body references PR fields; runtime loads full markdown on demand (architecture §13.1)."
                    },
                    {
                        agentName: "Finance Copilot",
                        skillName: "Finance month-end checklist",
                        toolName: "kb_search",
                        governanceNote: "Skill prescribes citation steps before calling kb_search."
                    }
                ];
                oData.skillsFull = [
                    {
                        name: "Procurement vendor intake SOP",
                        description:
                            "Progressive disclosure: short summary for the planner; full markdown for execution.",
                        status: "Active",
                        modifiedAt: "2026-04-20 14:05 (mock)",
                        body: "## Vendor intake\n1. Confirm policy…\n2. Call lookup_vendor…\n_(mock markdown)_"
                    },
                    {
                        name: "Finance month-end checklist",
                        description: "Month-end close narrative and kb_search usage guardrails.",
                        status: "Draft",
                        modifiedAt: "2026-04-19 11:40 (mock)",
                        body: "## Close\n- Reconcile…\n_(mock)_"
                    },
                    {
                        name: "IT ticket triage playbook",
                        description: "Disabled template for helpdesk (not assigned in mock data).",
                        status: "Disabled",
                        modifiedAt: "2026-03-01 09:00 (mock)",
                        body: "_(mock)_"
                    }
                ];
                oData.skills = clone(oData.skillsFull);
                oData.overview.skillCount = oData.skillsFull.length;

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
