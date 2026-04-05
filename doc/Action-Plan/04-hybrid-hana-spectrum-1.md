# Action Plan 04 — Spectrum 1: Local CAP + Python, Mock Auth, HANA Cloud Only

> **Goal:** One source of truth in **SAP HANA Cloud** (BTP). **CAP** and **Python** run **locally**; **authentication is mocked** (CAP `dummy` users). Database access is **HANA / HDI only** (hybrid bind + deploy).
>
> **Spectrums (roadmap):**
>
> | Spectrum | Auth | Runtime | DB |
> |----------|------|---------|-----|
> | **1 (this plan)** | Mock (`dummy`) | CAP + Python **local** | **HANA Cloud** via `cds bind` + `HANA_*` / `VCAP_SERVICES` |
> | **2 (future)** | Real **XSUAA** (hybrid) | Still **local** | Same HANA Cloud |
> | **3 (future)** | XSUAA | **Cloud Foundry** (MTA) | Same binding model as prod |
>
> **Reference:** [CAP Hybrid Testing](https://cap.cloud.sap/docs/tools/cds-bind), `README.md`, `doc/Architecture/fiori-agent-platform.md`.
>
> **Prerequisite:** BTP subaccount with **HANA Cloud** instance **running**, **Cloud Foundry** space, **`hana` / `hdi-shared`** service instance created and bound (or service key) for `cds bind`.
>
> Last updated: 2026-04-05

---

## Phase 1: Configuration & documentation

- [x] **Task 1.1:** Root `package.json` **`cds.requires.db`**: **`[hybrid]`** and **`[production]`** use **`kind: "hana"`** for local + CF.
- [x] **Task 1.2:** Configure **`cds.requires.auth["[hybrid]"]`** with **`kind: "dummy"`** and the same mock users (alice, bob, …) used previously under `[development]`.
- [x] **Task 1.3:** Set **`npm run watch`** → `cds watch --profile hybrid` (local dev **requires** prior **`cds bind db --to <hana-instance>`** per CAP docs).
- [x] **Task 1.4:** Add **`npm run deploy:hana`** → `cds deploy --profile hybrid` (after bind) to push CDS schema + CSV seeds to HDI.
- [x] **Task 1.5:** Root **`devDependencies`** exclude optional file-DB drivers; run **`npm install`** after dependency changes.
- [x] **Task 1.6:** Update **`.env.example`**: document **`HANA_*` as required** for local Python (not optional); point to hybrid workflow.
- [x] **Task 1.7:** Add **`.cdsrc-private.json`** to **`.gitignore`** (binding metadata; no secrets on disk per CAP, but path is machine-specific).
- [x] **Task 1.8:** Update **`README.md`** — prerequisite: **CF login**, **`cds bind`**, **`npm run watch`**, **`npm run deploy:hana`** once, Python **`HANA_*`** aligned with **same** HDI schema as CAP.

---

## Phase 2: Python data path (HANA only)

- [x] **Task 2.1:** Confirm **`python/app/db.py`** uses **only** `hdbcli` + `get_connection()` (raise clear `RuntimeError` if HANA unavailable).
- [x] **Task 2.2:** **Seeding** is **CAP** CSVs under **`db/data/`**, deployed with **`npm run deploy:hana`** (no Python-local seed SQL).
- [x] **Task 2.3:** Ensure **`HANA_SCHEMA`** in `.env` matches **HDI runtime** schema from service key (same schema CAP deploys **`acp_demo_*`** tables into).

---

## Phase 3: Governance & cross-doc alignment

- [x] **Task 3.1:** Align **`doc/Action-Plan/01-application-implementation.md`** banner and DB tasks with **HANA hybrid** (this plan).
- [x] **Task 3.2:** **`doc/Action-Plan/03-data-and-security.md`** deploy note documents **`npm run deploy:hana`** after **`cds bind`**.
- [x] **Task 3.3:** **`doc/Architecture/fiori-agent-platform.md`** file-tree / DB bullets state **HANA-only** for Python SQL tools.

---

## Phase 4: Verification checklist [SIMULATED — requires your BTP]

> Tag **[SIMULATED]** until you run these on your machine with real credentials.

- [ ] **Task 4.1 [SIMULATED]:** `cf login` + `cf target`; `cds bind db --to <your-hana-hdi-instance>`; verify `.cdsrc-private.json` created.
- [ ] **Task 4.2 [SIMULATED]:** `npm run deploy:hana` — zero errors; tables **`acp_*`** and **`acp_demo_*`** present in HANA (Database Explorer or `cds repl --profile hybrid`).
- [ ] **Task 4.3 [SIMULATED]:** `npm run watch` — OData metadata loads; Basic auth **`alice`/`alice`** works for governance.
- [ ] **Task 4.4 [SIMULATED]:** Fill **`.env`** `HANA_*` from **same** service key as CAP; `POST /mcp/tools/call` **`get_vendors`** returns rows consistent with **`acp.demo-Vendor`** seed.

---

## Phase 5: Future (Spectrum 2 & 3) — placeholders only

- [ ] **Task 5.1:** Spectrum 2 — `cds bind` **XSUAA**, extend **`xs-security.json`** redirect URIs for `localhost`, switch **`[hybrid]`** auth from `dummy` to **`xsuaa`** when ready (separate pass).
- [ ] **Task 5.2:** Spectrum 3 — MTA deploy to CF; remove reliance on local `.env` for HANA (use **`VCAP_SERVICES`** only).

---

## Notes for orchestrators

- **Python** does **not** enforce JWT for chat today; **CAP** must remain the only entry from UI. Documented trust model: **CAP-shop** governs tools and identity; Python trusts forwarded context for MCP calls.
- **Trial HANA:** start instance daily; **30-day** idle deletion policy per SAP trial docs — re-deploy + re-seed if instance recreated.
