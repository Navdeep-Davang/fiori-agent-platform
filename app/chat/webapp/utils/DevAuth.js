sap.ui.define([], function () {
    "use strict";

    /**
     * HTTP Basic header for local CAP `dummy` auth.
     * Override in the browser: localStorage acpDevUser / acpDevPass
     */
    function basicAuthorizationValue() {
        // Default matches README / package.json dummy user with full chat + governance roles.
        var u = window.localStorage.getItem("acpDevUser") || "alice";
        var p = window.localStorage.getItem("acpDevPass") || "alice";
        return "Basic " + btoa(u + ":" + p);
    }

    return {
        basicAuthorizationValue: basicAuthorizationValue
    };
});
