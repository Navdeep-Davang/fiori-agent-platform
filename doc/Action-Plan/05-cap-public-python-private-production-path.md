# Action Plan 05 — Public CAP (JWT/OAuth) + Private Python (Trust CAP)

> **Goal:** Reach **production quickly** with a **simple, standard trust model**: **users and browsers** hit only **App Router + CAP** (full **XSUAA / IAS** OAuth and JWT). **Python** is **not** on the public internet; it **only** accepts traffic from **CAP** on a **private** platform path and **trusts CAP** to pass user context (no JWT verification in Python for v1 unless compliance requires it later).
>
> **Local first:** Phases **1–3** can be completed with **App Router, CAP, and Python all running on your machine**, while using **real** cloud **XSUAA, HANA, and IAS** via **`cds bind`**. That gives **prod-like JWT and roles** before any CF deploy; **Phase 4** only swaps **where** those processes run and **URLs** (localhost → deployed / internal). See **Local prod parity** below.
>
> **Builds on:** [Action Plan 04 — Spectrum 1](04-hybrid-hana-spectrum-1.md) (HANA hybrid, mock auth). This plan **replaces** mock auth with **real XSUAA** for hybrid and **aligns** Cloud Foundry deployment with the same architecture.
>
> **Reference:** `doc/Architecture/fiori-agent-platform.md`, [CAP Hybrid Testing](https://cap.cloud.sap/docs/tools/cds-bind), [CAP Authentication](https://cap.cloud.sap/docs/node.js/authentication).
>
> **Prerequisite:** BTP **IAS ↔ subaccount trust**, **XSUAA** service instance from **`xs-security.json`**, **role collections** assigned to test users (see Phase A in prior alignment). **HANA** bound as today.
>
> Last updated: 2026-04-08

---

## Local prod parity (CF + Python on your PC until cutover)

Use this so **development matches production behavior** (same identity, tokens, and trust model) **without** deploying CAP/Python to Cloud Foundry yet.

| Aspect | On your PC (now) | In Cloud Foundry (Phase 4) |
|--------|------------------|----------------------------|
| **IAS + BTP role collections + XSUAA** | Same instances; **`cds bind`** supplies credentials ([Hybrid Testing](https://cap.cloud.sap/docs/tools/cds-bind)) | Same services; bindings via **MTA** / **`VCAP_SERVICES`** on CF |
| **User JWT** | Real token after login via **local App Router** | Same flow; **hostname** changes to **`https://…cfapps…`** (update **redirect URIs**) |
| **CAP** | **`cds watch --profile hybrid`** with **xsuaa** auth | CAP module deployed; same **`xs-security.json`** / CDS auth |
| **App Router** | **`cds bind --exec`** → local Node | Deployed **`@sap/approuter`** app |
| **Python** | **`http://127.0.0.1:8000`** (or similar); only **CAP** should call it (config + no public tunnel) | **Internal** URL only (**`*.apps.internal`** or cluster DNS) + **network policy** |
| **HANA** | **SAP HANA Cloud** via existing hybrid bind | Same HDI instance |

**Same as prod:** **`xs-security.json`**, trust model (**AR → CAP → private Python**), **CAP → Python** user context contract, **Fiori** entry via **App Router** (not raw CAP port).

**Differs only locally:** URLs use **localhost / 127.0.0.1** instead of **public or internal CF hostnames**; **isolation** of Python is **“only CAP on this machine talks to Python”** instead of **CF internal routing**—**intent** is the same.

**Transition when ready:** (1) Freeze Phases **1–3** (real login, roles, chat/agents). (2) Deploy **AR + CAP + Python** to CF. (3) Set **`PYTHON_URL`** (and internal base URL) to the **internal** Python base URL. (4) Add **production App Router** URL to **XSUAA / IAS** redirect URIs. (5) Re-run Phase **5** smoke tests—behavior should match local because **BTP services** were already the same.

---

## Principles (do not skip)

| Layer | Responsibility |
|--------|------------------|
| **App Router** (public) | OAuth login, session, forward **`Authorization`** to CAP where configured. |
| **CAP** (public API / OData / custom routes) | **Validates JWT** (`@sap/xssec` / CDS auth), **`@requires` / `@restrict`**, resolves **user + roles + `dept`** for HANA governance. |
| **Python** (private) | **No** public route in production. **Trust** requests that arrive **only** from CAP on the **internal** URL; read **user identity / role hints** from **CAP-supplied** headers or body (contract documented in code when implemented). |

**Non‑negotiables:** Python **must not** be reachable from the internet in prod; **CAP** must be the **only** caller allowed by **network** (CF internal route / Kyma ClusterIP + policy).

---

## Phase 1 — BTP & identity (confirm before code churn)

- [ ] **Task 1.1:** Confirm **subaccount trust** to **IAS** and that test users (**alice / bob / carol / dave**) have **correct BTP role collections** (`scripts/btp-platform.ps1` or cockpit) — **ACP** collections match **`xs-security.json`**. *Pending: `btp login` on this machine — last run failed with “Unknown session.”*
- [ ] **Task 1.2:** Confirm **XSUAA** instance exists and **`xs-security.json`** **redirect URIs** will include **localhost** (hybrid) and **production App Router URL** (when known). *Repo: localhost callbacks added under `oauth2-configuration.redirect-uris`; production placeholder in `05-production-hostnames.TEMPLATE.md`. Live subaccount XSUAA not verified in this cycle.*
- [x] **Task 1.3:** Document **production** hostnames (App Router, CAP) for redirect URIs and **destinations**; keep **out of git** if sensitive.

---

## Phase 2 — Hybrid: real XSUAA + App Router (local)

- [x] **Task 2.1:** **`cds bind`** to **XSUAA** (and keep **HANA** bind) for profile **`hybrid`**; run **`cds watch --profile hybrid`** with **`auth`** **`xsuaa`** / **`jwt`** per CAP docs (replace **`dummy`** for hybrid when switching).
- [x] **Task 2.2:** Start **App Router** with **`cds bind --exec`** so **`VCAP_SERVICES`** includes XSUAA ([CAP — Running App Router](https://cap.cloud.sap/docs/node.js/authentication#running-app-router)).
- [x] **Task 2.3:** Update **`oauth2-configuration.redirect-uris`** for **`http://localhost:<port>/login/callback`** (and paths your router uses); **`cf update-service`** / redeploy XSUAA config as required.
- [x] **Task 2.4:** Remove or **fence off** **mock-only** paths: **`DevAuth.js`** Basic/localStorage defaults, **`/api`** **Basic** middleware in **`srv/server.js`** — replace with **JWT-backed** flow or **single** dev flag so normal runs use **OAuth only**.
- [x] **Task 2.5:** **Fiori** entry through **App Router** URL (not raw CAP port) for login; document in **`README.md`**.

---

## Phase 3 — CAP → Python contract (trust CAP, private Python)

- [x] **Task 3.1:** Define **one** internal base URL for Python (**`PYTHON_URL`** local: `http://127.0.0.1:8000`; prod: **internal** hostname only — CF **`apps.internal`** or Kyma **cluster DNS**).
- [x] **Task 3.2:** **CAP** forwards **user context** to Python (e.g. user id, `dept`, role names) using **headers or JSON** agreed in implementation; **only** CAP handlers that already ran **authenticated** CAP middleware may set these.
- [x] **Task 3.3:** **Python** rejects requests **without** trusted context headers **or** optional **shared secret** (`X-Internal-Token` from env) for **defense in depth** on the internal hop — **lightweight**, not full JWT stack.
- [x] **Task 3.4:** **SSE / streaming:** authenticate **user** at **CAP** when the browser stream starts; **CAP ↔ Python** stream uses the **same** internal trust rules (one **server-to-server** trust, not JWT per SSE chunk).
- [x] **Task 3.5:** Document in **`doc/Architecture/`** or **`README`**: “**Python is not a public OAuth client**; identity is **vouched by CAP** on private network.”

---

## Phase 4 — Production deploy (Cloud Foundry first; Kyma optional later)

- [ ] **Task 4.1:** **MTA / manifest**: deploy **App Router**, **CAP**, **Python**; **only** App Router + CAP get **public routes**; Python **internal route only** or **no public route** + **internal** map-route / space DNS.
- [ ] **Task 4.2:** **Network:** restrict so **only CAP** (and ops SSH if needed) can **HTTP** to Python (CF **network policy** / **internal domain**; Kyma **NetworkPolicy** when on Kyma).
- [ ] **Task 4.3:** **Environment:** `PYTHON_URL` for CAP points to **internal** Python URL in prod; **no** `PYTHON_URL` pointing to public internet for server-side calls.
- [ ] **Task 4.4:** **Redirect URIs** on XSUAA updated to **https://\<approuter\>…/login/callback**; redeploy / update service.
- [ ] **Task 4.5:** Smoke test: login as **each** role user → chat + agents + governance behave per **HANA** rules; **direct** curl to Python **public URL** must **fail** (no route or 403).

---

## Phase 5 — Verification checklist

- [ ] **Task 5.1:** Hybrid: login via **App Router** → CAP sees **`req.user`** with **IAS-backed** identity and **scopes**.
- [ ] **Task 5.2:** **JWT** decoded once (debug) — **scopes** match **role collections** from Phase 1.
- [ ] **Task 5.3:** Python logs show **only** internal calls from CAP; **no** browser-origin requests to Python.
- [ ] **Task 5.4:** **Load / latency:** acceptable for pilot (JWT verification **only** on CAP for user requests; Python **without** JWKS if following this plan).

---

## Phase 6 — Optional later (not required for “fastest path”)

- [ ] **Task 6.1:** Add **JWT validation in Python** (PyJWT + JWKS) if **policy** requires **defense-in-depth** on every tier.
- [ ] **Task 6.2:** **mTLS** or **service mesh** identity between CAP and Python if **zero-trust** mandates cryptographic peer proof beyond private IP.

---

## Notes for orchestrators

- **Local prod parity:** You can complete **Phases 1–3** with **all three runtimes on your PC**; **Phase 4** is the **CF cutover** (same architecture, different hosts). See **Local prod parity** above.
- **Order:** Finish **Phase 1** (BTP roles) before flipping **Phase 2** auth, or JWTs will lack scopes.
- **Spectrum 2 / 3:** Action Plan **04** Phase 5 placeholders are **superseded** by this file for **XSUAA hybrid + CF** sequencing; keep **04** for **HANA-only** history.
- **Do not** commit **service keys**, **`.cdsrc-private.json`**, or production URLs with secrets into git.
