sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment"
], function (Controller, JSONModel, MessageToast, MessageBox, Fragment) {
    "use strict";

    return Controller.extend("acp.chat.controller.Chat", {
        onInit: function () {
            this._oChatModel = new JSONModel({
                messages: [],
                isStreaming: false
            });
            this.getView().setModel(this._oChatModel, "chatModel");

            this._oAgentsModel = new JSONModel([]);
            this.getView().setModel(this._oAgentsModel, "agentsModel");

            this._sSessionId = null;
            this._abortController = null;

            this._loadAgents();
        },

        _loadAgents: function () {
            fetch("/api/agents")
                .then(res => res.json())
                .then(data => {
                    this._oAgentsModel.setData(data);
                    if (data.length > 0) {
                        this.byId("agentSelect").setSelectedKey(data[0].ID);
                    }
                })
                .catch(err => {
                    console.error("Failed to load agents", err);
                    MessageToast.show("Failed to load agents");
                });
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

        _loadSessionHistory: function (sSessionId) {
            const oModel = this.getView().getModel();
            const sPath = `/ChatMessages`;
            const oListBinding = oModel.bindList(sPath, null, [
                new sap.ui.model.Filter("session_ID", sap.ui.model.FilterOperator.EQ, sSessionId)
            ], [
                new sap.ui.model.Sorter("timestamp", false)
            ]);

            oListBinding.requestContexts().then(aContexts => {
                const aMessages = aContexts.map(oCtx => {
                    const oData = oCtx.getObject();
                    const isUser = oData.role === "user";
                    return {
                        role: oData.role,
                        content: oData.content,
                        justifyContent: isUser ? "End" : "Start",
                        bubbleClass: isUser ? "userBubble" : "agentBubble",
                        toolCalls: [] // Tool calls would need separate load if needed
                    };
                });
                this._oChatModel.setProperty("/messages", aMessages);
            });
        },

        onSendMessage: function () {
            const oInput = this.byId("messageInput");
            const sText = oInput.getValue().trim();
            if (!sText) return;

            const sAgentId = this.byId("agentSelect").getSelectedKey();
            if (!sAgentId) {
                MessageToast.show("Please select an agent");
                return;
            }

            // Append user message
            const aMessages = this._oChatModel.getProperty("/messages");
            aMessages.push({
                role: "user",
                content: sText,
                justifyContent: "End",
                bubbleClass: "userBubble"
            });

            // Add placeholder for assistant message
            const oAssistantMsg = {
                role: "assistant",
                content: "",
                justifyContent: "Start",
                bubbleClass: "agentBubble streaming",
                toolCalls: []
            };
            aMessages.push(oAssistantMsg);
            this._oChatModel.setProperty("/messages", aMessages);

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
                    headers: { "Content-Type": "application/json" },
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
                    MessageToast.show("Error: " + err.message);
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
                    MessageToast.show("Error: " + oEvent.message);
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
                this._oChatModel.setProperty("/messages", aMessages);
            }
            this._abortController = null;
        },

        onStop: function () {
            if (this._abortController) {
                this._abortController.abort();
                this._finalizeStream();
                
                // Add [stopped] suffix to current message
                const aMessages = this._oChatModel.getProperty("/messages");
                const oCurrentMsg = aMessages[aMessages.length - 1];
                if (oCurrentMsg && oCurrentMsg.role === "assistant") {
                    oCurrentMsg.content += " [stopped]";
                    this._oChatModel.setProperty("/messages", aMessages);
                }
            }
        },

        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        }
    });
});
