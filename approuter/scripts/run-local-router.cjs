"use strict";
/**
 * Temporarily swaps xs-app.json with xs-app.local.json (no XSUAA) for local dev,
 * then restores production xs-app.json when the app router exits.
 *
 * Lives under approuter/scripts/; all file paths are relative to the approuter package root.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const dir = path.join(__dirname, "..");
const prodPath = path.join(dir, "xs-app.json");
const localPath = path.join(dir, "xs-app.local.json");
const backupPath = path.join(dir, "xs-app.json.prod-backup");

if (!fs.existsSync(localPath)) {
    console.error("xs-app.local.json not found.");
    process.exit(1);
}

fs.copyFileSync(prodPath, backupPath);
fs.copyFileSync(localPath, prodPath);

function restore() {
    try {
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, prodPath);
            fs.unlinkSync(backupPath);
        }
    } catch (e) {
        console.error("Could not restore xs-app.json:", e.message);
    }
}

function shutdown(code) {
    restore();
    process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const child = spawn(
    process.execPath,
    [path.join(dir, "node_modules", "@sap", "approuter", "approuter.js")],
    { cwd: dir, stdio: "inherit", windowsHide: true }
);

child.on("exit", (code) => shutdown(code));
