sap.ui.define([], function () {
    "use strict";

    /** When "true", send Basic auth (profile `development` + ACP_USE_DUMMY_AUTH on CAP). Default: App Router session / Bearer only. */
    function useDummyAuth() {
        return window.localStorage.getItem("acpUseDummyAuth") === "true";
    }

    /**
     * Extra headers for OData and /api. With real XSUAA (hybrid), use same-origin fetch + cookies; omit Basic.
     */
    function authorizationHeaders() {
        if (!useDummyAuth()) {
            return {};
        }
        var u = window.localStorage.getItem("acpDevUser") || "alice";
        var p = window.localStorage.getItem("acpDevPass") || "alice";
        return { Authorization: "Basic " + btoa(u + ":" + p) };
    }

    /** @deprecated use authorizationHeaders — kept for older call sites */
    function basicAuthorizationValue() {
        var h = authorizationHeaders();
        return h.Authorization || "";
    }

    return {
        useDummyAuth: useDummyAuth,
        authorizationHeaders: authorizationHeaders,
        basicAuthorizationValue: basicAuthorizationValue
    };
});
