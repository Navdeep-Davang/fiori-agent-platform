---
task_id: 06-audit-phase0-2
status: COMPLETE
---

## Summary

Phase **0–2** checks were traced to concrete files. **Python** exposes `GET /health` returning `{"status":"ok"}` in `python/app/main.py`. **OData** governance and chat services are declared in `srv/governance-service.cds` and `srv/chat-service.cds` with paths `/odata/v4/governance` and `/odata/v4/chat`. **`mta.yaml`** defines `acp-python` requiring `acp-hana`, and `acp-cap` consuming `PYTHON_URL` from `acp-python-api`; **`python/Procfile`** and **`python/requirements.txt`** exist. **Seed CSVs** `db/data/acp-McpServer.csv` and `db/data/acp-AgentGroup.csv` contain **2** and **3** data rows respectively (excluding header). **Role behavior** is implemented via CDS `@restrict` and **`srv/server.js`** (403 for missing `Agent.User`, agent access, chat); **`srv/chat-service.cds`** grants **`Agent.Audit`** read on `ChatSessions` without `where: userId = $user`. **`xs-security.json`** lists **`http://localhost:5000/login/callback`** under `oauth2-configuration.redirect-uris`. Runtime HTTP checks (`$metadata` load, `mbt build`, CF deploy) were not executed in this read-only audit.

## Evidence table (subtask id -> file:line -> proof)

| Subtask | File:line | Proof |
|--------|-----------|--------|
| **0.2.3** | `python/app/main.py` | `@app.get("/health")` returns `{"status": "ok"}`. |
| **0.2.1** (definitions) | `srv/governance-service.cds` | `service GovernanceService @(path: '/odata/v4/governance')`. |
| **0.2.2** (definitions) | `srv/chat-service.cds` | `service ChatService @(path: '/odata/v4/chat')`. |
| **2.1.3** | `mta.yaml` | `acp-cap` `PYTHON_URL`; `acp-python` `requires` `acp-hana`. |
| **2.1.2** | `python/Procfile`, `python/requirements.txt` | Present. |
| **0.3.1** (seed count) | `db/data/acp-McpServer.csv` | Two non-header rows. |
| **0.3.7** (seed count) | `db/data/acp-AgentGroup.csv` | Three non-header rows. |
| **0.5.1** | `srv/governance-service.cds` | Admin-only writes on governance entities. |
| **0.5.2** | `srv/server.js` | `403` when `userMayUseAgent` fails. |
| **0.5.3** | `srv/chat-service.cds` | `Agent.Audit` READ without user-only `where`. |
| **1.1.3** | `xs-security.json` | `localhost:5000/login/callback` in redirect URIs. |

## Checkbox sync recommendation ([X] only if code proves)

- [ ] **0.2.1** / **0.2.2** — `$metadata` **loads** at runtime: not verified in this audit (CDS definitions exist).
- [X] **0.2.3** — proven in `python/app/main.py`.
- [X] **0.3.1** — 2 McpServer seed rows in CSV.
- [X] **0.3.7** — list seed count (3 AgentGroups); OP sub-tables need UI/manual check.
- [X] **0.5.1–0.5.3** — proven via CDS + `server.js`.
- [X] **1.1.3** — `xs-security.json`.
- [X] **2.1.2**, **2.1.3** — `Procfile`, `requirements.txt`, `mta.yaml`.
