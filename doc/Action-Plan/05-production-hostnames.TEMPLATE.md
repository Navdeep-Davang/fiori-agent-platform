# Production / hybrid hostnames (template — placeholders only)

Copy this structure into **user-owned notes** (or extend **gitignored** `.env` / `.env.local`) when you have real URLs. **Do not** commit production URLs if they embed tenant-specific or sensitive routing details you prefer to keep private.

| Placeholder | Description | Example pattern (not real values) |
|-------------|-------------|-----------------------------------|
| `ACP_APPROUTER_PUBLIC_URL` | Browser-facing App Router (OAuth redirect, UI entry). | `https://<approuter-host>.<cf-domain>/` |
| `ACP_CAP_PUBLIC_URL` | Public CAP base URL as seen after App Router or direct route (if any). Often same origin as App Router for path-based routing. | `https://<cap-or-same-as-ar>.<cf-domain>/` or `https://<approuter-host>.<cf-domain>/` when proxied |
| `ACP_PYTHON_INTERNAL_URL` | **Private** Python base URL (CF internal / cluster DNS only). Not for browsers. | `https://<python-app>.apps.internal` or internal service name |

## OAuth2 / XSUAA redirect URI checklist

Register these with the **XSUAA** instance (via `xs-security.json` → `oauth2-configuration.redirect-uris` and `cf update-service` / redeploy as in Action Plan 05 Phase 2–4):

- **Production App Router callback:** `https://<approuter-host>/login/callback`
- **Local hybrid (App Router default port is often 5000; confirm console):** `http://localhost:<port>/login/callback`

## Destinations

CAP/App Router **destinations** in BTP or `default-env.json` should use the **resolved** public bases above where applicable; keep **secrets and service keys** out of git (see repo `.gitignore` and `.env.example` if present).
