#!/usr/bin/env node
/**
 * Check Sync Status
 * 
 * Reports the sync status of all action plans in the project.
 * 
 * Usage: node check-sync-status.js [workspace-path]
 */

const fs = require('fs');
const path = require('path');

// Get workspace root
const workspaceRoot = process.argv[2] || process.env.CURSOR_PROJECT_DIR || process.cwd();
const manifestPath = path.join(workspaceRoot, 'doc', '.manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.log('No manifest found at:', manifestPath);
  console.log('Run init-manifest.js to initialize project orchestration.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('='.repeat(60));
console.log('Project Sync Status Report');
console.log('='.repeat(60));
console.log('');
console.log(`Project: ${manifest.project_id}`);
console.log(`Last Updated: ${manifest.last_updated}`);
console.log('');

// Report architectures
const architectures = manifest.artifacts?.architectures || {};
const archCount = Object.keys(architectures).length;

console.log(`Architectures: ${archCount}`);
for (const [id, arch] of Object.entries(architectures)) {
  console.log(`  - ${id}: ${arch.path}`);
  console.log(`    Last Modified: ${arch.last_modified}`);
}
console.log('');

// Report action plans
const plans = manifest.artifacts?.action_plans || {};
const planCount = Object.keys(plans).length;

console.log(`Action Plans: ${planCount}`);
console.log('');

let syncedCount = 0;
let outOfSyncCount = 0;

for (const [id, plan] of Object.entries(plans)) {
  const syncIcon = plan.sync_status === 'synced' ? '✓' : '⚠';
  const syncText = plan.sync_status === 'synced' ? 'SYNCED' : 'OUT OF SYNC';
  
  if (plan.sync_status === 'synced') {
    syncedCount++;
  } else {
    outOfSyncCount++;
  }

  console.log(`${syncIcon} ${id}`);
  console.log(`  Path: ${plan.path}`);
  console.log(`  Status: ${syncText}`);
  
  if (plan.architecture_refs && plan.architecture_refs.length > 0) {
    console.log(`  References: ${plan.architecture_refs.join(', ')}`);
  }
  
  if (plan.phases && plan.phases.length > 0) {
    const currentPhase = plan.phases.find(p => p.status === 'in_progress');
    const completedPhases = plan.phases.filter(p => p.status === 'completed').length;
    console.log(`  Progress: ${completedPhases}/${plan.phases.length} phases completed`);
    if (currentPhase) {
      console.log(`  Current Phase: ${currentPhase.name}`);
    }
  }
  console.log('');
}

console.log('='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`Total Plans: ${planCount}`);
console.log(`Synced: ${syncedCount}`);
console.log(`Out of Sync: ${outOfSyncCount}`);

if (outOfSyncCount > 0) {
  console.log('');
  console.log('⚠️  Some plans are out of sync with their architectures.');
  console.log('   Review the architecture changes and update affected plans.');
}
