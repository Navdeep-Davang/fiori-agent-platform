const cds = require('@sap/cds')

/**
 * AuditService: CDS projections only; no CUD. Optional rules can be added here later
 * (e.g. require $filter on userId for collection reads).
 */
module.exports = cds.service.impl(async function () {})
