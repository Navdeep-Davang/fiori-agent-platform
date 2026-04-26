# Batch 1 — Admin shell governance resilience (parallel track A)

## Summary

Hardened the admin Fiori shell when the governance OData V4 model fails (metadata load, parse errors, or data requests): centralized user-visible errors on an `appState` JSON model, mirrored `mock>/governanceError` for existing formatters and table `noData` logic, added MetaModel `requestFailed` and model `parseError` hooks where supported, wrapped post-metadata init in `try/catch`, converted several `Promise` chains to `.catch()` to avoid unhandled rejections, and fixed a stray duplicate `);` at the end of `App.controller.js`.

## Files changed

| File | Change |
|------|--------|
| `app/admin/webapp/Component.js` | Added named JSON model `appState` with `governanceError`, `governanceLoading`. |
| `app/admin/webapp/view/App.controller.js` | `_getAppStateModel`, `_setGovernanceLoading`, `_setGovernanceShellError` (syncs `appState` + `mock`); extended `_setupGovernanceErrorHandling` (MetaModel `requestFailed`, `attachParseError`); `_initGovernanceAfterMeta` sets loading flag, uses shell helpers, `try/catch` after metadata; `Promise.all` for overview and agent capabilities use `.catch()`; MCP filter, agent tool counts, playground agents use `.catch()`; module-level capability filter loader uses `.catch()`; removed duplicate closing `);`. |
| `app/admin/webapp/view/App.view.xml` | Global `MessageStrip` binds `appState>/governanceError`; informational strips use `appState` for “error present” visibility where they previously checked `mock>/governanceError`. |

## How to verify

1. Start the app router and CAP hybrid as you normally do for the admin app (governance service at `/odata/v4/governance/`).
2. **Happy path:** Open the admin app; confirm the red global strip is hidden, overview counts load, navigation works across pages.
3. **Broken OData (optional):** Point the governance data source URI in `manifest.json` (or destination) to an invalid host/path, rebuild/restart, reload the app. Expect: shell layout and side nav remain usable; a red `MessageStrip` under the main content shows a clear governance/metadata or request message; dismiss via close clears the strip (`onGlobalGovernanceErrorClose`).
4. **Regression:** Agents/Skills table `noDataText` still uses `mock>/governanceError` in the formatter parts list — it stays in sync because the controller mirrors errors onto `mock`.

## Merge notes for parallel agents

- **Single source for the global strip:** Bind UI to `appState>/governanceError`. Any new governance-wide messaging should go through `_setGovernanceShellError` so `mock>/governanceError` stays aligned for legacy `mock` bindings and `_applyGroupFilters` / `formatAgentToolCount`.
- **`governanceLoading`:** Set `true` while `getMetaModel().requestObject("/")` is in flight; cleared on success, failure, or strip close. Not yet bound in XML (reserved for a future busy dot or header state).
- **Parallel refresh race:** Overview and capabilities refreshes are still fired in parallel from `_initGovernanceAfterMeta`; we intentionally **do not** auto-clear the global strip on individual refresh success to avoid one success clearing a banner while the sibling request has already failed. Clearing happens on successful **metadata** load and when the user closes the strip.
- If another batch touches `App.controller.js`, watch for **merge conflicts** around `_initGovernanceAfterMeta`, `_refreshOverviewFromGovernance`, and `_refreshAgentCapabilitiesFromGovernance`.
