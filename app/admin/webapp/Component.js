sap.ui.define(
    ["sap/ui/core/UIComponent", "sap/ui/model/json/JSONModel"],
    function (UIComponent, JSONModel) {
        "use strict";

        return UIComponent.extend("acp.admin.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                UIComponent.prototype.init.apply(this, arguments);

                var oData = {
                    user: {
                        displayName: "",
                        email: "",
                        roles: "",
                        dept: ""
                    },
                    /** Shell-visible OData status (governance V4 model). */
                    governanceError: "",
                    governanceMetadataFailed: false,
                    overviewLoading: false,
                    overviewError: "",
                    agentCapabilitiesError: "",
                    /** Non-blocking hint when OData loaded but there are no AgentTool/AgentSkill rows. */
                    agentCapabilitiesInfo: "",
                    /** OData failure loading Agents/Tools names for capability filter dropdowns. */
                    capabilityFilterListsError: "",
                    /** Shown as Table noData when the capability list is empty (filtered vs none in DB). */
                    agentCapabilitiesNoDataText: "",
                    /** Optional message when AgentGroups binding fails (shown on Access page). */
                    groupsPageError: "",
                    /** Table noData when AgentGroups list is empty or filtered out (or OData unavailable). */
                    groupsTableNoDataText:
                        "No access groups match the current filters, or none are defined in governance.",
                    mcpPageError: "",
                    agentToolCountError: "",
                    mcpServerFilterItems: [{ key: "", text: "All" }],
                    toolRiskFilterItems: [{ key: "", text: "All" }],
                    toolLifecycleFilterItems: [{ key: "", text: "All" }],
                    skillStatusFilterItems: [{ key: "", text: "All" }],
                    groupClaimKeyFilterItems: [{ key: "", text: "All" }],
                    groupStatusFilterItems: [{ key: "", text: "All" }],
                    playgroundSessionId: null,
                    playgroundStreaming: false,
                    mcpRowSelected: false,
                    /** Distinct status / modelProfile from Agents OData (fallback: All only). */
                    agentStatusFilterItems: [{ key: "", text: "All" }],
                    agentModelFilterItems: [{ key: "", text: "All" }],
                    agentsFilterError: "",
                    skillsFilterError: "",
                    agentNameFilterItems: [{ key: "", text: "All" }],
                    toolNameFilterItems: [{ key: "", text: "All" }],
                    skillNameFilterItems: [{ key: "", text: "All" }],
                    /** Populated after governance metadata; never bind Select to governance> directly (avoids layout errors if model missing). */
                    playgroundAgentSelectItems: [],
                    playgroundSelectedAgent: "",
                    /** Populated from OData: agent name → number of AgentTool rows. */
                    agentToolCountByName: {},
                    overview: {
                        mcpCount: 0,
                        draftToolCount: 0,
                        activeToolCount: 0,
                        agentCount: 0,
                        activeAgentCount: 0,
                        groupCount: 0,
                        skillCount: 0
                    },
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
                    agentCapabilities: [],
                    agentCapabilitiesFull: [],
                    playgroundMessages: [],
                    playgroundDraft: "",
                    playgroundSystemPrompt:
                        "You are a procurement assistant. Follow company policy and cite tools when used.",
                    playgroundTemperature: 0.7
                };

                this.setModel(new JSONModel(oData), "ui");
                /** Shell-only flags (global MessageStrip); `ui>/governanceError` is mirrored for formatters. */
                this.setModel(
                    new JSONModel({
                        governanceError: "",
                        governanceLoading: false
                    }),
                    "appState"
                );

                var that = this
                fetch("/api/session", { credentials: "include" })
                    .then(function (r) {
                        return r.ok ? r.json() : null
                    })
                    .then(function (j) {
                        if (!j) return
                        var m = that.getModel("ui")
                        if (!m) return
                        m.setProperty("/user/displayName", j.displayName || j.id || "")
                        m.setProperty("/user/email", j.email || "")
                        m.setProperty("/user/roles", j.roles || "")
                        m.setProperty("/user/dept", j.dept || "")
                    })
                    .catch(function () {
                        /* Anonymous or session API unavailable — header stays empty */
                    })
            }
        });
    }
);
