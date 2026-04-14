sap.ui.define([], function () {
    "use strict";

    function useDummyAuth() {
        return window.localStorage.getItem("acpUseDummyAuth") === "true";
    }

    function authorizationHeaders() {
        if (!useDummyAuth()) {
            return {};
        }
        var u = window.localStorage.getItem("acpDevUser") || "alice";
        var p = window.localStorage.getItem("acpDevPass") || "alice";
        return { Authorization: "Basic " + btoa(u + ":" + p) };
    }

    return {
        useDummyAuth: useDummyAuth,
        authorizationHeaders: authorizationHeaders
    };
});
