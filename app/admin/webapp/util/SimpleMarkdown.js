sap.ui.define([], function () {
    "use strict";

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /**
     * Minimal markdown → safe HTML (assistant audit transcript). Escapes first; supports **bold**, *italic*, bullets (* or -).
     */
    function simpleMarkdownToHtml(text) {
        var raw = String(text || "").replace(/\r\n/g, "\n");
        var lines = raw.split("\n");
        var out = [];
        var inUl = false;
        function closeUl() {
            if (inUl) {
                out.push("</ul>");
                inUl = false;
            }
        }
        function inlineFmt(escapedLine) {
            var s = escapedLine;
            s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
            s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
            return s;
        }
        lines.forEach(function (line) {
            var bullet = /^[\*\-]\s+(.+)$/.exec(line);
            if (bullet) {
                if (!inUl) {
                    out.push("<ul>");
                    inUl = true;
                }
                out.push("<li>" + inlineFmt(escapeHtml(bullet[1])) + "</li>");
            } else {
                closeUl();
                if (line.trim() === "") {
                    out.push("<br/>");
                } else {
                    out.push("<p>" + inlineFmt(escapeHtml(line)) + "</p>");
                }
            }
        });
        closeUl();
        return out.join("");
    }

    function formatAuditMessageBody(content, role) {
        var r = String(role || "").toLowerCase();
        var text = content == null ? "" : String(content);
        if (r !== "assistant") {
            return '<div class="acpAuditPlain">' + escapeHtml(text).replace(/\n/g, "<br/>") + "</div>";
        }
        return '<div class="acpAuditMd">' + simpleMarkdownToHtml(text) + "</div>";
    }

    return {
        escapeHtml: escapeHtml,
        simpleMarkdownToHtml: simpleMarkdownToHtml,
        formatAuditMessageBody: formatAuditMessageBody
    };
});
