#!/usr/bin/env node
/**
 * Session Initialization Hook Script
 * 
 * This script is triggered by the sessionStart hook when a new session begins.
 * It checks the project state and provides context to the agent.
 * 
 * Usage: Called automatically by Cursor hooks system
 * Input: JSON via stdin with session information
 * Output: JSON via stdout with additional_context
 */

const fs = require('fs');
const path = require('path');

// Read input from stdin
let inputData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(inputData);
    const result = await initializeSession(input);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    // Don't block session on errors
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
});

async function initializeSession(input) {
  const { workspace_roots } = input;
  
  if (!workspace_roots || workspace_roots.length === 0) {
    return { continue: true };
  }

  const workspaceRoot = workspace_roots[0];
  const manifestPath = path.join(workspaceRoot, 'doc', '.manifest.json');
  
  // Check if manifest exists
  if (!fs.existsSync(manifestPath)) {
    return { continue: true };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const contextInfo = generateProjectContext(manifest);
    
    return {
      continue: true,
      additional_context: contextInfo
    };
  } catch (error) {
    return { continue: true };
  }
}

function generateProjectContext(manifest) {
  const lines = [];
  
  lines.push('## Project Orchestration Status');
  lines.push('');
  lines.push(`Project: ${manifest.project_id}`);
  lines.push(`Last Updated: ${manifest.last_updated}`);
  lines.push('');

  // Check for out-of-sync plans
  const plans = manifest.artifacts?.action_plans || {};
  const outOfSync = [];
  const inProgress = [];

  for (const [planId, plan] of Object.entries(plans)) {
    if (plan.sync_status === 'out_of_sync') {
      outOfSync.push({ id: planId, path: plan.path });
    }
    
    const currentPhase = plan.phases?.find(p => p.status === 'in_progress');
    if (currentPhase) {
      inProgress.push({ id: planId, phase: currentPhase.name, path: plan.path });
    }
  }

  if (outOfSync.length > 0) {
    lines.push('### ⚠️ Out-of-Sync Action Plans');
    lines.push('The following plans need review due to architecture changes:');
    for (const plan of outOfSync) {
      lines.push(`- ${plan.id}: ${plan.path}`);
    }
    lines.push('');
  }

  if (inProgress.length > 0) {
    lines.push('### Active Work');
    for (const plan of inProgress) {
      lines.push(`- ${plan.id}: Currently in "${plan.phase}" phase`);
    }
    lines.push('');
  }

  if (outOfSync.length === 0 && inProgress.length === 0) {
    lines.push('All action plans are synced. No active phases in progress.');
  }

  return lines.join('\n');
}
