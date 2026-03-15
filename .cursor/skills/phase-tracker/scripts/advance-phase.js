#!/usr/bin/env node
/**
 * Advance Phase
 * 
 * Validates phase completion and advances to the next phase.
 * 
 * Usage: node advance-phase.js <plan-id> [--force]
 * 
 * Options:
 *   --force    Advance even if current phase has incomplete tasks
 */

const fs = require('fs');
const path = require('path');

// Get workspace root
const workspaceRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();

// Parse arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
const planId = args.find(a => !a.startsWith('--'));

if (!planId) {
  console.log('Usage: node advance-phase.js <plan-id> [--force]');
  console.log('');
  console.log('Arguments:');
  console.log('  plan-id    ID of the action plan');
  console.log('');
  console.log('Options:');
  console.log('  --force    Advance even if current phase has incomplete tasks');
  process.exit(1);
}

// Check manifest exists
const manifestPath = path.join(workspaceRoot, 'doc', '.manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: Manifest not found. Run init-manifest.js first.');
  process.exit(1);
}

// Read manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Find action plan
const plan = manifest.artifacts.action_plans[planId];
if (!plan) {
  console.error('Error: Action plan not found:', planId);
  console.log('Available plans:', Object.keys(manifest.artifacts.action_plans).join(', '));
  process.exit(1);
}

// Read action plan file
const planPath = path.join(workspaceRoot, plan.path);
if (!fs.existsSync(planPath)) {
  console.error('Error: Action plan file not found:', planPath);
  process.exit(1);
}

let planContent = fs.readFileSync(planPath, 'utf8');

// Find current phase
const currentPhaseIndex = plan.phases.findIndex(p => p.status === 'in_progress');
if (currentPhaseIndex === -1) {
  console.error('Error: No phase is currently in progress');
  console.log('Phase statuses:');
  plan.phases.forEach(p => console.log(`  - ${p.name}: ${p.status}`));
  process.exit(1);
}

const currentPhase = plan.phases[currentPhaseIndex];
const nextPhase = plan.phases[currentPhaseIndex + 1];

// Check if current phase is complete
const phasePattern = new RegExp(
  `## Phase \\d+:.*?${currentPhase.name}[\\s\\S]*?(?=## Phase|$)`,
  'i'
);
const phaseMatch = planContent.match(phasePattern);

if (phaseMatch) {
  const phaseContent = phaseMatch[0];
  const incompleteTasks = (phaseContent.match(/- \[ \]/g) || []).length;
  
  if (incompleteTasks > 0 && !force) {
    console.error(`Error: Phase "${currentPhase.name}" has ${incompleteTasks} incomplete task(s)`);
    console.log('');
    console.log('Complete all tasks before advancing, or use --force to override.');
    process.exit(1);
  }
  
  if (incompleteTasks > 0 && force) {
    console.log(`Warning: Advancing with ${incompleteTasks} incomplete task(s) (--force)`);
  }
}

// Check if there's a next phase
if (!nextPhase) {
  console.log('Congratulations! All phases are complete.');
  
  // Mark current phase as completed
  currentPhase.status = 'completed';
  currentPhase.completed_at = new Date().toISOString();
  
  manifest.last_updated = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  // Update action plan file
  planContent = planContent.replace(
    /### Status: IN_PROGRESS/i,
    '### Status: COMPLETED'
  );
  fs.writeFileSync(planPath, planContent);
  
  console.log('Final phase marked as COMPLETED');
  process.exit(0);
}

// Update manifest
currentPhase.status = 'completed';
currentPhase.completed_at = new Date().toISOString();

nextPhase.status = 'in_progress';
nextPhase.started_at = new Date().toISOString();

manifest.last_updated = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Update action plan file
// Mark current phase as COMPLETED
const currentPhaseStatusRegex = new RegExp(
  `(## Phase \\d+:.*?${currentPhase.name}[\\s\\S]*?)### Status: IN_PROGRESS`,
  'i'
);
planContent = planContent.replace(currentPhaseStatusRegex, '$1### Status: COMPLETED');

// Mark next phase as IN_PROGRESS
const nextPhaseStatusRegex = new RegExp(
  `(## Phase \\d+:.*?${nextPhase.name}[\\s\\S]*?)### Status: PENDING`,
  'i'
);
planContent = planContent.replace(nextPhaseStatusRegex, '$1### Status: IN_PROGRESS');

// Update frontmatter current_phase
planContent = planContent.replace(
  /current_phase:\s*phase-\d+/,
  `current_phase: phase-${currentPhaseIndex + 2}`
);

// Update last_updated
const today = new Date().toISOString().split('T')[0];
planContent = planContent.replace(
  /last_updated:\s*[\d-]+/,
  `last_updated: ${today}`
);

fs.writeFileSync(planPath, planContent);

console.log('Phase advanced successfully!');
console.log('');
console.log(`Completed: ${currentPhase.name}`);
console.log(`Started:   ${nextPhase.name}`);
console.log('');
console.log('Updated files:');
console.log('  - doc/.manifest.json');
console.log(`  - ${plan.path}`);
