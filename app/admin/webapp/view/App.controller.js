sap.ui.define(
    [
        "sap/ui/core/mvc/Controller",
        "sap/ui/core/Item",
        "sap/ui/core/ResizeHandler",
        "sap/m/MessageToast",
        "sap/ui/model/json/JSONModel"
    ],
    function (Controller, Item, ResizeHandler, MessageToast, JSONModel) {
        "use strict";

        function norm(s) {
            return (s || "").toLowerCase().trim();
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
                        agentDlgDept: "procurement",
                        agentDlgStatus: "Draft",
                        agentDlgTools: "0"
                    }),
                    "uiDlg"
                );
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
                this._applyAgentToolFilters();
                this._applyGroupFilters();
            },

            onExit: function () {
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
                MessageToast.show("Sign out is not wired in this mock shell — use App Router /logout when integrated.");
            },

            /* ——— MCP actions (mock flow; buttons enabled with clear disabled styling via standard types) ——— */
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
                    pad(d.getSeconds()) +
                    " (mock)"
                );
            },

            _getSelectedMcpContext: function () {
                var tbl = this.byId("tblMcp");
                var item = tbl && tbl.getSelectedItem();
                return item ? item.getBindingContext("mock") : null;
            },

            _mirrorServersToFull: function () {
                var m = this.getView().getModel("mock");
                var list = m.getProperty("/servers") || [];
                m.setProperty("/serversFull", JSON.parse(JSON.stringify(list)));
            },

            onMcpTestConnection: function () {
                var oCtx = this._getSelectedMcpContext();
                if (!oCtx) {
                    MessageToast.show("Select an MCP server row first (mock flow).");
                    return;
                }
                var sPath = oCtx.getPath();
                var m = oCtx.getModel();
                m.setProperty(sPath + "/health", "OK");
                m.setProperty(sPath + "/lastSync", this._nowMock());
                this._mirrorServersToFull();
                MessageToast.show(
                    "Test connection (mock): health → OK for " + (oCtx.getObject().name || "server")
                );
            },
            onMcpSyncTools: function () {
                var oCtx = this._getSelectedMcpContext();
                if (!oCtx) {
                    MessageToast.show("Select an MCP server row first (mock sync).");
                    return;
                }
                var sPath = oCtx.getPath();
                oCtx.getModel().setProperty(sPath + "/lastSync", this._nowMock());
                this._mirrorServersToFull();
                MessageToast.show(
                    "Sync tools (mock): last sync stamped for " + (oCtx.getObject().name || "server")
                );
            },
            onMcpAddServer: function () {
                var m = this.getView().getModel("mock");
                var servers = m.getProperty("/servers") || [];
                var idx = servers.length + 1;
                var row = {
                    name: "New MCP server " + idx + " (mock)",
                    destinationName: "PYTHON_MCP_SERVICE",
                    baseUrl: "http://localhost:8000",
                    transportType: "HTTP",
                    environment: "dev",
                    ownerTeam: "—",
                    health: "UNKNOWN",
                    status: "Draft",
                    lastSync: "— (mock)"
                };
                var next = servers.concat([row]);
                m.setProperty("/servers", next);
                this._mirrorServersToFull();
                m.setProperty("/overview/mcpCount", next.length);
                MessageToast.show("Add server (mock): draft row appended — wire to CAP create.");
            },

            _removeByName: function (arr, name) {
                return (arr || []).filter(function (r) {
                    return r.name !== name;
                });
            },

            _removeAgentToolPair: function (arr, agentName, toolName) {
                return (arr || []).filter(function (r) {
                    return !(r.agentName === agentName && r.toolName === toolName);
                });
            },

            _syncOverviewAgents: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/agentsFull") || [];
                m.setProperty("/overview/agentCount", full.length);
                m.setProperty(
                    "/overview/activeAgentCount",
                    full.filter(function (a) {
                        return a.status === "Active";
                    }).length
                );
            },

            _syncOverviewTools: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/toolsFull") || [];
                m.setProperty(
                    "/overview/draftToolCount",
                    full.filter(function (t) {
                        return t.status === "Draft";
                    }).length
                );
                m.setProperty(
                    "/overview/activeToolCount",
                    full.filter(function (t) {
                        return t.status === "Active";
                    }).length
                );
            },

            _syncOverviewGroups: function () {
                var m = this.getView().getModel("mock");
                m.setProperty("/overview/groupCount", (m.getProperty("/groupsFull") || []).length);
            },

            onMcpRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
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
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var o = oCtx.getObject();
                var m = this.getView().getModel("mock");
                var name = o.name;
                var servers = this._removeByName(m.getProperty("/servers") || [], name);
                m.setProperty("/servers", servers);
                m.setProperty("/serversFull", this._removeByName(m.getProperty("/serversFull") || [], name));
                m.setProperty("/overview/mcpCount", servers.length);
                this._applyToolFilters();
                MessageToast.show("Delete MCP server (mock): " + name);
            },

            onMcpDlgSave: function () {
                var ui = this.getView().getModel("uiDlg");
                var n = (ui.getProperty("/mcpDlgName") || "").trim();
                if (!n) {
                    MessageToast.show("Name is required.");
                    return;
                }
                var m = this.getView().getModel("mock");
                var orig = this._mcpEditOriginalName;
                var list = m.getProperty("/servers") || [];
                var next = list.map(function (row) {
                    if (row.name === orig) {
                        return {
                            name: n,
                            destinationName: ui.getProperty("/mcpDlgDestination") || "",
                            baseUrl: ui.getProperty("/mcpDlgBaseUrl") || "",
                            transportType: ui.getProperty("/mcpDlgTransport") || "",
                            environment: ui.getProperty("/mcpDlgEnvironment") || "",
                            ownerTeam: row.ownerTeam,
                            health: row.health,
                            status: row.status,
                            lastSync: row.lastSync
                        };
                    }
                    return row;
                });
                m.setProperty("/servers", next);
                this._mirrorServersToFull();
                MessageToast.show("Save MCP server (mock): " + n);
                this.byId("dlgMcpServer").close();
                this._mcpEditOriginalName = null;
            },

            onMcpDlgCancel: function () {
                this.byId("dlgMcpServer").close();
                this._mcpEditOriginalName = null;
            },

            onToolsActivate: function () {
                MessageToast.show("Activate (mock): would activate selected tools in catalog.");
            },
            onToolsSetRisk: function () {
                MessageToast.show("Set risk (mock): would bulk-update risk / elevated on selection.");
            },

            onAgentsNew: function () {
                this._agentDlgMode = "new";
                this._agentEditOriginalName = null;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/agentDlgName", "");
                ui.setProperty("/agentDlgModel", "Quality");
                ui.setProperty("/agentDlgIdentity", "Delegated");
                ui.setProperty("/agentDlgDept", "procurement");
                ui.setProperty("/agentDlgStatus", "Draft");
                ui.setProperty("/agentDlgTools", "0");
                this.byId("dlgAgent").setTitle("New agent");
                this.byId("dlgAgent").open();
            },

            onAgentRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var o = oCtx.getObject();
                this._agentDlgMode = "edit";
                this._agentEditOriginalName = o.name;
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/agentDlgName", o.name || "");
                ui.setProperty("/agentDlgModel", o.modelProfile || "Quality");
                ui.setProperty("/agentDlgIdentity", o.identityMode || "Delegated");
                ui.setProperty("/agentDlgDept", o.deptGate || "procurement");
                ui.setProperty("/agentDlgStatus", o.status || "Draft");
                ui.setProperty("/agentDlgTools", String(o.assignedTools != null ? o.assignedTools : 0));
                this.byId("dlgAgent").setTitle("Edit agent");
                this.byId("dlgAgent").open();
            },

            onAgentRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getObject().name;
                var m = this.getView().getModel("mock");
                m.setProperty("/agentsFull", this._removeByName(m.getProperty("/agentsFull") || [], name));
                this._applyAgentFilters();
                this._syncOverviewAgents();
                MessageToast.show("Delete agent (mock): " + name);
            },

            onAgentDlgSave: function () {
                var ui = this.getView().getModel("uiDlg");
                var nm = (ui.getProperty("/agentDlgName") || "").trim();
                if (!nm) {
                    MessageToast.show("Agent name is required.");
                    return;
                }
                var tools = parseInt(ui.getProperty("/agentDlgTools"), 10);
                if (isNaN(tools) || tools < 0) {
                    tools = 0;
                }
                var row = {
                    name: nm,
                    modelProfile: ui.getProperty("/agentDlgModel") || "Quality",
                    identityMode: ui.getProperty("/agentDlgIdentity") || "Delegated",
                    deptGate: ui.getProperty("/agentDlgDept") || "procurement",
                    status: ui.getProperty("/agentDlgStatus") || "Draft",
                    assignedTools: tools
                };
                var m = this.getView().getModel("mock");
                var full = (m.getProperty("/agentsFull") || []).slice();
                if (this._agentDlgMode === "new") {
                    full.push(row);
                } else {
                    var orig = this._agentEditOriginalName;
                    var idx = -1;
                    for (var i = 0; i < full.length; i++) {
                        if (full[i].name === orig) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx === -1) {
                        full.push(row);
                    } else {
                        full[idx] = row;
                    }
                }
                m.setProperty("/agentsFull", full);
                this._applyAgentFilters();
                this._syncOverviewAgents();
                MessageToast.show((this._agentDlgMode === "new" ? "Create agent (mock): " : "Save agent (mock): ") + nm);
                this.byId("dlgAgent").close();
            },

            onAgentDlgCancel: function () {
                this.byId("dlgAgent").close();
            },

            onToolsRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                var o = oCtx && oCtx.getObject();
                MessageToast.show(
                    "Edit tool (mock): " + (o && o.name ? o.name : "?") + " — wire to CAP detail."
                );
            },

            onToolsRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getObject().name;
                var m = this.getView().getModel("mock");
                m.setProperty("/toolsFull", this._removeByName(m.getProperty("/toolsFull") || [], name));
                this._applyToolFilters();
                this._syncOverviewTools();
                MessageToast.show("Delete tool (mock): " + name);
            },

            onAgentToolRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                var o = oCtx && oCtx.getObject();
                MessageToast.show(
                    "Edit mapping (mock): " +
                        (o ? o.agentName + " → " + o.toolName : "?") +
                        " — wire to CAP."
                );
            },

            onAgentToolRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var o = oCtx.getObject();
                var m = this.getView().getModel("mock");
                m.setProperty(
                    "/agentToolsFull",
                    this._removeAgentToolPair(m.getProperty("/agentToolsFull") || [], o.agentName, o.toolName)
                );
                this._applyAgentToolFilters();
                MessageToast.show("Delete mapping (mock): " + o.agentName + " → " + o.toolName);
            },

            onGroupRowEdit: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var o = oCtx.getObject();
                this._accessDlgMode = "editRow";
                this._groupEditOriginalName = o.name;
                this.byId("dlgAccessGroup").setTitle("Edit access group");
                var ui = this.getView().getModel("uiDlg");
                ui.setProperty("/groupName", o.name || "");
                ui.setProperty("/claimKey", o.claimKey || "");
                ui.setProperty("/claimValues", o.claimValues || "");
                ui.setProperty("/assignedAgents", o.assignedAgents || "");
                this.byId("dlgAccessGroup").open();
            },

            onGroupRowDelete: function (oEvent) {
                var oCtx = oEvent.getSource().getBindingContext("mock");
                if (!oCtx) {
                    return;
                }
                var name = oCtx.getObject().name;
                var m = this.getView().getModel("mock");
                m.setProperty("/groupsFull", this._removeByName(m.getProperty("/groupsFull") || [], name));
                this._applyGroupFilters();
                this._syncOverviewGroups();
                MessageToast.show("Delete group (mock): " + name);
            },
            onAgentsOpenChat: function () {
                MessageToast.show("Open in Chat UI (mock): would deep-link to chat with agent context.");
            },

            onAgentToolsRequestApproval: function () {
                MessageToast.show("Request approval (mock): would enqueue workflow for pending mappings.");
            },

            /* ——— Filters (AND across all active criteria) ——— */
            onFilterToolsChange: function () {
                this._applyToolFilters();
            },

            onFilterAgentsChange: function () {
                this._applyAgentFilters();
            },

            onFilterAgentToolsChange: function () {
                this._applyAgentToolFilters();
            },

            onFilterGroupsChange: function () {
                this._applyGroupFilters();
            },

            _applyToolFilters: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/toolsFull") || [];
                var f = m.getProperty("/filterTools") || {};
                var sq = norm(f.search);
                var out = full.filter(function (row) {
                    if (f.server && row.serverName !== f.server) {
                        return false;
                    }
                    if (f.risk && row.riskLevel !== f.risk) {
                        return false;
                    }
                    if (f.lifecycle && row.status !== f.lifecycle) {
                        return false;
                    }
                    if (f.elevated === "true" && row.elevated !== true) {
                        return false;
                    }
                    if (f.elevated === "false" && row.elevated !== false) {
                        return false;
                    }
                    if (sq) {
                        var hay = norm(row.name + " " + row.serverName);
                        if (hay.indexOf(sq) === -1) {
                            return false;
                        }
                    }
                    return true;
                });
                m.setProperty("/tools", out);
            },

            _applyAgentFilters: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/agentsFull") || [];
                var f = m.getProperty("/filterAgents") || {};
                var sq = norm(f.search);
                var out = full.filter(function (row) {
                    if (f.status && row.status !== f.status) {
                        return false;
                    }
                    if (f.model && row.modelProfile !== f.model) {
                        return false;
                    }
                    if (f.dept && row.deptGate !== f.dept) {
                        return false;
                    }
                    if (sq) {
                        var hay = norm(row.name + " " + row.modelProfile + " " + row.deptGate + " " + row.identityMode);
                        if (hay.indexOf(sq) === -1) {
                            return false;
                        }
                    }
                    return true;
                });
                m.setProperty("/agents", out);
            },

            _applyAgentToolFilters: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/agentToolsFull") || [];
                var f = m.getProperty("/filterAgentTools") || {};
                var out = full.filter(function (row) {
                    if (f.agent && row.agentName !== f.agent) {
                        return false;
                    }
                    if (f.tool && row.toolName !== f.tool) {
                        return false;
                    }
                    if (f.permissionOverride && row.permissionOverride !== f.permissionOverride) {
                        return false;
                    }
                    if (f.approved === "true" && row.approved !== true) {
                        return false;
                    }
                    if (f.approved === "false" && row.approved !== false) {
                        return false;
                    }
                    return true;
                });
                m.setProperty("/agentTools", out);
            },

            _applyGroupFilters: function () {
                var m = this.getView().getModel("mock");
                var full = m.getProperty("/groupsFull") || [];
                var f = m.getProperty("/filterGroups") || {};
                var sq = norm(f.search);
                var out = full.filter(function (row) {
                    if (f.claimKey && row.claimKey !== f.claimKey) {
                        return false;
                    }
                    if (f.status && row.status !== f.status) {
                        return false;
                    }
                    if (sq) {
                        var hay = norm(
                            row.name + " " + row.claimKey + " " + row.claimValues + " " + row.assignedAgents
                        );
                        if (hay.indexOf(sq) === -1) {
                            return false;
                        }
                    }
                    return true;
                });
                m.setProperty("/groups", out);
            },

            /* ——— Add mapping dialog ——— */
            onOpenAddMapping: function () {
                var oDlg = this.byId("dlgAddMapping");
                this._fillMappingDialogLists();
                if (this.byId("mapDlgTool")) {
                    this.byId("mapDlgTool").removeAllItems();
                }
                if (this.byId("mapDlgServer")) {
                    this.byId("mapDlgServer").setSelectedKey("");
                }
                if (this.byId("mapDlgAgent")) {
                    this.byId("mapDlgAgent").setSelectedKey("");
                }
                oDlg.open();
            },
            onAddMappingServerChange: function () {
                this._refreshMappingToolItems();
            },
            onAddMappingConfirm: function () {
                var ag = this.byId("mapDlgAgent") && this.byId("mapDlgAgent").getSelectedItem();
                var sv = this.byId("mapDlgServer") && this.byId("mapDlgServer").getSelectedItem();
                var tl = this.byId("mapDlgTool") && this.byId("mapDlgTool").getSelectedItem();
                if (!ag || !sv || !tl) {
                    MessageToast.show("Select agent, MCP server, and tool.");
                    return;
                }
                MessageToast.show(
                    "Add mapping (mock): " +
                        ag.getText() +
                        " → " +
                        sv.getText() +
                        " → " +
                        tl.getText()
                );
                this.byId("dlgAddMapping").close();
            },
            onAddMappingCancel: function () {
                this.byId("dlgAddMapping").close();
            },

            _fillMappingDialogLists: function () {
                var m = this.getView().getModel("mock");
                var oAgent = this.byId("mapDlgAgent");
                var oServer = this.byId("mapDlgServer");
                if (!oAgent || !oServer) {
                    return;
                }
                oAgent.removeAllItems();
                oServer.removeAllItems();
                (m.getProperty("/agentsFull") || []).forEach(function (a) {
                    oAgent.addItem(new Item({ key: a.name, text: a.name }));
                });
                (m.getProperty("/serversFull") || []).forEach(function (s) {
                    oServer.addItem(new Item({ key: s.name, text: s.name }));
                });
                this._refreshMappingToolItems();
            },

            _refreshMappingToolItems: function () {
                var m = this.getView().getModel("mock");
                var oTool = this.byId("mapDlgTool");
                var oServer = this.byId("mapDlgServer");
                if (!oTool || !oServer) {
                    return;
                }
                var sName = oServer.getSelectedKey();
                oTool.removeAllItems();
                if (!sName) {
                    return;
                }
                (m.getProperty("/toolsFull") || []).forEach(function (t) {
                    if (t.serverName === sName) {
                        oTool.addItem(new Item({ key: t.name, text: t.name }));
                    }
                });
            },

            /* ——— Access group dialogs ——— */
            onOpenNewGroup: function () {
                this._accessDlgMode = "new";
                this._groupEditOriginalName = null;
                this.byId("dlgAccessGroup").setTitle("New access group");
                this.getView().getModel("uiDlg").setProperty("/groupName", "");
                this.getView().getModel("uiDlg").setProperty("/claimKey", "");
                this.getView().getModel("uiDlg").setProperty("/claimValues", "");
                this.getView().getModel("uiDlg").setProperty("/assignedAgents", "");
                this.byId("dlgAccessGroup").open();
            },
            onOpenEditClaims: function () {
                this._accessDlgMode = "edit";
                this.byId("dlgAccessGroup").setTitle("Edit claim values");
                this.getView().getModel("uiDlg").setProperty("/groupName", "Department — Procurement");
                this.getView().getModel("uiDlg").setProperty("/claimKey", "dept");
                this.getView().getModel("uiDlg").setProperty("/claimValues", "procurement, finance, it");
                this.getView().getModel("uiDlg").setProperty(
                    "/assignedAgents",
                    "Procurement Assistant, Finance Copilot"
                );
                this.byId("dlgAccessGroup").open();
            },
            onAccessGroupSave: function () {
                var ui = this.getView().getModel("uiDlg").getData();
                var m = this.getView().getModel("mock");
                if (this._accessDlgMode === "editRow") {
                    var orig = this._groupEditOriginalName;
                    var full = (m.getProperty("/groupsFull") || []).slice();
                    var idx = -1;
                    for (var i = 0; i < full.length; i++) {
                        if (full[i].name === orig) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx >= 0) {
                        full[idx] = {
                            name: ui.groupName || full[idx].name,
                            claimKey: ui.claimKey || "",
                            claimValues: ui.claimValues || "",
                            assignedAgents: ui.assignedAgents || "",
                            status: full[idx].status
                        };
                        m.setProperty("/groupsFull", full);
                        this._applyGroupFilters();
                    }
                    MessageToast.show("Save group (mock): " + (ui.groupName || orig));
                    this._groupEditOriginalName = null;
                } else {
                    MessageToast.show(
                        (this._accessDlgMode === "new" ? "Create group (mock): " : "Save claims (mock): ") +
                            (ui.groupName || "(unnamed)")
                    );
                }
                this.byId("dlgAccessGroup").close();
            },
            onAccessGroupCancel: function () {
                this.byId("dlgAccessGroup").close();
                this._groupEditOriginalName = null;
            },

            /* ——— Playground ——— */
            onPlaygroundTempChange: function (oEvent) {
                var v = oEvent.getParameter("value");
                this.getView().getModel("mock").setProperty("/playgroundTemperature", v);
            },

            onPlaygroundSend: function () {
                var oView = this.getView();
                var oModel = oView.getModel("mock");
                var oIn = this._getPlaygroundInput();
                var sText = (oIn && oIn.getValue && oIn.getValue()) || "";
                if (!sText.trim()) {
                    MessageToast.show("Enter a message (mock).");
                    return;
                }
                var temp = oModel.getProperty("/playgroundTemperature");
                var promptLen = ((oModel.getProperty("/playgroundSystemPrompt") || "").length || 0);
                var a = oModel.getProperty("/playgroundMessages") || [];
                a = a.concat([
                    { author: "You", text: sText },
                    {
                        author: "Assistant (mock)",
                        text:
                            "Echo (mock). Temperature=" +
                            temp +
                            ", system prompt chars=" +
                            promptLen +
                            ". Wire to /api/chat for real responses."
                    }
                ]);
                oModel.setProperty("/playgroundMessages", a);
                oModel.setProperty("/playgroundDraft", "");
                if (oIn && oIn.setValue) {
                    oIn.setValue("");
                }
                var oOther = this._playgroundUseTabs() ? this.byId("playgroundInput") : this.byId("playgroundInputTab");
                if (oOther && oOther !== oIn && oOther.setValue) {
                    oOther.setValue("");
                }
                var oScroll = this._getPlaygroundScroll();
                if (oScroll && typeof oScroll.scrollTo === "function") {
                    setTimeout(function () {
                        oScroll.scrollTo(0, 999999);
                    }, 0);
                }
            },

            onToolsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("mock").setProperty("/filterTools/search", q);
                this._applyToolFilters();
            },

            onAgentsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("mock").setProperty("/filterAgents/search", q);
                this._applyAgentFilters();
            },

            onGroupsSearchLive: function (oEvent) {
                var q = oEvent.getParameter("newValue");
                if (q === undefined || q === null) {
                    q = "";
                }
                this.getView().getModel("mock").setProperty("/filterGroups/search", q);
                this._applyGroupFilters();
            }
        });
    }
);
