---
task_id: ap05-phase1-btp
status: PARTIAL
started: 2026-04-12T00:00:00Z
completed: 2026-04-12T00:00:00Z
model_used: default
---

## Summary

**1.1** — Ran `scripts/btp-platform.ps1` (`Target`, `CheckLogin`, `ListTrust`). The BTP CLI session is **not** logged in (`Unknown session. Please log in.`), so **no live** trust or role-collection list was retrieved. **`BTP_SUBACCOUNT_ID` appears to be set** (script reached `btp target` / `btp` calls; no `Set BTP_SUBACCOUNT_ID in .env` error). **1.2** — Documented XSUAA provisioning from `mta.yaml` and `xs-security.json`; **redirect URIs are not defined in `xs-security.json` today** — they must be added under `oauth2-configuration.redirect-uris` for hybrid/prod (Plan 05 Phase 2+). **1.3** — Added non-secret placeholder template `doc/Action-Plan/05-production-hostnames.TEMPLATE.md`.

## Changes Made

### Files Created

- `doc/Action-Plan/05-production-hostnames.TEMPLATE.md` — placeholders for App Router public URL, CAP URL, internal Python URL; OAuth redirect checklist; note to keep real values in user notes or gitignored env.

### Files Modified

- None.

## Verification

### 1.1 — Commands run (sanitized)

**`Target`** (excerpt):

```text
Authorization failed

Unknown session. Please log in.

ERROR
```

**`CheckLogin`** (excerpt):

```text
SAP BTP command line interface (client v2.106.1)

Authorization failed

Unknown session. Please log in.

ERROR
```

**`ListTrust`** (same auth failure; no trust rows returned).

**Inference:** If `BTP_SUBACCOUNT_ID` were missing, the script would fail with: `Set BTP_SUBACCOUNT_ID in .env (subaccount UUID from Cockpit URL or btp list).` That message did **not** appear, so the variable is **loaded** for this workspace (via `.env` / `.env.local` per script — contents not read by this agent).

**Expected role-collection names** from `xs-security.json` (for post-login comparison):

- `ACP Chat User`
- `ACP Agent Author`
- `ACP Platform Admin`
- `ACP Auditor`

**IAS trust:** Not listed; **blocked** until `btp login` succeeds and `ListTrust` / cockpit verification can run.

### 1.2 — XSUAA provisioning (repo)

`mta.yaml` resource `acp-xsuaa`:

```yaml
  - name: acp-xsuaa
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json
      config:
        xsappname: agent-control-plane
        tenant-mode: dedicated
```

`xs-security.json` defines `xsappname` **agent-control-plane**, scopes, role-templates, and **`role-collections`** matching the four **ACP** names above (lines 61–81 in current file).

**Redirect URIs:** The committed `xs-security.json` has **no** `oauth2-configuration` / `redirect-uris` block. For hybrid + production, add **`oauth2-configuration.redirect-uris`** including:

- **Production:** `https://<approuter-host>/login/callback` (placeholder; real host from `cf app acp-approuter` or similar after deploy).
- **Local App Router:** `http://localhost:<port>/login/callback` — project docs use **default port 5000** unless `PORT` is set (`README.md`: default **http://localhost:5000**; confirm in app router console when running).

App Router `package.json` has no fixed `PORT`; `@sap/approuter` defaults are documented in README as 5000 for local use.

### 1.3 — Template file

See `doc/Action-Plan/05-production-hostnames.TEMPLATE.md` (placeholders only; no secrets).

## Issues

- **BTP CLI:** Not authenticated on this machine — **1.1** cannot confirm IAS trust, role collections in subaccount, or user assignments for alice/bob/carol/dave.
- **Next step for user:** Run **`btp login`** (interactive), then re-run:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/btp-platform.ps1 -Action Target`
  - `-Action ListTrust`
  - `-Action ListRoleCollections`
  - Compare collection **names** to the four **ACP** entries in `xs-security.json`.

## Notes for Master

- Status **PARTIAL** is due to **auth blocker** on live BTP API calls; file-based analysis for **1.2** and template **1.3** are done.
- Per **verify-before-advance**, do not mark Phase **1.1** complete in the action plan until `ListTrust` / `ListRoleCollections` succeed and names align (and user assignments are confirmed if in scope for that task).

## Checkbox sync (`doc/Action-Plan/05-cap-public-python-private-production-path.md` Phase 1)

| Line / task | Mark `[X]`? | Why |
|-------------|-------------|-----|
| **Task 1.1** (trust + role collections + users) | **No** | Live `btp` calls failed; no trust or role list output; cannot verify IAS or alice/bob/carol/dave assignments. |
| **Task 1.2** (XSUAA + redirect URIs for localhost + prod) | **Optional partial** | XSUAA wiring in `mta.yaml` / `xs-security.json` is confirmed from repo; **redirect URIs are not yet in `xs-security.json`** — full “confirm” may wait until Phase 2 adds `oauth2-configuration` or CF service is inspected. |
| **Task 1.3** (production hostnames documented; out of git if sensitive) | **Yes** | `doc/Action-Plan/05-production-hostnames.TEMPLATE.md` added with placeholders and instructions for user-owned notes / `.env`. |

**Recommended:** Leave all three Phase 1 checkboxes **`[ ]`** until the user completes **`btp login`** and a follow-up run confirms **1.1**; optionally mark **1.3** `[X]` only if the orchestrator accepts template-only completion for that line.
