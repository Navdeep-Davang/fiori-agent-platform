sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "acp/chat/utils/DevAuth",
    "sap/ui/core/format/DateFormat"
], function (Controller, JSONModel, MessageToast, MessageBox, Fragment, DevAuth, DateFormat) {
    "use strict";

    return Controller.extend("acp.chat.controller.Chat", {
        /**
         * Central logout (SAP App Router): clears app-router session, ends IdP session (XSUAA/IAS),
         * then redirects to logoutPage (see approuter/xs-app.json). Not the same as clearing localStorage only.
         */
        onLogoutPress: function () {
            var rb = this.getResourceBundle();
            MessageBox.confirm(rb.getText("logoutConfirm"), {
                title: rb.getText("logoutBtn"),
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        window.location.replace("/logout");
                    }
                }
            });
        },

        onInit: function () {
            this._oChatModel = new JSONModel({
                messages: [],
                isStreaming: false
            });
            this.getView().setModel(this._oChatModel, "chatModel");

            this._oAgentsModel = new JSONModel({ agents: [], agentsLoading: true });
            this.getView().setModel(this._oAgentsModel, "agentsModel");

            this._sSessionId = null;
            this._sLastUserMessage = "";
            this._abortController = null;

            // Defer so the first /api/agents request is not cancelled during shell navigation (avoids spurious Failed to fetch).
            setTimeout(function () {
                this._loadAgents();
            }.bind(this), 150);

            var oSessionList = this.byId("sessionList");
            if (oSessionList) {
                oSessionList.attachUpdateFinished(this._wireSessionDeleteButtons.bind(this));
            }
        },

        /** Delete icon must not toggle SingleSelectMaster on the row (same idea as sap.m.ListItemBase inner controls). */
        _wireSessionDeleteButtons: function () {
            var oList = this.byId("sessionList");
            if (!oList) {
                return;
            }
            oList.getItems().forEach(function (oItem) {
                var aBtns = oItem.findAggregatedObjects(true, function (o) {
                    return o.isA("sap.m.Button") && o.hasStyleClass("acpSessionDeleteBtn");
                });
                aBtns.forEach(function (oBtn) {
                    oBtn.useEnabledPropagator(false);
                });
            });
        },

        _loadAgents: function () {
            this._oAgentsModel.setProperty("/agentsLoading", true);
            fetch("/api/agents", {
                credentials: "include",
                headers: Object.assign({}, DevAuth.authorizationHeaders())
            })
                .then(function (res) {
                    return res.json().then(function (body) {
                        if (!res.ok) {
                            throw new Error(body && body.error ? body.error : "HTTP " + res.status);
                        }
                        return body;
                    });
                })
                .then(function (data) {
                    var list = Array.isArray(data) ? data : (data.agents || []);
                    this._oAgentsModel.setData({ agents: list, agentsLoading: false });
                    if (list.length > 0) {
                        this.byId("agentSelect").setSelectedKey(list[0].id);
                    }
                }.bind(this))
                .catch(function (err) {
                    console.error("Failed to load agents", err);
                    this._oAgentsModel.setData({ agents: [], agentsLoading: false });
                    MessageToast.show("Failed to load agents", {
                        at: "center top",
                        my: "center top",
                        offset: "0 100"
                    });
                }.bind(this));
        },

        onAgentChange: function (oEvent) {
            const aMessages = this._oChatModel.getProperty("/messages");
            if (aMessages.length > 0) {
                MessageBox.confirm(this.getResourceBundle().getText("agentChangeConfirm"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this.onNewSession();
                        } else {
                            // Revert selection? 
                        }
                    }
                });
            }
        },

        onNewSession: function () {
            this._sSessionId = null;
            this._oChatModel.setProperty("/messages", []);
            this.byId("sessionList").removeSelections();
        },

        onSessionSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            const oCtx = oItem.getBindingContext();
            if (!oCtx) return;

            this._sSessionId = oCtx.getProperty("ID");
            const sAgentId = oCtx.getProperty("agentId");
            this.byId("agentSelect").setSelectedKey(sAgentId);

            this._loadSessionHistory(this._sSessionId);
        },

        onDeleteSession: function (oEvent) {
            if (oEvent.stopPropagation) {
                oEvent.stopPropagation();
            }
            const oBtn = oEvent.getSource();
            let oCtx = oBtn.getBindingContext();
            
            if (!oCtx) {
                let oWalk = oBtn.getParent();
                while (oWalk) {
                    if (oWalk.isA && oWalk.isA("sap.m.ListItemBase")) {
                        oCtx = oWalk.getBindingContext();
                        break;
                    }
                    oWalk = oWalk.getParent();
                }
            }
            
            if (!oCtx) {
                console.error("No binding context found for delete button");
                return;
            }
            
            const vSid = oCtx.getProperty("ID");
            const sDeletedId = vSid != null ? String(vSid) : "";
            const oRb = this.getResourceBundle();
            
            MessageBox.warning(oRb.getText("deleteSessionConfirm"), {
                title: oRb.getText("deleteSessionTitle"),
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.CANCEL,
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }
                    
                    oCtx.delete("$direct").then(
                        function () {
                            // Explicitly refresh the session list binding
                            const oList = this.byId("sessionList");
                            if (oList) {
                                const oBinding = oList.getBinding("items");
                                if (oBinding) {
                                    oBinding.refresh();
                                }
                            }
                            
                            // If we just deleted the active session, clear the chat
                            var cur = this._sSessionId != null ? String(this._sSessionId) : "";
                            if (cur && sDeletedId && cur === sDeletedId) {
                                this.onNewSession();
                            }
                        }.bind(this)
                    ).catch(function (err) {
                        console.error("Delete session failed", err);
                        MessageToast.show(oRb.getText("deleteSessionFailed"), {
                            at: "center top",
                            my: "center top",
                            offset: "0 100"
                        });
                    });
                }.bind(this)
            });
        },

        _loadSessionHistory: function (sSessionId) {
            const oModel = this.getView().getModel();
            const sPath = `/ChatMessages`;
            // OData V4 bindList(path, context, sorters, filters, parameters) — order matters.
            const oListBinding = oModel.bindList(sPath, null, [
                new sap.ui.model.Sorter("timestamp", false)
            ], [
                new sap.ui.model.Filter("session_ID", sap.ui.model.FilterOperator.EQ, sSessionId)
            ]);

            oListBinding.requestContexts().then(aContexts => {
                const aMessages = aContexts.map(oCtx => {
                    const oData = oCtx.getObject();
                    const isUser = oData.role === "user";
                    return {
                        role: oData.role,
                        content: oData.content,
                        contentHtml: isUser ? "" : this._markdownToHtml(oData.content || ""),
                        justifyContent: isUser ? "End" : "Start",
                        bubbleClass: isUser ? "userBubble" : "agentBubble",
                        toolCalls: [] // Tool calls would need separate load if needed
                    };
                });
                this._oChatModel.setProperty("/messages", aMessages);
            }).catch((err) => {
                console.error("Failed to load session history", err);
                MessageToast.show("Could not load messages for this session", {
                    at: "center top",
                    my: "center top",
                    offset: "0 100"
                });
                this._oChatModel.setProperty("/messages", []);
            });
        },

        onSendMessage: function () {
            const oInput = this.byId("messageInput");
            const sText = oInput.getValue().trim();
            if (!sText) return;

            const sAgentId = this.byId("agentSelect").getSelectedKey();
            if (!sAgentId) {
                MessageToast.show("Please select an agent", {
                    at: "center top",
                    my: "center top",
                    offset: "0 100"
                });
                return;
            }

            // Append user message
            const aMessages = this._oChatModel.getProperty("/messages");
            aMessages.push({
                role: "user",
                content: sText,
                contentHtml: "",
                justifyContent: "End",
                bubbleClass: "userBubble"
            });

            // Add placeholder for assistant message
            const oAssistantMsg = {
                role: "assistant",
                content: "",
                contentHtml: "",
                justifyContent: "Start",
                bubbleClass: "agentBubble streaming",
                toolCalls: []
            };
            aMessages.push(oAssistantMsg);
            this._oChatModel.setProperty("/messages", aMessages);

            this._sLastUserMessage = sText;
            oInput.setValue("");
            this._oChatModel.setProperty("/isStreaming", true);
            this.byId("sendBtn").setVisible(false);
            this.byId("stopBtn").setVisible(true);

            this._scrollToBottom();
            this._openChatStream(sAgentId, sText);
        },

        _openChatStream: async function (sAgentId, sMessage) {
            this._abortController = new AbortController();
            
            try {
                const response = await fetch("/api/chat", {
                    method: "POST",
                    credentials: "include",
                    headers: Object.assign(
                        { "Content-Type": "application/json" },
                        DevAuth.authorizationHeaders()
                    ),
                    body: JSON.stringify({
                        agentId: sAgentId,
                        message: sMessage,
                        sessionId: this._sSessionId
                    }),
                    signal: this._abortController.signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                this._handleStreamEvent(data);
                            } catch (e) {
                                console.error("Error parsing SSE data", e, line);
                            }
                        }
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Stream aborted');
                } else {
                    console.error("Stream error", err);
                    MessageToast.show("Error: " + err.message, {
                        at: "center top",
                        my: "center top",
                        offset: "0 100"
                    });
                    this._finalizeStream();
                }
            }
        },

        _handleStreamEvent: function (oEvent) {
            const aMessages = this._oChatModel.getProperty("/messages");
            const oCurrentMsg = aMessages[aMessages.length - 1];

            switch (oEvent.type) {
                case "token":
                    oCurrentMsg.content += oEvent.content;
                    oCurrentMsg.contentHtml = this._markdownToHtml(oCurrentMsg.content);
                    this._oChatModel.setProperty("/messages", aMessages);
                    this._scrollToBottom();
                    break;
                case "tool_call":
                    oCurrentMsg.toolCalls.push({
                        toolName: oEvent.toolName,
                        args: oEvent.args,
                        durationMs: 0,
                        resultSummary: "..."
                    });
                    this._oChatModel.setProperty("/messages", aMessages);
                    this._scrollToBottom();
                    break;
                case "tool_result":
                    const oCall = oCurrentMsg.toolCalls.find(tc => tc.toolName === oEvent.toolName);
                    if (oCall) {
                        oCall.durationMs = oEvent.durationMs;
                        oCall.resultSummary = oEvent.summary;
                        this._oChatModel.setProperty("/messages", aMessages);
                        this._scrollToBottom();
                    }
                    break;
                case "done":
                    if (oEvent.sessionId) {
                        this._sSessionId = oEvent.sessionId;
                        // Refresh session list
                        this.getView().getModel().refresh();
                    }
                    this._finalizeStream();
                    break;
                case "error":
                    MessageToast.show("Error: " + oEvent.message, {
                        at: "center top",
                        my: "center top",
                        offset: "0 100"
                    });
                    this._finalizeStream();
                    break;
            }
        },

        _scrollToBottom: function () {
            const oScrollContainer = this.byId("messageList").getParent();
            setTimeout(() => {
                const oDomRef = oScrollContainer.getDomRef();
                if (oDomRef) {
                    oDomRef.scrollTop = oDomRef.scrollHeight;
                }
            }, 0);
        },

        _finalizeStream: function () {
            this._oChatModel.setProperty("/isStreaming", false);
            this.byId("sendBtn").setVisible(true);
            this.byId("stopBtn").setVisible(false);
            
            const aMessages = this._oChatModel.getProperty("/messages");
            const oCurrentMsg = aMessages[aMessages.length - 1];
            if (oCurrentMsg && oCurrentMsg.role === "assistant") {
                oCurrentMsg.bubbleClass = "agentBubble";
                oCurrentMsg.contentHtml = this._markdownToHtml(oCurrentMsg.content || "");
                this._oChatModel.setProperty("/messages", aMessages);
            }
            this._abortController = null;
        },

        onStop: function () {
            if (!this._abortController) {
                return;
            }
            this._abortController.abort();

            const aMessages = this._oChatModel.getProperty("/messages");
            const oCurrentMsg = aMessages[aMessages.length - 1];
            let sAssistant = "";
            if (oCurrentMsg && oCurrentMsg.role === "assistant") {
                oCurrentMsg.content += " [stopped]";
                oCurrentMsg.contentHtml = this._markdownToHtml(oCurrentMsg.content);
                sAssistant = oCurrentMsg.content;
                this._oChatModel.setProperty("/messages", aMessages);
            }

            const sAgentId = this.byId("agentSelect").getSelectedKey();
            const oBody = {
                agentId: sAgentId,
                sessionId: this._sSessionId,
                userMessage: this._sLastUserMessage,
                assistantContent: sAssistant
            };

            this._finalizeStream();

            fetch("/api/chat/save-partial", {
                method: "POST",
                credentials: "include",
                headers: Object.assign(
                    { "Content-Type": "application/json" },
                    DevAuth.authorizationHeaders()
                ),
                body: JSON.stringify(oBody)
            })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error("save-partial " + res.status);
                    }
                    return res.json();
                })
                .then((data) => {
                    if (data.sessionId) {
                        this._sSessionId = data.sessionId;
                    }
                    this.getView().getModel().refresh();
                })
                .catch((err) => {
                    console.error(err);
                    MessageToast.show(this.getResourceBundle().getText("savePartialFailed"), {
                        at: "center top",
                        my: "center top",
                        offset: "0 100"
                    });
                });
        },

        onAttachPress: function () {
            MessageToast.show(this.getResourceBundle().getText("composerAttachNotImplemented"), {
                at: "center top",
                my: "center top",
                offset: "0 100"
            });
        },

        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Renders assistant markdown to safe HTML (DOMPurify). Falls back to escaped plain text if libs missing.
         * @param {string} sRaw markdown
         * @returns {string} HTML fragment for sap.ui.core.HTML
         */
        _markdownToHtml: function (sRaw) {
            var s = sRaw || "";
            if (!s) {
                return "";
            }
            var escapeHtml = function (t) {
                return String(t)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;");
            };
            try {
                if (typeof window !== "undefined" && window.marked && window.DOMPurify) {
                    var sHtml = window.marked.parse(s, { breaks: true, gfm: true });
                    var clean = window.DOMPurify.sanitize(sHtml, { USE_PROFILES: { html: true } });
                    return "<div class=\"acpMarkdownBody\">" + clean + "</div>";
                }
            } catch (e) {
                console.warn("acp.chat: markdown render failed", e);
            }
            return "<div class=\"acpMarkdownBody acpMarkdownBody--plain\"><pre>" + escapeHtml(s) + "</pre></div>";
        },

        /** OData V4 timestamps may not parse as UI5 DateTime — normalize for display. */
        formatSessionDate: function (v) {
            if (v == null || v === "") {
                return "";
            }
            var d;
            if (v instanceof Date) {
                d = v;
            } else if (typeof v === "object" && v != null && typeof v.getTime === "function") {
                d = v;
            } else {
                d = new Date(v);
            }
            if (isNaN(d.getTime())) {
                return "";
            }
            return DateFormat.getDateTimeInstance({ style: "short" }).format(d);
        }
    });
});
