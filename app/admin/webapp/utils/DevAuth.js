sap.ui.define([], function () {
    "use strict";

    /** Default alice — has Agent.Admin for governance OData. Override: localStorage acpDevUser / acpDevPass */
    function basicAuthorizationValue() {
        var u = window.localStorage.getItem("acpDevUser") || "alice";
        var p = window.localStorage.getItem("acpDevPass") || "alice";
        return "Basic " + btoa(u + ":" + p);
    }

    return { basicAuthorizationValue: basicAuthorizationValue };
});
