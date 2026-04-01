sap.ui.define([], function () {
    "use strict";

    /**
     * HTTP Basic header for local CAP `dummy` auth.
     * Override in the browser: localStorage acpDevUser / acpDevPass
     */
    function basicAuthorizationValue() {
        var u = window.localStorage.getItem("acpDevUser") || "bob";
        var p = window.localStorage.getItem("acpDevPass") || "bob";
        return "Basic " + btoa(u + ":" + p);
    }

    return {
        basicAuthorizationValue: basicAuthorizationValue
    };
});
