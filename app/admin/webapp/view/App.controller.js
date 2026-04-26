sap.ui.define(
    [
        "sap/ui/core/mvc/Controller",
        "sap/ui/core/ResizeHandler",
        "sap/m/MessageToast",
        "sap/m/MessageBox",
        "sap/m/library",
        "sap/ui/model/json/JSONModel",
        "sap/ui/model/Filter",
        "sap/ui/model/FilterOperator"
    ],
    function (Controller, ResizeHandler, MessageToast, MessageBox, mobileLibrary, JSONModel, Filter, FilterOperator) {
        "use strict";

        /** sap.m.URLHelper is not a standalone module (no sap/m/URLHelper.js on CDN); it lives on sap/m/library. */
        var URLHelper = mobileLibrary.URLHelper;

        function norm(s) {
            return (s || "").toLowerCase().trim();
        }

        /**
         * Populates ui /agentNameFilterItems and /toolNameFilterItems from governance Agents and Tools
         * (All + sorted names). Resets filter keys when the previous selection no longer exists.
         */
        function refreshCapabilityFilterAgentsAndToolsFromGovernance(oController) {
            var oView = oController.getView();
            var oGov = oView.getModel("governance");
            var m = oView.getModel("ui");
            if (!oGov || !m) {
                return Promise.resolve();
            }
            var that = oController;
            var fCap = m.getProperty("/filterAgentCapabilities") || {};
            var prevAgent = fCap.agent;
            var prevTool = fCap.tool;

            function itemsFromContexts(ctxs) {
                var items = [{ key: "", text: "All" }];
                var seen = {};
                ctxs.forEach(function (c) {
                    var nm = c.getProperty("name");
                    if (nm && !seen[nm]) {
                        seen[nm] = true;
                        items.push({ key: nm, text: nm });
                    }
                });
                var head = items[0];
                var rest = items.slice(1).sort(function (a, b) {
                    return a.text.localeCompare(b.text);
                });
                return [head].concat(rest);
            }

            var pAgents = oGov
                .bindList("/Agents", null, null, null, { $select: "name" })
                .requestContexts(0, 10000);
            var pTools = oGov
                .bindList("/Tools", null, null, null, { $select: "name" })
                .requestContexts(0, 10000);
            return Promise.all([pAgents, pTools])
                .then(function (res) {
                    m.setProperty("/capabilityFilterListsError", "");
                    m.setProperty("/agentNameFilterItems", itemsFromContexts(res[0]));
                    m.setProperty("/toolNameFilterItems", itemsFromContexts(res[1]));
                    if (prevAgent) {
                        var agItems = m.getProperty("/agentNameFilterItems") || [];
                        if (!agItems.some(function (x) { return x.key === prevAgent; })) {
                            m.setProperty("/filterAgentCapabilities/agent", "");
                        }
                    }
                    if (prevTool) {
                        var tItems = m.getProperty("/toolNameFilterItems") || [];
                        if (!tItems.some(function (x) { return x.key === prevTool; })) {
                            m.setProperty("/filterAgentCapabilities/tool", "");
                        }
                    }
                    oController._applyAgentCapabilityFilters();
                })
                .catch(function (err) {
                    m.setProperty(
                        "/capabilityFilterListsError",
                        "Agent / tool filter lists: " + that._governanceErrorText(err, "OData request failed")
                    );
                });
        }

        /** Below this width (px), playground uses tabs instead of side-by-side (360px + chat min). */
        var PLAYGROUND_TAB_BREAKPOINT = 960;
        return Controller.extend("acp.admin.view.App", {
            onInit: function () {
                var oNav = this.byId("mainNav");
                var oFirst = this.byId("pageOverview");
                if (oNav && oFirst) {
                    oNav.to(oFirst.getId(), false);
                }
                this.getView().setModel(
                    new JSONModel({
                        groupName: "",
                        claimKey: "",
                        claimValues: "",
                        assignedAgents: "",
                        mcpDlgName: "",
                        mcpDlgDestination: "",
                        mcpDlgBaseUrl: "",
                        mcpDlgTransport: "",
                        mcpDlgEnvironment: "",
                        agentDlgName: "",
                        agentDlgModel: "Quality",
                        agentDlgIdentity: "Delegated",
                        agentDlgDept: "",
                        agentDlgStatus: "Draft",
                        agentDlgTools: "0",
                        agentDlgToolsLabel: "—",
                        skillDlgName: "",
                        skillDlgDescription: "",
                        skillDlgStatus: "Draft",
                        skillDlgBody: "",
                        toolDlgName: "",
                        toolDlgDescription: "",
                        toolDlgRisk: "Low",
                        toolDlgElevated: false,
                        toolDlgStatus: "Draft"
                    }),
                    "uiDlg"
                );
                this._toolEditCtx = null;
                this._skillDlgMode = "new";
                this._skillEditOriginalName = null;
                this._mcpEditOriginalName = null;
                this._agentDlgMode = "new";
                this._agentEditOriginalName = null;
                this._groupEditOriginalName = null;
                this.getView().setModel(
                    new JSONModel({
                        playgroundUseTabs: false,
                        playgroundTabKey: "params"
                    }),
                    "uiShell"
                );
                this._playgroundResizeRegId = null;
                this.getView().addEventDelegate(
                    {
                        onAfterRendering: function () {
                            this._ensurePlaygroundResizeHandler();
                        }
                    },
                    this
                );
                this._applyToolFilters();
                this._applyAgentFilters();
                this._applySkillFilters();
                this._applyAgentCapabilityFilters();
                this._applyGroupFilters();
                this._setupGovernanceErrorHandling();
                this._seedPlaygroundI18nMessages();
                this._initGovernanceAfterMeta();
            },

            _i18n: function (sKey, aArgs) {
                var oI18n = this.getOwnerComponent() && this.getOwnerComponent().getModel("i18n");
                var rb = oI18n && oI18n.getResourceBundle && oI18n.getResourceBundle();
                if (!rb || !sKey) {
                    return sKey || "";
                }
                return rb.getText(sKey, aArgs);
            },

            /**
             * Native tooltips are short; long MCP descriptions are trimmed with a click hint.
             * Full text: click opens dlgToolDescription (see onToolDescriptionInfo).
             */
            formatToolDescriptionTooltip: function (s) {
                if (s == null) {
                    return "";
                }
                var t = String(s).replace(/\s+/g, " ").trim();
                if (!t) {
                    return "";
                }
                if (t.length > 500) {
                    return t.substring(0, 497) + "… (click for full text)";
                }
                return t;
            },

            _seedPlaygroundI18nMessages: function () {
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                m.setProperty("/playgroundMessages", [
                    {
                        author: this._i18n("PlaygroundSystemAuthor"),
                        text: this._i18n("PlaygroundSeedSystemMessage")
                    }
                ]);
                /* Avoid empty Select before governance metadata resolves (no governance> binding on control). */
                if (!m.getProperty("/playgroundAgentSelectItems") || !m.getProperty("/playgroundAgentSelectItems").length) {
                    m.setProperty("/playgroundAgentSelectItems", [
                        { key: "", text: this._i18n("PlaygroundAgentOptional") }
                    ]);
                }
            },

            _setPlaygroundAgentItemsUnavailable: function () {
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                m.setProperty("/playgroundAgentSelectItems", [
                    { key: "", text: this._i18n("MsgNotAvailable") }
                ]);
                m.setProperty("/playgroundSelectedAgent", "");
            },

            _governanceErrorText: function (oErr, fallback) {
                if (!oErr) {
                    return fallback || "Request failed";
                }
                if (oErr.message) {
                    return String(oErr.message);
                }
                if (oErr.statusText) {
                    return String(oErr.statusText);
                }
                return fallback || "Request failed";
            },

            /** Shared error display for OData actions, batch failures, and fetch rejections. */
            _showHttpError: function (err, title) {
                var msg = this._governanceErrorText(err);
                if (title) {
                    MessageBox.error(msg, { title: title });
                } else {
                    MessageToast.show(msg);
                }
            },

            _getAppStateModel: function () {
                var oView = this.getView();
                var oComp = this.getOwnerComponent && this.getOwnerComponent();
                return (oView && oView.getModel("appState")) || (oComp && oComp.getModel("appState"));
            },

            _setGovernanceLoading: function (b) {
                var app = this._getAppStateModel();
                if (app) {
                    app.setProperty("/governanceLoading", !!b);
                }
            },

            /** Global shell strip (`appState`) + mirrored `ui>/governanceError` for formatters and group noData. */
            _setGovernanceShellError: function (sMsg) {
                var s = sMsg == null ? "" : String(sMsg);
                var app = this._getAppStateModel();
                var m = this.getView().getModel("ui");
                if (app) {
                    app.setProperty("/governanceError", s);
                }
                if (m) {
                    m.setProperty("/governanceError", s);
                }
            },

            _setGovernanceUiError: function (sMsg) {
                this._setGovernanceShellError(sMsg);
            },

            _setupGovernanceErrorHandling: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                if (!oGov) {
                    return;
                }
                var that = this;
                /**
                 * OData V4 model does not support requestFailed / attachEvent("requestFailed").
                 * Failed reads bubble as dataReceived with an error parameter (see SAP doc "OData V4 Model").
                 */
                if (typeof oGov.attachDataReceived === "function") {
                    oGov.attachDataReceived(function (oEvent) {
                        var p = (oEvent && oEvent.getParameters && oEvent.getParameters()) || {};
                        if (!p.error) {
                            return;
                        }
                        var msg = that._governanceErrorText(p.error);
                        if (msg.indexOf("401") !== -1 || msg.toLowerCase().indexOf("unauthorized") !== -1) {
                            msg = "Session expired. Please log in again.";
                        }
                        that._setGovernanceShellError("Governance OData: " + msg);
                    });
                }
                /* OData V4: no parseError / requestFailed on model; metadata failures use getMetaModel().requestObject("/").catch(...) in _initGovernanceAfterMeta. */
            },

            onGlobalGovernanceErrorClose: function () {
                this._setGovernanceShellError("");
                this._setGovernanceLoading(false);
            },

            _initGovernanceAfterMeta: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !oGov.getMetaModel) {
                    if (m) {
                        m.setProperty("/governanceMetadataFailed", true);
                    }
                    this._setGovernanceShellError(
                        "Governance model not available. The admin shell is running, but OData is missing."
                    );
                    this._setGovernanceLoading(false);
                    this._setPlaygroundAgentItemsUnavailable();
                    return;
                }
                var that = this;
                this._setGovernanceLoading(true);
                oGov
                    .getMetaModel()
                    .requestObject("/")
                    .then(function () {
                        if (m) {
                            m.setProperty("/governanceMetadataFailed", false);
                            m.setProperty("/agentsFilterError", "");
                        }
                        that._setGovernanceShellError("");
                        that._setGovernanceLoading(false);
                        try {
                            that._refreshToolServerFilterItems();
                            that._refreshSkillStatusFilterFromGovernance();
                            that._refreshGroupClaimAndStatusFiltersFromGovernance();
                            that._refreshAgentFilterItemsFromGovernance();
                            that._refreshOverviewFromGovernance();
                            that._refreshAgentToolCountMap();
                            that._refreshPlaygroundAgentItems();
                            that._refreshAgentCapabilitiesFromGovernance();
                            that._applyToolFilters();
                            that._applyAgentFilters();
                            that._applySkillFilters();
                            that._applyGroupFilters();
                        } catch (eSync) {
                            that._setGovernanceShellError(
                                "Governance UI init failed after metadata: " +
                                    that._governanceErrorText(eSync, "unexpected error")
                            );
                        }
                    })
                    .catch(function (err) {
                        if (m) {
                            m.setProperty("/governanceMetadataFailed", true);
                        }
                        var msg = that._governanceErrorText(err);
                        if (msg.indexOf("401") !== -1 || msg.toLowerCase().indexOf("unauthorized") !== -1) {
                            msg = "Session expired or unauthorized. Please refresh the page or log in again.";
                        }
                        that._setGovernanceShellError("Governance metadata not loaded: " + msg);
                        that._setGovernanceLoading(false);
                        that._setPlaygroundAgentItemsUnavailable();
                    });
            },

            formatAgentsTableNoData: function (bMetaFailed, sGovError) {
                if (bMetaFailed || (sGovError && String(sGovError).trim())) {
                    return "Agents did not load from OData. Check the governance error banner, then refresh.";
                }
                return "No agents match the current filters. Clear filters or use New agent.";
            },

            formatSkillsTableNoData: function (bMetaFailed, sGovError) {
                if (bMetaFailed || (sGovError && String(sGovError).trim())) {
                    return "Skills did not load from OData. Check the governance error banner, then refresh.";
                }
                return "No skills match the current filters. Clear filters or use New skill.";
            },

            _refreshAgentFilterItemsFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                var fStatus = m.getProperty("/filterAgents/status") || "";
                var fModel = m.getProperty("/filterAgents/model") || "";
                oGov
                    .bindList("/Agents", null, null, null, { $select: "status,modelProfile" })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        m.setProperty("/agentsFilterError", "");
                        var seenS = {};
                        var seenM = {};
                        var statusItems = [{ key: "", text: "All" }];
                        var modelItems = [{ key: "", text: "All" }];
                        aCtx.forEach(function (c) {
                            var s = c.getProperty("status");
                            var mp = c.getProperty("modelProfile");
                            if (s && !seenS[s]) {
                                seenS[s] = true;
                                statusItems.push({ key: s, text: s });
                            }
                            if (mp && !seenM[mp]) {
                                seenM[mp] = true;
                                modelItems.push({ key: mp, text: mp });
                            }
                        });
                        var stRest = statusItems.slice(1).sort(function (a, b) {
                            return a.text.localeCompare(b.text);
                        });
                        statusItems.length = 1;
                        stRest.forEach(function (x) {
                            statusItems.push(x);
                        });
                        var mdRest = modelItems.slice(1).sort(function (a, b) {
                            return a.text.localeCompare(b.text);
                        });
                        modelItems.length = 1;
                        mdRest.forEach(function (x) {
                            modelItems.push(x);
                        });
                        m.setProperty("/agentStatusFilterItems", statusItems);
                        m.setProperty("/agentModelFilterItems", modelItems);
                        if (fStatus && !seenS[fStatus]) {
                            m.setProperty("/filterAgents/status", "");
                        }
                        if (fModel && !seenM[fModel]) {
                            m.setProperty("/filterAgents/model", "");
                        }
                        that._applyAgentFilters();
                    })
                    .catch(function (err) {
                        m.setProperty(
                            "/agentsFilterError",
                            "Could not load agent filter values: " + that._governanceErrorText(err)
                        );
                        m.setProperty("/agentStatusFilterItems", [{ key: "", text: "All" }]);
                        m.setProperty("/agentModelFilterItems", [{ key: "", text: "All" }]);
                        m.setProperty("/filterAgents/status", "");
                        m.setProperty("/filterAgents/model", "");
                        that._applyAgentFilters();
                    });
            },

            _refreshMcpServerFilterItems: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                var fPrev = m.getProperty("/filterTools") || {};
                oGov
                    .bindList("/McpServers", null, null, null, { $select: "name" })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        m.setProperty("/mcpPageError", "");
                        var items = [{ key: "", text: "All" }];
                        var seen = {};
                        aCtx.forEach(function (c) {
                            var nm = c.getProperty("name");
                            if (nm && !seen[nm]) {
                                seen[nm] = true;
                                items.push({ key: nm, text: nm });
                            }
                        });
                        m.setProperty("/mcpServerFilterItems", items);
                        if (fPrev.server) {
                            var found = false;
                            for (var j = 0; j < items.length; j++) {
                                if (items[j].key === fPrev.server) {
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                m.setProperty("/filterTools/server", "");
                            }
                        }
                    })
                    .catch(function (err) {
                        m.setProperty(
                            "/mcpPageError",
                            "Could not list MCP servers for filter: " + that._governanceErrorText(err)
                        );
                    });
            },

            /** Distinct non-empty values of `prop` from OData list contexts → Select items [{key,text}]. */
            _distinctKeyTextItemsFromContexts: function (aCtx, prop) {
                var seen = {};
                var items = [{ key: "", text: "All" }];
                (aCtx || []).forEach(function (c) {
                    var v = c.getProperty(prop);
                    if (v && !seen[v]) {
                        seen[v] = true;
                        items.push({ key: v, text: v });
                    }
                });
                var head = items[0];
                var rest = items.slice(1).sort(function (a, b) {
                    return a.text.localeCompare(b.text);
                });
                return [head].concat(rest);
            },

            _refreshToolFilterDistinctsFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                var fr = m.getProperty("/filterTools/risk") || "";
                var fl = m.getProperty("/filterTools/lifecycle") || "";
                oGov
                    .bindList("/Tools", null, null, null, { $select: "riskLevel,status" })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        var risks = that._distinctKeyTextItemsFromContexts(aCtx, "riskLevel");
                        var lifes = that._distinctKeyTextItemsFromContexts(aCtx, "status");
                        m.setProperty("/toolRiskFilterItems", risks);
                        m.setProperty("/toolLifecycleFilterItems", lifes);
                        var seenR = {};
                        risks.forEach(function (x) {
                            if (x.key) {
                                seenR[x.key] = true;
                            }
                        });
                        var seenL = {};
                        lifes.forEach(function (x) {
                            if (x.key) {
                                seenL[x.key] = true;
                            }
                        });
                        if (fr && !seenR[fr]) {
                            m.setProperty("/filterTools/risk", "");
                        }
                        if (fl && !seenL[fl]) {
                            m.setProperty("/filterTools/lifecycle", "");
                        }
                        that._applyToolFilters();
                    })
                    .catch(function () {
                        m.setProperty("/toolRiskFilterItems", [{ key: "", text: "All" }]);
                        m.setProperty("/toolLifecycleFilterItems", [{ key: "", text: "All" }]);
                    });
            },

            _refreshSkillStatusFilterFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                var prev = m.getProperty("/filterSkills/status") || "";
                oGov
                    .bindList("/Skills", null, null, null, { $select: "status" })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        var items = that._distinctKeyTextItemsFromContexts(aCtx, "status");
                        m.setProperty("/skillStatusFilterItems", items);
                        var seen = {};
                        items.forEach(function (x) {
                            if (x.key) {
                                seen[x.key] = true;
                            }
                        });
                        if (prev && !seen[prev]) {
                            m.setProperty("/filterSkills/status", "");
                        }
                        that._applySkillFilters();
                    })
                    .catch(function () {
                        m.setProperty("/skillStatusFilterItems", [{ key: "", text: "All" }]);
                    });
            },

            _refreshGroupClaimAndStatusFiltersFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                var prevK = m.getProperty("/filterGroups/claimKey") || "";
                var prevS = m.getProperty("/filterGroups/status") || "";
                oGov
                    .bindList("/AgentGroups", null, null, null, { $select: "claimKey,status" })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        var keys = that._distinctKeyTextItemsFromContexts(aCtx, "claimKey");
                        var stats = that._distinctKeyTextItemsFromContexts(aCtx, "status");
                        m.setProperty("/groupClaimKeyFilterItems", keys);
                        m.setProperty("/groupStatusFilterItems", stats);
                        var seenK = {};
                        keys.forEach(function (x) {
                            if (x.key) {
                                seenK[x.key] = true;
                            }
                        });
                        var seenS = {};
                        stats.forEach(function (x) {
                            if (x.key) {
                                seenS[x.key] = true;
                            }
                        });
                        if (prevK && !seenK[prevK]) {
                            m.setProperty("/filterGroups/claimKey", "");
                        }
                        if (prevS && !seenS[prevS]) {
                            m.setProperty("/filterGroups/status", "");
                        }
                        that._applyGroupFilters();
                    })
                    .catch(function () {
                        m.setProperty("/groupClaimKeyFilterItems", [{ key: "", text: "All" }]);
                        m.setProperty("/groupStatusFilterItems", [{ key: "", text: "All" }]);
                    });
            },

            _refreshAgentToolCountMap: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                var that = this;
                oGov
                    .bindList("/AgentTools", null, null, null, {
                        $expand: { agent: { $select: "name" } }
                    })
                    .requestContexts(0, 10000)
                    .then(function (aCtx) {
                        var byName = {};
                        aCtx.forEach(function (c) {
                            var o = c.getObject();
                            var n = o.agent && o.agent.name;
                            if (n) {
                                byName[n] = (byName[n] || 0) + 1;
                            }
                        });
                        m.setProperty("/agentToolCountByName", byName);
                    })
                    .catch(function (err) {
                        m.setProperty(
                            "/agentToolCountError",
                            "Tool counts: " + that._governanceErrorText(err)
                        );
                    });
            },

            _refreshPlaygroundAgentItems: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                var that = this;
                if (!oGov || !m) {
                    this._setPlaygroundAgentItemsUnavailable();
                    return;
                }
                if (m.getProperty("/governanceMetadataFailed")) {
                    this._setPlaygroundAgentItemsUnavailable();
                    return;
                }
                var opt = { key: "", text: this._i18n("PlaygroundAgentOptional") };
                oGov
                    .bindList("/Agents", null, null, null, { $select: "ID,name" })
                    .requestContexts(0, 5000)
                    .then(function (aCtx) {
                        var items = [opt];
                        aCtx.forEach(function (c) {
                            var id = c.getProperty("ID");
                            var n = c.getProperty("name");
                            if (id && n) {
                                items.push({ key: id, text: n });
                            }
                        });
                        m.setProperty("/playgroundAgentSelectItems", items);
                        var sel = m.getProperty("/playgroundSelectedAgent");
                        if (sel && !items.some(function (it) { return it.key === sel; })) {
                            m.setProperty("/playgroundSelectedAgent", "");
                        }
                    })
                    .catch(function (err) {
                        m.setProperty("/playgroundAgentSelectItems", [
                            { key: "", text: that._i18n("MsgCouldNotLoadData") },
                            {
                                key: "_err",
                                text: that._i18n("PlaygroundAgentsLoadFailed") + ": " + that._governanceErrorText(err)
                            }
                        ]);
                        m.setProperty("/playgroundSelectedAgent", "");
                    });
            },

            formatAgentToolCount: function (sAgentName) {
                if (!sAgentName) {
                    return "N/A";
                }
                var m = this.getView() && this.getView().getModel("ui");
                if (!m) {
                    return "N/A";
                }
                if (m.getProperty("/governanceError") || m.getProperty("/governanceMetadataFailed")) {
                    return "—";
                }
                var map = m.getProperty("/agentToolCountByName");
                if (!map || map[sAgentName] === undefined) {
                    return "N/A";
                }
                return String(map[sAgentName]);
            },

            /** Skill names for optional / future filters — derived from merged capability rows only. */
            _updateCapabilitySkillFilterItems: function (merged) {
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                function addUnique(arr, k, t) {
                    if (k == null || k === "" || k === "—") {
                        return;
                    }
                    if (!arr.some(function (o) { return o.key === k; })) {
                        arr.push({ key: k, text: t || k });
                    }
                }
                var skills = [{ key: "", text: "All" }];
                (merged || []).forEach(function (row) {
                    if (row.routeTypeKey === "Skill" && row.skillName && row.skillName !== "—") {
                        addUnique(skills, row.skillName, row.skillName);
                    }
                });
                var head = skills[0];
                var rest = skills.slice(1).sort(function (a, b) {
                    return a.text.localeCompare(b.text);
                });
                skills.length = 0;
                skills.push(head);
                rest.forEach(function (x) {
                    skills.push(x);
                });
                m.setProperty("/skillNameFilterItems", skills);
            },

            _refreshOverviewFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                m.setProperty("/overviewLoading", true);
                m.setProperty("/overviewError", "");
                function countEntity(sPath) {
                    var lb = oGov.bindList(sPath);
                    return lb.requestContexts(0, 10000).then(function (a) {
                        return a.length;
                    });
                }
                function countFilter(sPath, aFilters) {
                    var lb = oGov.bindList(sPath, undefined, undefined, aFilters);
                    return lb.requestContexts(0, 10000).then(function (a) {
                        return a.length;
                    });
                }
                var pMcp = countEntity("/McpServers");
                var pToolsDraft = countFilter("/Tools", [
                    new Filter("status", FilterOperator.EQ, "Draft")
                ]);
                var pToolsActive = countFilter("/Tools", [
                    new Filter("status", FilterOperator.EQ, "Active")
                ]);
                var pAgents = countEntity("/Agents");
                var pAgentsActive = countFilter("/Agents", [
                    new Filter("status", FilterOperator.EQ, "Active")
                ]);
                var pGroups = countEntity("/AgentGroups");
                var pSkills = countEntity("/Skills");
                var that = this;
                Promise.all([
                    pMcp,
                    pToolsDraft,
                    pToolsActive,
                    pAgents,
                    pAgentsActive,
                    pGroups,
                    pSkills
                ])
                    .then(function (vals) {
                        m.setProperty("/overview/mcpCount", vals[0]);
                        m.setProperty("/overview/draftToolCount", vals[1]);
                        m.setProperty("/overview/activeToolCount", vals[2]);
                        m.setProperty("/overview/agentCount", vals[3]);
                        m.setProperty("/overview/activeAgentCount", vals[4]);
                        m.setProperty("/overview/groupCount", vals[5]);
                        m.setProperty("/overview/skillCount", vals[6]);
                        m.setProperty("/overviewLoading", false);
                    })
                    .catch(function (err) {
                        m.setProperty("/overviewLoading", false);
                        m.setProperty(
                            "/overviewError",
                            "Overview counts failed: " + that._governanceErrorText(err, "OData request error")
                        );
                        that._setGovernanceShellError(
                            "Governance OData: overview counts failed — " +
                                that._governanceErrorText(err, "OData request error")
                        );
                    });
            },

            _refreshAgentCapabilitiesFromGovernance: function () {
                var oView = this.getView();
                var oGov = oView.getModel("governance");
                var m = oView.getModel("ui");
                if (!oGov || !m) {
                    return;
                }
                m.setProperty("/agentCapabilitiesError", "");
                m.setProperty("/agentCapabilitiesInfo", "");
                var lbAt = oGov.bindList("/AgentTools", null, null, null, {
                    $expand: { agent: { $select: "name" }, tool: { $select: "name" } }
                });
                var lbSk = oGov.bindList("/AgentSkills", null, null, null, {
                    $expand: { agent: { $select: "name" }, skill: { $select: "name" } }
                });
                var that = this;
                Promise.all([lbAt.requestContexts(0, 10000), lbSk.requestContexts(0, 10000)])
                    .then(function (res) {
                        var ctxAt = res[0];
                        var ctxSk = res[1];
                        if (!ctxAt.length && !ctxSk.length) {
                            m.setProperty(
                                "/agentCapabilitiesInfo",
                                "No AgentTool or AgentSkill rows in governance. Seed data or assign tools/skills in HANA."
                            );
                        }
                        var direct = ctxAt.map(function (c) {
                            var o = c.getObject();
                            return {
                                routeType: "Direct tool",
                                routeTypeKey: "Direct",
                                agentName: (o.agent && o.agent.name) || "—",
                                skillName: "—",
                                toolName: (o.tool && o.tool.name) || "—",
                                permissionOverride: o.permissionOverride || "Inherit",
                                approved: true,
                                lastReviewed: "—",
                                governanceNote: "AgentTool (OData)"
                            };
                        });
                        var via = ctxSk.map(function (c) {
                            var o = c.getObject();
                            return {
                                routeType: "Via skill",
                                routeTypeKey: "Skill",
                                agentName: (o.agent && o.agent.name) || "—",
                                skillName: (o.skill && o.skill.name) || "—",
                                toolName: "—",
                                permissionOverride: "—",
                                approved: true,
                                lastReviewed: "—",
                                governanceNote: "AgentSkill (OData)"
                            };
                        });
                        var merged = direct.concat(via);
                        m.setProperty("/agentCapabilitiesFull", merged);
                        that._updateCapabilitySkillFilterItems(merged);
                        that._applyAgentCapabilityFilters();
                    })
                    .catch(function (err) {
                        m.setProperty(
                            "/agentCapabilitiesError",
                            "Agent ↔ skills ↔ tools: " + that._governanceErrorText(err, "OData request failed")
                        );
                        m.setProperty("/agentCapabilitiesInfo", "");
                        m.setProperty("/agentCapabilitiesFull", []);
                        m.setProperty("/agentCapabilities", []);
                        that._applyAgentCapabilityFilters();
                        that._setGovernanceShellError(
                            "Governance OData: agent capabilities failed — " +
                                that._governanceErrorText(err, "OData request failed")
                        );
                    });
            },

            onExit: function () {
                if (this._playgroundAbortCtrl) {
                    try {
                        this._playgroundAbortCtrl.abort();
                    } catch (eAbort) {
                        /* ignore */
                    }
                    this._playgroundAbortCtrl = null;
                }
                if (this._playgroundResizeRegId) {
                    ResizeHandler.deregister(this._playgroundResizeRegId);
                    this._playgroundResizeRegId = null;
                }
            },

            _ensurePlaygroundResizeHandler: function () {
                if (this._playgroundResizeRegId) {
                    return;
                }
                var oShell = this.byId("playgroundShellHost");
                var el = oShell && oShell.getDomRef();
                if (!el) {
                    return;
                }
                var that = this;
                this._playgroundResizeRegId = ResizeHandler.register(el, function (m) {
                    that._applyPlaygroundShellLayout(m && m.size ? m.size.width : 0);
                });
                this._applyPlaygroundShellLayout(el.clientWidth);
            },

            _applyPlaygroundShellLayout: function (w) {
                var oShell = this.byId("playgroundShellHost");
                var el = oShell && oShell.getDomRef();
                if ((!w || w <= 0) && el) {
                    w = el.clientWidth;
                }
                var m = this.getView().getModel("uiShell");
                if (!m) {
                    return;
                }
                var useTabs = w > 0 && w < PLAYGROUND_TAB_BREAKPOINT;
                if (m.getProperty("/playgroundUseTabs") !== useTabs) {
                    m.setProperty("/playgroundUseTabs", useTabs);
                }
            },

            _playgroundUseTabs: function () {
                var m = this.getView().getModel("uiShell");
                return !!(m && m.getProperty("/playgroundUseTabs"));
            },

            _getPlaygroundInput: function () {
                return this._playgroundUseTabs() ? this.byId("playgroundInputTab") : this.byId("playgroundInput");
            },

            _getPlaygroundScroll: function () {
                return this._playgroundUseTabs() ? this.byId("playgroundScrollTab") : this.byId("playgroundScroll");
            },

            onSideNavSelect: function (oEvent) {
                var oItem = oEvent.getParameter("item");
                if (!oItem || typeof oItem.getKey !== "function") {
                    return;
                }
                var sKey = oItem.getKey();
                if (sKey === "logout") {
                    this.onLogoutPress();
                    return;
                }
                var oPage = this.byId(sKey);
                var oNav = this.byId("mainNav");
                if (oPage && oNav) {
                    oNav.to(oPage.getId(), false);
                }
                if (sKey === "pagePlayground") {
                    setTimeout(this._ensurePlaygroundResizeHandler.bind(this), 0);
                }
            },

            onLogoutPress: function () {
                URLHelper.redirect("/logout", false);
            },

            _nowMock: function () {
                var d = new Date();
                var pad = function (n) {
                    return n < 10 ? "0" + n : "" + n;
                };
                return (
                    d.getFullYear() +
                    "-" +
                    pad(d.getMonth() + 1) +
                    "-" +
                    pad(d.getDate()) +
                    " " +
                    pad(d.getHours()) +
                    ":" +
                    pad(d.getMinutes()) +
                    ":" +
                    pad(d.getSeconds())
                );
            },

            _getSelectedMcpContext: function () {
                var tbl = this.byId("tblMcp");
                var aCtx = tbl && tbl.getSelectedContexts();
                return aCtx && aCtx.length > 0 ? aCtx[0] : null;
            },

            _runMcpBoundAction: function (oCtx, sAction) {
                var oModel = oCtx.getModel();
                // Fully qualified name for CAP bound actions: GovernanceService.<action>(...)
                var op = oModel.bindContext("GovernanceService." + sAction + "(...)", oCtx);
                this._setGovernanceLoading(true);
                var that = this;
                return op.execute("$auto").then(
                    function () {
                        that._setGovernanceLoading(false);
                        var oResult = op.getBoundContext();
                        var v = oResult && oResult.getObject();
                        oModel.refresh();
                        setTimeout(function () {
                            that._syncMcpSelectionUi();
                        }, 0);
                        if (sAction === "syncTools" && typeof v === "string" && v.length) {
                            MessageBox.information(v, {
                                title: that._i18n("SyncTools") || "Sync tools"
                            });
                        } else {
                            MessageToast.show(typeof v === "string" ? v : sAction + " OK");
                        }
                        that._refreshToolServerFilterItems();
                        that._refreshOverviewFromGovernance();
                        that._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                        that._refreshAgentCapabilitiesFromGovernance();
                    },
                    function (err) {
                        that._setGovernanceLoading(false);
                        oModel.refresh();
                        setTimeout(function () {
                            that._syncMcpSelectionUi();
                        }, 0);
                        that._showHttpError(err, "MCP Action: " + sAction);
                    }
                );
            },

            /** After OData refresh, keep Sync tools enablement in sync with selected row health. */
            _syncMcpSelectionUi: function () {
                var c = this._getSelectedMcpContext();
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                m.setProperty("/mcpRowSelected", !!c);
                m.setProperty("/mcpSelectedHealth", c && c.getProperty("health") != null ? String(c.getProperty("health")) : "");
            },

            onMcpTestConnection: function () {
                var oCtx = this._getSelectedMcpContext();
                if (!oCtx) {
                    MessageToast.show("Select an MCP server row first.");
                    return;
                }
                this._runMcpBoundAction(oCtx, "testConnection");
            },
            onMcpSyncTools: function () {
                var oCtx = this._getSelectedMcpContext();
                if (!oCtx) {
                    MessageToast.show("Select an MCP server row first.");
                    return;
                }
                if (oCtx.getProperty("health") !== "OK") {
                    MessageToast.show("Run Test connection first (Health must be OK before Sync tools).");
                    return;
                }
                this._runMcpBoundAction(oCtx, "syncTools");
            },
            onMcpAddServer: function () {
                this._mcpEditCtx = null;
                this._mcpEditOriginalName = null;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/mcpDlgName", "");
                ui.setProperty("/mcpDlgDestination", "PYTHON_MCP_SERVICE");
                ui.setProperty("/mcpDlgBaseUrl", "http://localhost:8000");
                ui.setProperty("/mcpDlgTransport", "HTTP");
                ui.setProperty("/mcpDlgEnvironment", "dev");
                this.byId("dlgMcpServer").setTitle("New MCP server");
                this.byId("dlgMcpServer").open();
            },

            _applySkillFilters: function () {
                var oTable = this.byId("tblSkills");
                var oBinding = oTable && oTable.getBinding("items");
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                var f = m.getProperty("/filterSkills") || {};
                if (!oBinding || !oBinding.filter) {
                    return;
                }
                var a = [];
                if (f.status) {
                    a.push(new Filter("status", FilterOperator.EQ, f.status));
                }
                if (norm(f.search)) {
                    var sq = norm(f.search);
                    a.push(
                        new Filter({
                            filters: [
                                new Filter("name", FilterOperator.Contains, sq),
                                new Filter("description", FilterOperator.Contains, sq)
                            ],
                            and: false
                        })
                    );
                }
                oBinding.filter(a.length ? a : undefined);
            },

            _applyAgentCapabilityFilters: function () {
                var m = this.getView().getModel("ui");
                var all = m.getProperty("/agentCapabilitiesFull") || [];
                var f = m.getProperty("/filterAgentCapabilities") || {};
                var sq = norm(f.search);
                var out = all.filter(function (row) {
                    if (f.agent && row.agentName !== f.agent) {
                        return false;
                    }
                    if (f.routeType && row.routeTypeKey !== f.routeType) {
                        return false;
                    }
                    if (f.tool && row.toolName !== f.tool) {
                        return false;
                    }
                    if (f.skill && row.skillName !== f.skill) {
                        return false;
                    }
                    if (sq) {
                        var hay = norm(
                            (row.agentName || "") +
                                " " +
                                (row.skillName || "") +
                                " " +
                                (row.toolName || "") +
                                " " +
                                (row.permissionOverride || "") +
                                " " +
                                (row.governanceNote || "")
                        );
                        if (hay.indexOf(sq) === -1) {
                            return false;
                        }
                    }
                    return true;
                });
                m.setProperty("/agentCapabilities", out);
                var err = m.getProperty("/agentCapabilitiesError") || "";
                var info = m.getProperty("/agentCapabilitiesInfo") || "";
                var noData = "No mappings to show.";
                if (err) {
                    noData = "Could not load mappings. Fix the error above or check OData.";
                } else if (!all.length && info) {
                    noData = info;
                } else if (!all.length) {
                    noData = "No AgentTool or AgentSkill rows in governance yet.";
                } else if (!out.length) {
                    noData = "No rows match the current filters. Clear filters or adjust search.";
                }
                m.setProperty("/agentCapabilitiesNoDataText", noData);
            },

            onMcpRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                this._mcpEditCtx = oCtx;
                var o = oCtx.getObject();
                var ui = this.getView().getModel("uiDlg");
                this._mcpEditOriginalName = o.name;
                ui.setProperty("/mcpDlgName", o.name || "");
                ui.setProperty("/mcpDlgDestination", o.destinationName || "");
                ui.setProperty("/mcpDlgBaseUrl", o.baseUrl || "");
                ui.setProperty("/mcpDlgTransport", o.transportType || "");
                ui.setProperty("/mcpDlgEnvironment", o.environment || "");
                this.byId("dlgMcpServer").setTitle("Edit MCP server");
                this.byId("dlgMcpServer").open();
            },

            onMcpRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getProperty("name");
                oCtx
                    .delete("$auto")
                    .then(
                        function () {
                            MessageToast.show("Deleted MCP server: " + name);
                            this.getView().getModel("governance").refresh();
                            this._refreshToolServerFilterItems();
                            this._refreshOverviewFromGovernance();
                        }.bind(this),
                        function (err) {
                            this._showHttpError(err, "Delete MCP Server");
                        }.bind(this)
                    );
            },

            onMcpDlgSave: function () {
                var ui = this.getView().getModel("uiDlg");
                var n = (ui.getProperty("/mcpDlgName") || "").trim();
                if (!n) {
                    MessageToast.show("Name is required.");
                    return;
                }
                var oModel = this.getView().getModel("governance");
                var that = this;
                if (this._mcpEditCtx) {
                    this._mcpEditCtx.setProperty("name", n);
                    this._mcpEditCtx.setProperty("destinationName", ui.getProperty("/mcpDlgDestination") || "");
                    this._mcpEditCtx.setProperty("baseUrl", ui.getProperty("/mcpDlgBaseUrl") || "");
                    this._mcpEditCtx.setProperty("transportType", ui.getProperty("/mcpDlgTransport") || "HTTP");
                    this._mcpEditCtx.setProperty("environment", ui.getProperty("/mcpDlgEnvironment") || "dev");
                    oModel
                        .submitBatch("$auto")
                        .then(function () {
                            MessageToast.show("Saved MCP server: " + n);
                            that.byId("dlgMcpServer").close();
                            that._mcpEditCtx = null;
                            that._mcpEditOriginalName = null;
                            oModel.refresh();
                            that._refreshToolServerFilterItems();
                            that._refreshOverviewFromGovernance();
                        })
                        .catch(function (err) {
                            that._showHttpError(err, "Save MCP Server");
                        });
                    return;
                }
                var oList = oModel.bindList("/McpServers");
                oList.create(
                    {
                        name: n,
                        description: "",
                        destinationName: ui.getProperty("/mcpDlgDestination") || "",
                        baseUrl: ui.getProperty("/mcpDlgBaseUrl") || "",
                        authType: "Destination",
                        transportType: ui.getProperty("/mcpDlgTransport") || "HTTP",
                        environment: ui.getProperty("/mcpDlgEnvironment") || "dev",
                        ownerTeam: "IT Platform",
                        status: "Active",
                        health: "UNKNOWN"
                    },
                    true
                );
                oModel
                    .submitBatch("$auto")
                    .then(function () {
                        MessageToast.show("Created MCP server: " + n);
                        that.byId("dlgMcpServer").close();
                        oModel.refresh();
                        that._refreshToolServerFilterItems();
                        that._refreshOverviewFromGovernance();
                    })
                    .catch(function (err) {
                        that._showHttpError(err, "Create MCP Server");
                    });
            },

            onMcpDlgCancel: function () {
                this.byId("dlgMcpServer").close();
                this._mcpEditOriginalName = null;
                this._mcpEditCtx = null;
            },

            onMcpSelectionChange: function (oEvent) {
                var oTable = oEvent.getSource();
                var a = oTable.getSelectedContexts() || [];
                var oModel = this.getView().getModel("ui");
                if (!oModel) {
                    return;
                }
                oModel.setProperty("/mcpRowSelected", a.length > 0);
                oModel.setProperty(
                    "/mcpSelectedHealth",
                    a[0] && a[0].getProperty("health") != null ? String(a[0].getProperty("health")) : ""
                );
            },

            onToolsActivate: function () {
                MessageToast.show("Bulk activate: select tools in the table, then wire PATCH on Tools (future).");
            },
            onToolsSetRisk: function () {
                MessageToast.show("Bulk risk update: wire PATCH on Tools (future).");
            },

            onAgentsNew: function () {
                this._agentDlgMode = "new";
                this._agentEditCtx = null;
                this._agentEditOriginalName = null;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/agentDlgName", "");
                ui.setProperty("/agentDlgModel", "Quality");
                ui.setProperty("/agentDlgIdentity", "Delegated");
                ui.setProperty("/agentDlgDept", "");
                ui.setProperty("/agentDlgStatus", "Draft");
                ui.setProperty("/agentDlgTools", "0");
                ui.setProperty("/agentDlgToolsLabel", "0 (assign tools on Agent ↔ skills ↔ tools)");
                this.byId("dlgAgent").setTitle("New agent");
                this.byId("dlgAgent").open();
            },

            onAgentRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                this._agentEditCtx = oCtx;
                var o = oCtx.getObject();
                this._agentDlgMode = "edit";
                this._agentEditOriginalName = o.name;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/agentDlgName", o.name || "");
                ui.setProperty("/agentDlgModel", o.modelProfile || "Quality");
                ui.setProperty("/agentDlgIdentity", o.identityMode || "Delegated");
                ui.setProperty("/agentDlgDept", "");
                ui.setProperty("/agentDlgStatus", o.status || "Draft");
                ui.setProperty("/agentDlgTools", "0");
                ui.setProperty("/agentDlgToolsLabel", this.formatAgentToolCount(o.name));
                this.byId("dlgAgent").setTitle("Edit agent");
                this.byId("dlgAgent").open();
            },

            onAgentRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getProperty("name");
                var oModel = this.getView().getModel("governance");
                oCtx
                    .delete("$auto")
                    .then(
                        function () {
                            MessageToast.show("Deleted agent: " + name);
                            oModel.refresh();
                            this._refreshOverviewFromGovernance();
                            this._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                            this._refreshAgentCapabilitiesFromGovernance();
                            this._refreshAgentFilterItemsFromGovernance();
                        }.bind(this),
                        function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        }
                    )
                    .catch(function (err) {
                        MessageToast.show((err && err.message) || String(err));
                    });
            },

            onAgentDlgSave: function () {
                var ui = this.getView().getModel("uiDlg");
                var nm = (ui.getProperty("/agentDlgName") || "").trim();
                if (!nm) {
                    MessageToast.show("Agent name is required.");
                    return;
                }
                var oModel = this.getView().getModel("governance");
                var that = this;
                if (this._agentDlgMode === "edit" && this._agentEditCtx) {
                    this._agentEditCtx.setProperty("name", nm);
                    this._agentEditCtx.setProperty("modelProfile", ui.getProperty("/agentDlgModel") || "Quality");
                    this._agentEditCtx.setProperty("identityMode", ui.getProperty("/agentDlgIdentity") || "Delegated");
                    this._agentEditCtx.setProperty("status", ui.getProperty("/agentDlgStatus") || "Draft");
                    oModel
                        .submitBatch("$auto")
                        .then(function () {
                            MessageToast.show("Saved agent: " + nm);
                            that.byId("dlgAgent").close();
                            that._agentEditCtx = null;
                            oModel.refresh();
                            that._refreshOverviewFromGovernance();
                            that._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                            that._refreshAgentCapabilitiesFromGovernance();
                            that._refreshAgentFilterItemsFromGovernance();
                        })
                        .catch(function (err) {
                            that._showHttpError(err, "Save Agent");
                        });
                    return;
                }
                var oList = oModel.bindList("/Agents");
                oList.create(
                    {
                        name: nm,
                        description: "",
                        systemPrompt: " ",
                        modelProfile: ui.getProperty("/agentDlgModel") || "Quality",
                        identityMode: ui.getProperty("/agentDlgIdentity") || "Delegated",
                        status: ui.getProperty("/agentDlgStatus") || "Draft"
                    },
                    true
                );
                oModel
                    .submitBatch("$auto")
                    .then(function () {
                        MessageToast.show("Created agent: " + nm);
                        that.byId("dlgAgent").close();
                        oModel.refresh();
                        that._refreshOverviewFromGovernance();
                        that._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                        that._refreshAgentCapabilitiesFromGovernance();
                        that._refreshAgentFilterItemsFromGovernance();
                    })
                    .catch(function (err) {
                        that._showHttpError(err, "Create Agent");
                    });
            },

            onAgentDlgCancel: function () {
                this.byId("dlgAgent").close();
                this._agentEditCtx = null;
            },

            onToolsRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                this._toolEditCtx = oCtx;
                var o = oCtx.getObject();
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/toolDlgName", o.name || "");
                ui.setProperty("/toolDlgDescription", o.description || "");
                ui.setProperty("/toolDlgRisk", o.riskLevel || "Low");
                ui.setProperty("/toolDlgElevated", !!o.elevated);
                ui.setProperty("/toolDlgStatus", o.status || "Draft");
                this.byId("dlgTool").setTitle("Edit tool");
                this.byId("dlgTool").open();
            },

            onToolDlgSave: function () {
                if (!this._toolEditCtx) {
                    return;
                }
                var ui = this.getView().getModel("uiDlg");
                var oModel = this.getView().getModel("governance");
                var that = this;
                this._toolEditCtx.setProperty("description", ui.getProperty("/toolDlgDescription") || "");
                this._toolEditCtx.setProperty("riskLevel", ui.getProperty("/toolDlgRisk") || "Low");
                this._toolEditCtx.setProperty("elevated", !!ui.getProperty("/toolDlgElevated"));
                this._toolEditCtx.setProperty("status", ui.getProperty("/toolDlgStatus") || "Draft");
                oModel
                    .submitBatch("$auto")
                    .then(function () {
                        var nm = that._toolEditCtx.getProperty("name");
                        MessageToast.show("Saved tool: " + (nm || ""));
                        that.byId("dlgTool").close();
                        that._toolEditCtx = null;
                        oModel.refresh();
                        that._refreshOverviewFromGovernance();
                        that._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                        that._refreshAgentCapabilitiesFromGovernance();
                        that._refreshToolFilterDistinctsFromGovernance();
                    })
                    .catch(function (err) {
                        that._showHttpError(err, "Save tool");
                    });
            },

            onToolDlgCancel: function () {
                this.byId("dlgTool").close();
                this._toolEditCtx = null;
            },

            onToolDescriptionInfo: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var desc = oCtx.getProperty("description");
                if (!desc) {
                    return;
                }
                this.getView().getModel("ui").setProperty("/toolDescriptionDialogText", String(desc));
                this.byId("dlgToolDescription").setTitle(oCtx.getProperty("name") || "Description");
                this.byId("dlgToolDescription").open();
            },

            onToolDescriptionDialogClose: function () {
                this.byId("dlgToolDescription").close();
            },

            onToolsRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getProperty("name");
                var oModel = this.getView().getModel("governance");
                oCtx
                    .delete("$auto")
                    .then(
                        function () {
                            MessageToast.show("Deleted tool: " + name);
                            oModel.refresh();
                            this._refreshOverviewFromGovernance();
                            this._refreshCapabilityFilterAgentsAndToolsFromGovernance();
                            this._refreshAgentCapabilitiesFromGovernance();
                        }.bind(this),
                        function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        }
                    );
            },

            onGroupRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                this._groupEditCtx = oCtx;
                var o = oCtx.getObject();
                this._accessDlgMode = "editRow";
                this._groupEditOriginalName = o.name;
                this.byId("dlgAccessGroup").setTitle("Edit access group");
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/accessDlgIsTemplateOnly", false);
                ui.setProperty("/groupName", o.name || "");
                ui.setProperty("/claimKey", o.claimKey || "");
                ui.setProperty("/claimValues", "");
                ui.setProperty("/assignedAgents", "");
                this.byId("dlgAccessGroup").open();
            },

            onGroupRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getProperty("name");
                var oModel = this.getView().getModel("governance");
                oCtx
                    .delete("$auto")
                    .then(
                        function () {
                            MessageToast.show("Deleted group: " + name);
                            oModel.refresh();
                            this._refreshOverviewFromGovernance();
                            this._refreshGroupClaimAndStatusFiltersFromGovernance();
                        }.bind(this),
                        function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        }
                    );
            },
            onAgentsOpenChat: function () {
                MessageToast.show(this._i18n("PlaygroundOpenChatUi"));
            },

            onAgentToolsRequestApproval: function () {
                MessageToast.show(this._i18n("PlaygroundRequestApproval"));
            },

            /* ——— Skills ——— */
            onSkillsNew: function () {
                this._skillDlgMode = "new";
                this._skillEditCtx = null;
                this._skillEditOriginalName = null;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/skillDlgName", "");
                ui.setProperty("/skillDlgDescription", "");
                ui.setProperty("/skillDlgStatus", "Draft");
                ui.setProperty("/skillDlgBody", "");
                this.byId("dlgSkill").setTitle("New skill");
                this.byId("dlgSkill").open();
            },

            onSkillRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                this._skillEditCtx = oCtx;
                var o = oCtx.getObject();
                this._skillDlgMode = "edit";
                this._skillEditOriginalName = o.name;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/skillDlgName", o.name || "");
                ui.setProperty("/skillDlgDescription", o.description || "");
                ui.setProperty("/skillDlgStatus", o.status || "Draft");
                ui.setProperty("/skillDlgBody", o.body != null ? String(o.body) : "");
                this.byId("dlgSkill").setTitle("Edit skill");
                this.byId("dlgSkill").open();
            },

            onSkillRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("governance");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getProperty("name");
                var oModel = this.getView().getModel("governance");
                oCtx
                    .delete("$auto")
                    .then(
                        function () {
                            MessageToast.show("Deleted skill: " + name);
                            oModel.refresh();
                            this._refreshOverviewFromGovernance();
                            this._refreshAgentCapabilitiesFromGovernance();
                            this._refreshSkillStatusFilterFromGovernance();
                        }.bind(this),
                        function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        }
                    );
            },

            onSkillDlgSave: function () {
                var ui = this.getView().getModel("uiDlg");
                var nm = (ui.getProperty("/skillDlgName") || "").trim();
                if (!nm) {
                    MessageToast.show("Skill name is required.");
                    return;
                }
                var oModel = this.getView().getModel("governance");
                var that = this;
                if (this._skillDlgMode === "edit" && this._skillEditCtx) {
                    this._skillEditCtx.setProperty("name", nm);
                    this._skillEditCtx.setProperty("description", ui.getProperty("/skillDlgDescription") || "");
                    this._skillEditCtx.setProperty("status", ui.getProperty("/skillDlgStatus") || "Draft");
                    this._skillEditCtx.setProperty("body", ui.getProperty("/skillDlgBody") || "");
                    this._skillEditCtx.setProperty("modifiedAt", new Date());
                    oModel
                        .submitBatch("$auto")
                        .then(function () {
                            MessageToast.show("Saved skill: " + nm);
                            that.byId("dlgSkill").close();
                            that._skillEditCtx = null;
                            oModel.refresh();
                            that._refreshOverviewFromGovernance();
                            that._refreshAgentCapabilitiesFromGovernance();
                            that._refreshSkillStatusFilterFromGovernance();
                        })
                        .catch(function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        });
                    return;
                }
                var oList = oModel.bindList("/Skills");
                oList.create(
                    {
                        name: nm,
                        description: ui.getProperty("/skillDlgDescription") || "",
                        status: ui.getProperty("/skillDlgStatus") || "Draft",
                        body: ui.getProperty("/skillDlgBody") || "",
                        modifiedAt: new Date()
                    },
                    true
                );
                oModel
                    .submitBatch("$auto")
                    .then(function () {
                        MessageToast.show("Created skill: " + nm);
                        that.byId("dlgSkill").close();
                        oModel.refresh();
                        that._refreshOverviewFromGovernance();
                        that._refreshAgentCapabilitiesFromGovernance();
                        that._refreshSkillStatusFilterFromGovernance();
                    })
                    .catch(function (err) {
                        MessageToast.show((err && err.message) || String(err));
                    });
            },

            onSkillDlgCancel: function () {
                this.byId("dlgSkill").close();
                this._skillEditCtx = null;
            },

            onFilterSkillsChange: function () {
                this._applySkillFilters();
            },

            onSkillsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("ui").setProperty("/filterSkills/search", q);
                this._applySkillFilters();
            },

            onFilterAgentCapabilitiesChange: function () {
                this._applyAgentCapabilityFilters();
            },

            onAgentCapabilitiesSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("ui").setProperty("/filterAgentCapabilities/search", q);
                this._applyAgentCapabilityFilters();
            },

            onAgentCapabilitiesLegend: function () {
                MessageToast.show(
                    "Direct = AgentTool; Via skill = AgentSkill (OData)."
                );
            },

            onCapabilityRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("ui");
                var o = oCtx && oCtx.getObject();
                MessageToast.show(
                    "Edit capability (UI only): " +
                        (o ? o.agentName + " / " + o.routeTypeKey + " / " + o.toolName : "?") +
                        " — wire to CAP."
                );
            },

            onCapabilityRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("ui");
                if (!oCtx) {
                    return;
                }
                var o = oCtx.getObject();
                var oGov = this.getView().getModel("governance");
                var that = this;
                function findAgentToolId() {
                    var lb = oGov.bindList("/AgentTools", null, null, null, {
                        $expand: { agent: { $select: "name" }, tool: { $select: "name" } }
                    });
                    return lb.requestContexts(0, 5000).then(function (ctxs) {
                        for (var i = 0; i < ctxs.length; i++) {
                            var x = ctxs[i].getObject();
                            var an = (x.agent && x.agent.name) || "";
                            var tn = (x.tool && x.tool.name) || "";
                            if (an === o.agentName && tn === o.toolName) {
                                return ctxs[i];
                            }
                        }
                        return null;
                    });
                }
                function findAgentSkillId() {
                    var lb = oGov.bindList("/AgentSkills", null, null, null, {
                        $expand: { agent: { $select: "name" }, skill: { $select: "name" } }
                    });
                    return lb.requestContexts(0, 5000).then(function (ctxs) {
                        for (var i = 0; i < ctxs.length; i++) {
                            var x = ctxs[i].getObject();
                            var an = (x.agent && x.agent.name) || "";
                            var sn = (x.skill && x.skill.name) || "";
                            if (an === o.agentName && sn === o.skillName) {
                                return ctxs[i];
                            }
                        }
                        return null;
                    });
                }
                if (o.routeTypeKey === "Direct") {
                    findAgentToolId().then(function (c) {
                        if (!c) {
                            MessageToast.show("Could not resolve AgentTool row.");
                            return;
                        }
                        c.delete("$auto").then(function () {
                            MessageToast.show("Removed AgentTool mapping.");
                            oGov.refresh();
                            that._refreshAgentCapabilitiesFromGovernance();
                        });
                    });
                } else {
                    findAgentSkillId().then(function (c) {
                        if (!c) {
                            MessageToast.show("Could not resolve AgentSkill row.");
                            return;
                        }
                        c.delete("$auto").then(function () {
                            MessageToast.show("Removed AgentSkill mapping.");
                            oGov.refresh();
                            that._refreshAgentCapabilitiesFromGovernance();
                        });
                    });
                }
            },

            /* ——— Filters (AND across all active criteria) ——— */
            onFilterToolsChange: function () {
                this._applyToolFilters();
            },

            onFilterAgentsChange: function () {
                this._applyAgentFilters();
            },

            onFilterGroupsChange: function () {
                this._applyGroupFilters();
            },

            _applyToolFilters: function () {
                var oTable = this.byId("tblTools");
                var oBinding = oTable && oTable.getBinding("items");
                var m = this.getView().getModel("ui");
                var f = m.getProperty("/filterTools") || {};
                if (!oBinding || !oBinding.filter) {
                    return;
                }
                var a = [];
                if (f.server) {
                    a.push(new Filter("server/name", FilterOperator.EQ, f.server));
                }
                if (f.risk) {
                    a.push(new Filter("riskLevel", FilterOperator.EQ, f.risk));
                }
                if (f.lifecycle) {
                    a.push(new Filter("status", FilterOperator.EQ, f.lifecycle));
                }
                if (f.elevated === "true") {
                    a.push(new Filter("elevated", FilterOperator.EQ, true));
                }
                if (f.elevated === "false") {
                    a.push(new Filter("elevated", FilterOperator.EQ, false));
                }
                if (norm(f.search)) {
                    var sq = norm(f.search);
                    a.push(
                        new Filter({
                            filters: [
                                new Filter("name", FilterOperator.Contains, sq),
                                new Filter("server/name", FilterOperator.Contains, sq)
                            ],
                            and: false
                        })
                    );
                }
                oBinding.filter(a.length ? a : undefined);
            },

            _applyAgentFilters: function () {
                var oTable = this.byId("tblAgents");
                var oBinding = oTable && oTable.getBinding("items");
                var m = this.getView().getModel("ui");
                if (!m) {
                    return;
                }
                var f = m.getProperty("/filterAgents") || {};
                if (!oBinding || !oBinding.filter) {
                    return;
                }
                var a = [];
                if (f.status) {
                    a.push(new Filter("status", FilterOperator.EQ, f.status));
                }
                if (f.model) {
                    a.push(new Filter("modelProfile", FilterOperator.EQ, f.model));
                }
                if (norm(f.search)) {
                    var sq = norm(f.search);
                    a.push(
                        new Filter({
                            filters: [
                                new Filter("name", FilterOperator.Contains, sq),
                                new Filter("modelProfile", FilterOperator.Contains, sq),
                                new Filter("identityMode", FilterOperator.Contains, sq)
                            ],
                            and: false
                        })
                    );
                }
                oBinding.filter(a.length ? a : undefined);
            },

            _applyGroupFilters: function () {
                var oTable = this.byId("tblGroups");
                var oBinding = oTable && oTable.getBinding("items");
                var m = this.getView().getModel("ui");
                var f = m.getProperty("/filterGroups") || {};
                if (!oBinding || !oBinding.filter) {
                    return;
                }
                var a = [];
                if (f.claimKey) {
                    a.push(new Filter("claimKey", FilterOperator.EQ, f.claimKey));
                }
                if (f.status) {
                    a.push(new Filter("status", FilterOperator.EQ, f.status));
                }
                if (norm(f.search)) {
                    var sq = norm(f.search);
                    a.push(
                        new Filter({
                            filters: [
                                new Filter("name", FilterOperator.Contains, sq),
                                new Filter("claimKey", FilterOperator.Contains, sq),
                                new Filter("description", FilterOperator.Contains, sq)
                            ],
                            and: false
                        })
                    );
                }
                oBinding.filter(a.length ? a : undefined);
                var ge = m.getProperty("/governanceError") || "";
                var mf = m.getProperty("/governanceMetadataFailed");
                var noData =
                    "No access groups match the current filters, or none are defined in governance.";
                if (mf || ge) {
                    noData =
                        "Access groups could not be loaded. Fix shell OData / auth (see banner), then refresh.";
                }
                m.setProperty("/groupsTableNoDataText", noData);
            },

            /* ——— Access group dialogs ——— */
            onOpenNewGroup: function () {
                this._accessDlgMode = "new";
                this._groupEditCtx = null;
                this._groupEditOriginalName = null;
                this.byId("dlgAccessGroup").setTitle("New access group");
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/accessDlgIsTemplateOnly", false);
                ui.setProperty("/groupName", "");
                ui.setProperty("/claimKey", "");
                ui.setProperty("/claimValues", "");
                ui.setProperty("/assignedAgents", "");
                this.byId("dlgAccessGroup").open();
            },
            onOpenEditClaims: function () {
                var ui = this.getView().getModel("uiDlg");
                var tbl = this.byId("tblGroups");
                var sel = tbl && tbl.getSelectedItem();
                var oCtx = sel && sel.getBindingContext && sel.getBindingContext("governance");
                this._groupEditCtx = null;
                if (oCtx) {
                    var o = oCtx.getObject();
                    this._accessDlgMode = "editClaimsRow";
                    this._groupEditCtx = oCtx;
                    this.byId("dlgAccessGroup").setTitle("Edit claim values — " + (o.name || "group"));
                    ui.setProperty("/accessDlgIsTemplateOnly", false);
                    ui.setProperty("/groupName", o.name || "");
                    ui.setProperty("/claimKey", o.claimKey || "");
                    ui.setProperty("/claimValues", (o.description || "").trim());
                    ui.setProperty(
                        "/assignedAgents",
                        "— (AgentGroupAgents not loaded in this shell; template field only.)"
                    );
                } else {
                    this._accessDlgMode = "editClaimsTemplate";
                    this.byId("dlgAccessGroup").setTitle("Edit claim values (template)");
                    ui.setProperty("/accessDlgIsTemplateOnly", true);
                    ui.setProperty("/groupName", "");
                    ui.setProperty("/claimKey", "");
                    ui.setProperty("/claimValues", "");
                    ui.setProperty("/assignedAgents", "");
                }
                this.byId("dlgAccessGroup").open();
            },
            onAccessGroupSave: function () {
                var ui = this.getView().getModel("uiDlg").getData();
                var oModel = this.getView().getModel("governance");
                var that = this;
                if (this._accessDlgMode === "editClaimsTemplate") {
                    MessageToast.show(
                        "Template only: values were not persisted. Select a group row for context, or wire AgentGroupClaimValue."
                    );
                    this.byId("dlgAccessGroup").close();
                    this.getView().getModel("uiDlg").setProperty("/accessDlgIsTemplateOnly", false);
                    return;
                }
                if (this._accessDlgMode === "editClaimsRow" && this._groupEditCtx) {
                    this._groupEditCtx.setProperty("name", ui.groupName || this._groupEditCtx.getProperty("name"));
                    this._groupEditCtx.setProperty("claimKey", ui.claimKey || "");
                    this._groupEditCtx.setProperty(
                        "description",
                        (ui.claimValues || "").trim() || this._groupEditCtx.getProperty("description") || ""
                    );
                    oModel
                        .submitBatch("$auto")
                        .then(function () {
                            MessageToast.show("Saved claim values (stored on group description until claim entities are wired).");
                            that.byId("dlgAccessGroup").close();
                            that._groupEditCtx = null;
                            that._groupEditOriginalName = null;
                            that.getView().getModel("uiDlg").setProperty("/accessDlgIsTemplateOnly", false);
                            oModel.refresh();
                            that._refreshOverviewFromGovernance();
                        })
                        .catch(function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        });
                    return;
                }
                if (this._accessDlgMode === "editRow" && this._groupEditCtx) {
                    this._groupEditCtx.setProperty("name", ui.groupName || this._groupEditCtx.getProperty("name"));
                    this._groupEditCtx.setProperty("claimKey", ui.claimKey || "");
                    this._groupEditCtx.setProperty(
                        "description",
                        (ui.claimValues || "").trim() || this._groupEditCtx.getProperty("description") || ""
                    );
                    oModel
                        .submitBatch("$auto")
                        .then(function () {
                            MessageToast.show("Saved access group");
                            that.byId("dlgAccessGroup").close();
                            that._groupEditCtx = null;
                            that._groupEditOriginalName = null;
                            that.getView().getModel("uiDlg").setProperty("/accessDlgIsTemplateOnly", false);
                            oModel.refresh();
                            that._refreshOverviewFromGovernance();
                            that._refreshGroupClaimAndStatusFiltersFromGovernance();
                        })
                        .catch(function (err) {
                            MessageToast.show((err && err.message) || String(err));
                        });
                    return;
                }
                var oList = oModel.bindList("/AgentGroups");
                oList.create(
                    {
                        name: (ui.groupName || "New group").trim(),
                        description: (ui.claimValues || "").trim(),
                        claimKey: ui.claimKey || "dept",
                        status: "Active"
                    },
                    true
                );
                oModel
                    .submitBatch("$auto")
                    .then(function () {
                        MessageToast.show("Created access group");
                        that.byId("dlgAccessGroup").close();
                        that.getView().getModel("uiDlg").setProperty("/accessDlgIsTemplateOnly", false);
                        oModel.refresh();
                        that._refreshOverviewFromGovernance();
                        that._refreshGroupClaimAndStatusFiltersFromGovernance();
                    })
                    .catch(function (err) {
                        MessageToast.show((err && err.message) || String(err));
                    });
            },
            onAccessGroupCancel: function () {
                this.byId("dlgAccessGroup").close();
                this._groupEditOriginalName = null;
                this._groupEditCtx = null;
                this.getView().getModel("uiDlg").setProperty("/accessDlgIsTemplateOnly", false);
            },

            /* ——— Playground ——— */
            onPlaygroundTempChange: function (oEvent) {
                var v = oEvent.getParameter("value");
                this.getView().getModel("ui").setProperty("/playgroundTemperature", v);
            },

            _playgroundTokenFromEvent: function (v) {
                if (v == null) {
                    return "";
                }
                if (typeof v === "string") {
                    return v;
                }
                if (Array.isArray(v)) {
                    return v
                        .map(function (p) {
                            if (typeof p === "string") {
                                return p;
                            }
                            if (p && typeof p === "object" && p.text != null) {
                                return String(p.text);
                            }
                            return "";
                        })
                        .join("");
                }
                if (typeof v === "object" && v.text != null) {
                    return String(v.text);
                }
                return "";
            },

            _playgroundAppendAssistantToken: function (m, assistantAuthor, piece) {
                if (!piece) {
                    return;
                }
                var arr = m.getProperty("/playgroundMessages") || [];
                var last = arr[arr.length - 1];
                if (!last || last.author !== assistantAuthor) {
                    return;
                }
                last.text = (last.text || "") + piece;
                m.setProperty("/playgroundMessages", arr.slice());
            },

            _playgroundReadChatStream: function (m, reader, assistantAuthor) {
                var that = this;
                var decoder = new TextDecoder();
                var buffer = "";
                var sessionOut = null;
                return new Promise(function (resolve, reject) {
                    function pump() {
                        reader
                            .read()
                            .then(function (result) {
                                if (result.done) {
                                    resolve(sessionOut);
                                    return;
                                }
                                buffer += decoder.decode(result.value, { stream: true });
                                var lines = buffer.split("\n");
                                buffer = lines.pop() || "";
                                for (var i = 0; i < lines.length; i++) {
                                    var line = lines[i];
                                    if (line.indexOf("data: ") !== 0) {
                                        continue;
                                    }
                                    try {
                                        var data = JSON.parse(line.substring(6));
                                        if (data.type === "token") {
                                            that._playgroundAppendAssistantToken(
                                                m,
                                                assistantAuthor,
                                                that._playgroundTokenFromEvent(data.content)
                                            );
                                        } else if (data.type === "done") {
                                            if (data.sessionId) {
                                                sessionOut = data.sessionId;
                                            }
                                        } else if (data.type === "error") {
                                            reject(new Error(data.message || "Chat error"));
                                            return;
                                        }
                                    } catch (eParse) {
                                        /* ignore malformed SSE JSON lines */
                                    }
                                }
                                pump();
                            })
                            .catch(reject);
                    }
                    pump();
                });
            },

            onPlaygroundSend: function () {
                var oView = this.getView();
                var m = oView.getModel("ui");
                var that = this;
                var oIn = this._getPlaygroundInput();
                var sText = (oIn && oIn.getValue && oIn.getValue()) || "";
                if (!sText.trim()) {
                    MessageToast.show(this._i18n("PlaygroundEmptyMessage"));
                    return;
                }
                var agentId = m.getProperty("/playgroundSelectedAgent");
                if (!agentId || agentId === "_err") {
                    MessageToast.show(this._i18n("PlaygroundSelectAgentFirst"));
                    return;
                }
                if (m.getProperty("/playgroundStreaming")) {
                    return;
                }
                m.setProperty("/playgroundStreaming", true);
                var sessionId = m.getProperty("/playgroundSessionId");
                var assistantAuthor = this._i18n("PlaygroundAssistantLabel");
                var a = m.getProperty("/playgroundMessages") || [];
                a = a.concat([{ author: "You", text: sText }, { author: assistantAuthor, text: "" }]);
                m.setProperty("/playgroundMessages", a);
                if (oIn && oIn.setValue) {
                    oIn.setValue("");
                }
                var oOther = this._playgroundUseTabs() ? this.byId("playgroundInput") : this.byId("playgroundInputTab");
                if (oOther && oOther !== oIn && oOther.setValue) {
                    oOther.setValue("");
                }
                function scrollBottom() {
                    var oScroll = that._getPlaygroundScroll();
                    if (oScroll && oScroll.scrollTo) {
                        setTimeout(function () {
                            oScroll.scrollTo(0, 999999);
                        }, 0);
                    }
                }
                scrollBottom();
                if (this._playgroundAbortCtrl) {
                    try {
                        this._playgroundAbortCtrl.abort();
                    } catch (e0) {
                        /* ignore */
                    }
                }
                this._playgroundAbortCtrl = new window.AbortController();
                fetch("/api/chat", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        agentId: agentId,
                        message: sText,
                        sessionId: sessionId || null
                    }),
                    signal: this._playgroundAbortCtrl.signal
                })
                    .then(function (r) {
                        if (!r.ok) {
                            return r.text().then(function (t) {
                                var msg = t || "HTTP " + r.status;
                                try {
                                    var j = JSON.parse(t);
                                    if (j && j.error) {
                                        msg = j.error;
                                    }
                                } catch (eJ) {
                                    /* keep msg */
                                }
                                throw new Error(msg);
                            });
                        }
                        if (!r.body || !r.body.getReader) {
                            throw new Error("No stream body");
                        }
                        return that._playgroundReadChatStream(m, r.body.getReader(), assistantAuthor);
                    })
                    .then(function (newSessionId) {
                        if (newSessionId) {
                            m.setProperty("/playgroundSessionId", newSessionId);
                        }
                    })
                    .catch(function (err) {
                        if (err && err.name === "AbortError") {
                            return;
                        }
                        var msg = (err && err.message) || String(err);
                        MessageToast.show(msg);
                        var arr = m.getProperty("/playgroundMessages") || [];
                        var last = arr[arr.length - 1];
                        if (last && last.author === assistantAuthor && !last.text) {
                            last.text = msg;
                            m.setProperty("/playgroundMessages", arr.slice());
                        }
                    })
                    .finally(function () {
                        m.setProperty("/playgroundStreaming", false);
                        scrollBottom();
                    });
            },

            onToolsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("ui").setProperty("/filterTools/search", q);
                this._applyToolFilters();
            },

            onAgentsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("ui").setProperty("/filterAgents/search", q);
                this._applyAgentFilters();
            },

            onGroupsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("ui").setProperty("/filterGroups/search", q);
                this._applyGroupFilters();
            },

            /** Loads Agent and Tool display names from governance for capability page filter dropdowns. */
            _refreshCapabilityFilterAgentsAndToolsFromGovernance: function () {
                return refreshCapabilityFilterAgentsAndToolsFromGovernance(this);
            },

            _refreshToolServerFilterItems: function () {
                this._refreshMcpServerFilterItems();
                this._refreshToolFilterDistinctsFromGovernance();
            }
        });
    }
);
