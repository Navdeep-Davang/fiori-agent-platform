sap.ui.define([
    "sap/ui/core/UIComponent",
    "acp/chat/utils/DevAuth"
], function (UIComponent, DevAuth) {
    "use strict";

    return UIComponent.extend("acp.chat.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            try {
                var oModel = this.getModel();
                if (oModel && oModel.isA && oModel.isA("sap.ui.model.odata.v4.ODataModel")) {
                    var auth = DevAuth.authorizationHeaders();
                    if (Object.keys(auth).length) {
                        if (typeof oModel.changeHttpHeaders === "function") {
                            oModel.changeHttpHeaders(auth);
                        } else if (typeof oModel.setHttpHeaders === "function") {
                            oModel.setHttpHeaders(auth);
                        }
                    }
                }
            } catch (e) {
                console.error("acp.chat: OData auth headers", e);
            }

            this.getRouter().initialize();
        },

        getContentDensityClass: function () {
            if (!this._sContentDensityClass) {
                if (!sap.ui.Device.support.touch) {
                    this._sContentDensityClass = "sapUiSizeCompact";
                } else {
                    this._sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this._sContentDensityClass;
        }
    });
});
