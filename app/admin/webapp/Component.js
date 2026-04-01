sap.ui.define(
    ["sap/fe/core/AppComponent", "acp/admin/utils/DevAuth"],
    function (Component, DevAuth) {
        "use strict";

        return Component.extend("acp.admin.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                Component.prototype.init.apply(this, arguments);
                try {
                    var oModel = this.getModel();
                    if (oModel && oModel.isA && oModel.isA("sap.ui.model.odata.v4.ODataModel")) {
                        var auth = { Authorization: DevAuth.basicAuthorizationValue() };
                        if (typeof oModel.changeHttpHeaders === "function") {
                            oModel.changeHttpHeaders(auth);
                        } else if (typeof oModel.setHttpHeaders === "function") {
                            oModel.setHttpHeaders(auth);
                        }
                    }
                } catch (e) {
                    console.error("acp.admin: OData auth headers", e);
                }
            }
        });
    }
);
