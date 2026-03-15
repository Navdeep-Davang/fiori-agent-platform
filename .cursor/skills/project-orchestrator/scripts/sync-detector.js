#!/usr/bin/env node
/**
 * Sync Detector Hook Script
 * 
 * This script is triggered by the afterFileEdit hook when files are modified.
 * It detects changes to architecture documents and marks related action plans
 * as out-of-sync.
 * 
 * Usage: Called automatically by Cursor hooks system
 * Input: JSON via stdin with file_path and edits information
 * Output: JSON via stdout (optional)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read input from stdin
let inputData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(inputData);
    await processFileEdit(input);
    process.exit(0);
  } catch (error) {
    console.error('Sync detector error:', error.message);
    process.exit(0); // Exit 0 to not block the operation
  }
});

async function processFileEdit(input) {
  const { file_path, workspace_roots } = input;
  
  if (!file_path || !workspace_roots || workspace_roots.length === 0) {
    return;
  }

  const workspaceRoot = workspace_roots[0];
  const relativePath = path.relative(workspaceRoot, file_path).replace(/\\/g, '/');

  // Check if the edited file is in an Architecture directory
  if (!isArchitectureFile(relativePath)) {
    return;
  }

  // Find and update the manifest
  const manifestPath = path.join(workspaceRoot, 'doc', '.manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    return; // No manifest, nothing to sync
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Find which architecture ID this file corresponds to
  const archId = findArchitectureId(manifest, relativePath);
  
  if (!archId) {
    return; // File not registered in manifest
  }

  // Update the architecture hash
  const newHash = computeFileHash(file_path);
  manifest.artifacts.architectures[archId].hash = newHash;
  manifest.artifacts.architectures[archId].last_modified = new Date().toISOString();

  // Find all action plans that reference this architecture
  const affectedPlans = findAffectedPlans(manifest, archId);

  // Mark affected plans as out-of-sync
  for (const planId of affectedPlans) {
    const plan = manifest.artifacts.action_plans[planId];
    if (plan.sync_status !== 'out_of_sync') {
      plan.sync_status = 'out_of_sync';
      
      // Also update the action plan file's frontmatter
      await updateActionPlanFrontmatter(workspaceRoot, plan.path);
    }
  }

  // Update manifest timestamp
  manifest.last_updated = new Date().toISOString();

  // Write updated manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Output status for logging
  if (affectedPlans.length > 0) {
    console.log(JSON.stringify({
      status: 'sync_updated',
      architecture: archId,
      affected_plans: affectedPlans
    }));
  }
}

function isArchitectureFile(relativePath) {
  // Check if file is in doc/Architecture/ directory
  const normalized = relativePath.toLowerCase();
  return normalized.includes('doc/architecture/') || 
         normalized.includes('doc\\architecture\\');
}

function findArchitectureId(manifest, relativePath) {
  const architectures = manifest.artifacts?.architectures || {};
  
  for (const [id, arch] of Object.entries(architectures)) {
    const archPath = arch.path.replace(/\\/g, '/');
    const normalizedRelative = relativePath.replace(/\\/g, '/');
    
    if (archPath === normalizedRelative || 
        archPath.endsWith(normalizedRelative) ||
        normalizedRelative.endsWith(archPath)) {
      return id;
    }
  }
  
  return null;
}

function findAffectedPlans(manifest, archId) {
  const plans = manifest.artifacts?.action_plans || {};
  const affected = [];

  for (const [planId, plan] of Object.entries(plans)) {
    const refs = plan.architecture_refs || [];
    if (refs.includes(archId)) {
      affected.push(planId);
    }
  }

  return affected;
}

function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `sha256:${hash}`;
  } catch (error) {
    return `sha256:error-${Date.now()}`;
  }
}

async function updateActionPlanFrontmatter(workspaceRoot, planPath) {
  const fullPath = path.join(workspaceRoot, planPath);
  
  if (!fs.existsSync(fullPath)) {
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // Update sync_status in frontmatter
  // Match YAML frontmatter pattern
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (match) {
    let frontmatter = match[1];
    
    // Update sync_status
    if (frontmatter.includes('sync_status:')) {
      frontmatter = frontmatter.replace(/sync_status:\s*\w+/, 'sync_status: out_of_sync');
    } else {
      frontmatter += '\nsync_status: out_of_sync';
    }

    // Update last_updated
    const today = new Date().toISOString().split('T')[0];
    if (frontmatter.includes('last_updated:')) {
      frontmatter = frontmatter.replace(/last_updated:\s*[\d-]+/, `last_updated: ${today}`);
    }

    content = content.replace(frontmatterRegex, `---\n${frontmatter}\n---`);
    fs.writeFileSync(fullPath, content);
  }

  // Also update the Architecture Reference section status
  content = fs.readFileSync(fullPath, 'utf8');
  content = content.replace(/Status:\s*SYNCED/gi, 'Status: OUT_OF_SYNC');
  fs.writeFileSync(fullPath, content);
}
