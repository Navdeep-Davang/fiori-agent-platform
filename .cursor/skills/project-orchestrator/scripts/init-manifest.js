#!/usr/bin/env node
/**
 * Initialize Project Manifest
 * 
 * Creates a new project manifest in the doc/ directory.
 * 
 * Usage: node init-manifest.js [project-id]
 * 
 * If run without arguments, uses the current directory name as project ID.
 */

const fs = require('fs');
const path = require('path');

// Get workspace root from environment or current directory
const workspaceRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();

// Get project ID from argument or derive from directory name
const projectId = process.argv[2] || path.basename(workspaceRoot).toLowerCase().replace(/[^a-z0-9]/g, '-');

// Ensure doc directory exists
const docDir = path.join(workspaceRoot, 'doc');
const architectureDir = path.join(docDir, 'Architecture');
const actionPlansDir = path.join(docDir, 'Action-Plans');

if (!fs.existsSync(docDir)) {
  fs.mkdirSync(docDir, { recursive: true });
}

if (!fs.existsSync(architectureDir)) {
  fs.mkdirSync(architectureDir, { recursive: true });
}

if (!fs.existsSync(actionPlansDir)) {
  fs.mkdirSync(actionPlansDir, { recursive: true });
}

// Create manifest
const manifestPath = path.join(docDir, '.manifest.json');

if (fs.existsSync(manifestPath)) {
  console.log('Manifest already exists at:', manifestPath);
  process.exit(0);
}

const manifest = {
  version: '1.0',
  project_id: projectId,
  created: new Date().toISOString(),
  last_updated: new Date().toISOString(),
  artifacts: {
    architectures: {},
    action_plans: {}
  }
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('Project manifest initialized successfully!');
console.log('Location:', manifestPath);
console.log('Project ID:', projectId);
console.log('');
console.log('Next steps:');
console.log('1. Create architecture documents in doc/Architecture/');
console.log('2. Create action plans in doc/Action-Plans/');
console.log('3. Register them in the manifest');
