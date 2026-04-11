# BTP CLI orchestration — links

- [Download and start using the btp CLI](https://help.sap.com/docs/btp/sap-business-technology-platform/download-and-start-using-btp-cli-client)
- [btp CLI command reference (hub)](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-cli-command-reference)
- [btp assign security/role-collection](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-assign-security-role-collection)
- [Assigning role collections to users or user groups](https://help.sap.com/docs/btp/sap-business-technology-platform/assigning-role-collections-to-users-or-user-groups)
- [Managing users and authorizations using the btp CLI (GitHub doc)](https://github.com/SAP-docs/btp-cloud-platform/blob/main/docs/50-administration-and-ops/managing-users-and-their-authorizations-using-the-btp-cli-94bb593.md)
- [Account administration using the SAP BTP CLI](https://help.sap.com/docs/btp/sap-business-technology-platform/account-administration-using-sap-btp-command-line-interface-btp-cli)
- [Managing API credentials for XSUAA REST APIs](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-api-credentials-for-calling-rest-apis-of-sap-authorization-and-trust-management-service) (machine APIs — not a full substitute for `btp login`)
- [Automation with btp and cf (SAP Community)](https://community.sap.com/t5/technology-blog-posts-by-sap/automation-with-the-btp-and-cf-command-line-interfaces-logging-in-with/ba-p/13571444)
- [Managing trust from SAP BTP to Identity Authentication tenant](https://help.sap.com/docs/btp/sap-business-technology-platform/managing-trust-from-sap-btp-to-identity-authentication-tenant)
- [btp create security/trust](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-create-security-trust)

## This repo

- `xs-security.json` — role collections and XSUAA attribute `dept`
- `doc/Action-Plan/02-btp-infrastructure.md` — cockpit-oriented setup; same outcomes via `btp` where listed
- `scripts/btp-platform.ps1` — BTP CLI wrapper (loads `.env`; no secrets in chat)
- `.cursor/skills/ias-api-orchestration/` — IAS users / SCIM
