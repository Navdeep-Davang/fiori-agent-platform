# Batch 1 — Playground labeling, agent Select, i18n (parallel track E)

## Scope

- **Playground** (`pagePlayground`): explicit UX that live chat is not wired; agent `Select` options filled from governance `Agents` with `$select: name` after OData metadata succeeds (same pattern as other pages: no `governance>` binding on the Select itself).
- **Resilience**: if the governance model or metadata is missing or the agent list request fails, the dropdown is populated with safe, non-throwing mock rows so the layout does not depend on a live OData binding on the control.
- **i18n**: new user-visible strings live in `app/admin/webapp/i18n/i18n.properties` and are referenced from the playground view or set from the controller via `_i18n()`.

## Files touched

| File | Change summary |
|------|----------------|
| `app/admin/webapp/view/App.view.xml` | Playground: three strips (layout, governance agents hint, chat-not-wired warning); both agent `Select`s bind `items` to `mock>/playgroundAgentSelectItems` with `core:Item` template, `selectedKey` to `mock>/playgroundSelectedAgent`, `forceSelection="false"`; tab labels, panel headers, placeholders, send buttons use `{i18n>…}`. |
| `app/admin/webapp/view/App.controller.js` | `_i18n`, `_seedPlaygroundI18nMessages`, `_setPlaygroundAgentItemsUnavailable`; governance init failure paths call unavailable helper; `_refreshPlaygroundAgentItems` prepends optional row, validates selection against loaded keys, rejects with i18n-backed message; mock echo includes optional selected agent name. |
| `app/admin/webapp/i18n/i18n.properties` | Shared `MsgNotAvailable`, `MsgCouldNotLoadData`; playground keys for strips, labels, chat panel, send, placeholder, optional agent, load failure, seed system message. |
| `app/admin/webapp/Component.js` | `playgroundSelectedAgent`; `playgroundMessages` starts empty (controller seeds i18n). |

## Out of scope (as requested)

- No chat/BFF backend implementation; send remains local mock echo.

## Verification notes

- With governance metadata OK: playground agent lists match OData `Agents` names (plus leading optional row).
- With governance missing or metadata error: dropdown shows a single “Not available” row; no `governance>` binding on Select.
- With agent list request failed: dropdown shows load-failure text including `MsgCouldNotLoadData`.
