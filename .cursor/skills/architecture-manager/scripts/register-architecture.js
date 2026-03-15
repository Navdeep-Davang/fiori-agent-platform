#!/usr/bin/env node
/**
 * Register Architecture Document
 * 
 * Registers a new architecture document in the project manifest.
 * 
 * Usage: node register-architecture.js <arch-id> <file-path> [description]
 * 
 * Example:
 *   node register-architecture.js main-arch doc/Architecture/main.md "Main system architecture"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get workspace root
const workspaceRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node register-architecture.js <arch-id> <file-path> [description]');
  console.log('');
  console.log('Arguments:');
  console.log('  arch-id      Unique identifier for the architecture (e.g., main-arch)');
  console.log('  file-path    Path to architecture file relative to project root');
  console.log('  description  Optional description of the architecture');
  process.exit(1);
}

const archId = args[0];
const filePath = args[1];
const description = args[2] || '';

// Validate arch-id format
if (!/^[a-z0-9-]+$/.test(archId)) {
  console.error('Error: arch-id must be lowercase letters, numbers, and hyphens only');
  process.exit(1);
}

// Check if file exists
const fullPath = path.join(workspaceRoot, filePath);
if (!fs.existsSync(fullPath)) {
  console.error('Error: Architecture file not found:', fullPath);
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

// Check if architecture already registered
if (manifest.artifacts.architectures[archId]) {
  console.error('Error: Architecture with ID', archId, 'already exists');
  console.log('Use a different ID or update the existing entry');
  process.exit(1);
}

// Compute file hash
const content = fs.readFileSync(fullPath, 'utf8');
const hash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');

// Add architecture to manifest
manifest.artifacts.architectures[archId] = {
  path: filePath.replace(/\\/g, '/'),
  hash: hash,
  last_modified: new Date().toISOString(),
  description: description
};

// Update manifest timestamp
manifest.last_updated = new Date().toISOString();

// Write manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('Architecture registered successfully!');
console.log('');
console.log('ID:', archId);
console.log('Path:', filePath);
console.log('Hash:', hash.substring(0, 20) + '...');
if (description) {
  console.log('Description:', description);
}
console.log('');
console.log('Next steps:');
console.log('- Link this architecture to action plans using architecture_refs');
console.log('- The sync-detector hook will track changes to this file');
