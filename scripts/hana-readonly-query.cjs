#!/usr/bin/env node
/**
 * Read-only HANA helper: runs a single SELECT using HANA_* from repo-root .env
 * Usage: node scripts/hana-readonly-query.cjs "SELECT 1 FROM DUMMY"
 */
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const hana = require("@sap/hana-client");

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) {
    console.error("Missing .env at", filePath);
    process.exit(1);
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function assertSelectOnly(sql) {
  const s = sql.trim().replace(/;+\s*$/g, "");
  if (!/^select\b/i.test(s)) {
    console.error("Only SELECT statements are allowed.");
    process.exit(1);
  }
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|call)\b/i.test(s)) {
    console.error("Statement contains forbidden keyword.");
    process.exit(1);
  }
  return s;
}

const sqlArg = process.argv.slice(2).join(" ").trim();
if (!sqlArg) {
  console.error('Usage: node scripts/hana-readonly-query.cjs "SELECT ..."');
  process.exit(1);
}
const sql = assertSelectOnly(sqlArg);

const root = path.resolve(__dirname, "..");
const env = loadEnvFile(path.join(root, ".env"));
const host = env.HANA_HOST;
const port = env.HANA_PORT || "443";
const user = env.HANA_USER;
const password = env.HANA_PASSWORD;
if (!host || !user || !password) {
  console.error(".env must define HANA_HOST, HANA_USER, HANA_PASSWORD (and optionally HANA_PORT).");
  process.exit(1);
}

const conn = hana.createConnection();
conn.connect(
  {
    serverNode: `${host}:${port}`,
    uid: user,
    pwd: password,
    encrypt: true,
    sslValidateCertificate: false
  },
  (err) => {
    if (err) {
      console.error("Connect error:", err.message);
      process.exit(1);
    }
    conn.exec(sql, [], (e2, rows) => {
      if (e2) {
        console.error("Query error:", e2.message);
        conn.disconnect();
        process.exit(1);
      }
      console.log(JSON.stringify(rows, null, 2));
      conn.disconnect();
    });
  }
);
