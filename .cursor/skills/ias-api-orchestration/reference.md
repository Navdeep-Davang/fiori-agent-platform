# IAS + BTP orchestration — reference links

Use these when implementation details or URLs change; prefer SAP Help over blog-only steps.

## SAP Cloud Identity Services

- [API documentation (hub)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/apis)
- [Identity Authentication (overview)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/source-identity-authentication)
- [Configure client for token endpoint (client credentials)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/configure-client-to-call-identity-authentication-token-endpoint-for-client-credentials-flow)
- [User attributes (incl. custom)](https://help.sap.com/docs/cloud-identity-services/cloud-identity-services/user-attributes)

## SAP BTP CLI

- [Download and start using btp CLI](https://help.sap.com/docs/btp/sap-business-technology-platform/download-and-start-using-btp-cli-client)
- [btp assign security/role-collection](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-assign-security-role-collection)
- [btp create security/trust](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-create-security-trust)
- [Managing trust from SAP BTP to Identity Authentication tenant](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-trust-from-sap-btp-to-identity-authentication-tenant)

## SAP Community (background)

- [Know more about SAP IAS SCIM APIs](https://community.sap.com/t5/technology-blogs-by-sap/know-more-about-sap-ias-scim-apis-latest/bc-p/13739347) — verify against current product doc before relying on paths.

## This repository

- `xs-security.json` — XSUAA attribute `dept`, role templates, role collections.
- `doc/Action-Plan/02-btp-infrastructure.md` — IAS users, custom attributes, trust, role assignment (cockpit-oriented; same steps map to SCIM + `btp`).
- `scripts/ias-scim.ps1` — Local IAS tool (OAuth + SCIM); loads `.env` / `.env.local`; see skill **Agent tool contract**.
