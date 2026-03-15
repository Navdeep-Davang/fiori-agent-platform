#!/usr/bin/env node
/**
 * Update Task Status Script
 * 
 * Updates task status in action plan markdown and manifest.
 * Can be called directly via command line or via stdin JSON.
 * 
 * Usage (CLI):
 *   node update-task-status.js <plan-id> <task-id> <status>
 *   node update-task-status.js feature-auth task-2-1 complete
 * 
 * Usage (stdin JSON):
 *   echo '{"plan_id":"feature-auth","task_id":"task-2-1","status":"complete"}' | node update-task-status.js
 * 
 * Status values: pending, in_progress, complete, blocked
 */

const fs = require('fs');
const path = require('path');

// Determine if running via CLI args or stdin
const args = process.argv.slice(2);

if (args.length >= 3) {
  // CLI mode
  const [planId, taskId, status] = args;
  const workspaceRoot = args[3] || process.cwd();
  
  updateTaskStatus({ plan_id: planId, task_id: taskId, status, workspace_root: workspaceRoot })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error(JSON.stringify({ success: false, error: error.message }));
      process.exit(1);
    });
} else {
  // Stdin mode
  let inputData = '';
  
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    inputData += chunk;
  });
  
  process.stdin.on('end', async () => {
    try {
      const input = JSON.parse(inputData);
      const workspaceRoot = input.workspace_roots?.[0] || input.workspace_root || process.cwd();
      
      const result = await updateTaskStatus({
        plan_id: input.plan_id,
        task_id: input.task_id,
        status: input.status,
        workspace_root: workspaceRoot
      });
      
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error(JSON.stringify({ success: false, error: error.message }));
      process.exit(1);
    }
  });
}

async function updateTaskStatus({ plan_id, task_id, status, workspace_root }) {
  // Validate inputs
  if (!plan_id || !task_id || !status) {
    return { 
      success: false, 
      error: 'Missing required parameters: plan_id, task_id, status' 
    };
  }

  const validStatuses = ['pending', 'in_progress', 'complete', 'blocked'];
  const normalizedStatus = status.toLowerCase().replace('-', '_');
  
  if (!validStatuses.includes(normalizedStatus)) {
    return { 
      success: false, 
      error: `Invalid status "${status}". Valid values: ${validStatuses.join(', ')}` 
    };
  }

  // Find the manifest
  const manifestPath = path.join(workspace_root, 'doc', '.manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    return { 
      success: false, 
      error: `Manifest not found at ${manifestPath}` 
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Find the action plan
  const plan = manifest.artifacts?.action_plans?.[plan_id];
  
  if (!plan) {
    return { 
      success: false, 
      error: `Action plan "${plan_id}" not found in manifest` 
    };
  }

  const planPath = path.join(workspace_root, plan.path);
  
  if (!fs.existsSync(planPath)) {
    return { 
      success: false, 
      error: `Action plan file not found at ${planPath}` 
    };
  }

  // Read the action plan content
  let content = fs.readFileSync(planPath, 'utf8');
  
  // Update the task checkbox in markdown
  const checkboxResult = updateTaskCheckbox(content, task_id, normalizedStatus);
  
  if (!checkboxResult.updated) {
    return { 
      success: false, 
      error: `Task "${task_id}" not found in action plan` 
    };
  }
  
  content = checkboxResult.content;
  
  // Check if phase should be updated
  const phaseInfo = analyzePhaseStatus(content, task_id);
  
  if (phaseInfo.phaseId) {
    // Update phase status in the markdown
    content = updatePhaseStatus(content, phaseInfo.phaseId, phaseInfo.newPhaseStatus);
    
    // Update phase status in manifest
    if (plan.phases) {
      const manifestPhase = plan.phases.find(p => p.id === phaseInfo.phaseId);
      if (manifestPhase) {
        manifestPhase.status = phaseInfo.newPhaseStatus;
        if (phaseInfo.newPhaseStatus === 'completed') {
          manifestPhase.completed_at = new Date().toISOString();
        }
      }
    }
  }

  // Update frontmatter last_updated
  content = updateFrontmatterDate(content);
  
  // Write updated action plan
  fs.writeFileSync(planPath, content);
  
  // Update manifest timestamp
  manifest.last_updated = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    success: true,
    plan_id,
    task_id,
    new_status: normalizedStatus,
    phase_update: phaseInfo.phaseId ? {
      phase_id: phaseInfo.phaseId,
      phase_status: phaseInfo.newPhaseStatus
    } : null
  };
}

function updateTaskCheckbox(content, taskId, status) {
  // Task patterns to match:
  // - [ ] **Task 1.1**: Description
  // - [X] **Task 1.1**: Description
  // - [ ] Task 1.1: Description
  // Also handles subtasks with the same pattern
  
  // Create patterns for various task ID formats
  const taskPatterns = [
    // Pattern: Task X.Y or task-X-Y in bold or regular
    new RegExp(`(- \\[[ xX]\\]) (\\*\\*)?${escapeRegex(taskId)}(\\*\\*)?:?`, 'gi'),
    // Pattern: task ID embedded in description
    new RegExp(`(- \\[[ xX]\\]) ([^\\n]*\\b${escapeRegex(taskId)}\\b)`, 'gi')
  ];

  let updated = false;
  let newContent = content;

  for (const pattern of taskPatterns) {
    const matches = newContent.match(pattern);
    if (matches) {
      const newCheckbox = status === 'complete' ? '- [X]' : '- [ ]';
      
      newContent = newContent.replace(pattern, (match, checkbox, ...rest) => {
        updated = true;
        return match.replace(/- \[[ xX]\]/, newCheckbox);
      });
      
      if (updated) break;
    }
  }

  return { content: newContent, updated };
}

function analyzePhaseStatus(content, taskId) {
  // Find which phase this task belongs to
  const phaseRegex = /## Phase (\d+)[:\s]+([^\n]+)\n### Status:\s*(\w+)/gi;
  const taskRegex = /- \[[ xX]\]/g;
  const completedTaskRegex = /- \[[xX]\]/g;

  let currentPhase = null;
  let phaseMatch;
  const phases = [];

  // Split content into sections by phase
  const lines = content.split('\n');
  let currentPhaseId = null;
  let currentPhaseTasks = [];
  let taskBelongsToPhase = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for phase header
    const phaseHeaderMatch = line.match(/## Phase (\d+)/i);
    if (phaseHeaderMatch) {
      if (currentPhaseId) {
        phases.push({
          id: currentPhaseId,
          tasks: currentPhaseTasks
        });
      }
      currentPhaseId = `phase-${phaseHeaderMatch[1]}`;
      currentPhaseTasks = [];
    }
    
    // Check for task lines
    if (line.match(/^\s*- \[[ xX]\]/)) {
      const isComplete = line.match(/- \[[xX]\]/) !== null;
      currentPhaseTasks.push({ line, isComplete });
      
      // Check if this line contains our task ID
      if (line.toLowerCase().includes(taskId.toLowerCase())) {
        taskBelongsToPhase = currentPhaseId;
      }
    }
  }
  
  // Add last phase
  if (currentPhaseId) {
    phases.push({
      id: currentPhaseId,
      tasks: currentPhaseTasks
    });
  }

  // Find the phase our task belongs to and determine its new status
  if (!taskBelongsToPhase) {
    return { phaseId: null, newPhaseStatus: null };
  }

  const targetPhase = phases.find(p => p.id === taskBelongsToPhase);
  if (!targetPhase || targetPhase.tasks.length === 0) {
    return { phaseId: taskBelongsToPhase, newPhaseStatus: 'in_progress' };
  }

  // Determine phase status based on task completion
  const allComplete = targetPhase.tasks.every(t => t.isComplete);
  const anyComplete = targetPhase.tasks.some(t => t.isComplete);
  
  let newPhaseStatus;
  if (allComplete) {
    newPhaseStatus = 'completed';
  } else if (anyComplete) {
    newPhaseStatus = 'in_progress';
  } else {
    newPhaseStatus = 'pending';
  }

  return { phaseId: taskBelongsToPhase, newPhaseStatus };
}

function updatePhaseStatus(content, phaseId, newStatus) {
  // Extract phase number from phase-N format
  const phaseNum = phaseId.replace('phase-', '');
  
  // Pattern to match phase status line
  const statusPattern = new RegExp(
    `(## Phase ${phaseNum}[^\\n]*\\n### Status:\\s*)(\\w+)`,
    'i'
  );
  
  const statusMap = {
    'pending': 'PENDING',
    'in_progress': 'IN_PROGRESS',
    'completed': 'COMPLETED',
    'blocked': 'BLOCKED'
  };

  return content.replace(statusPattern, `$1${statusMap[newStatus] || newStatus.toUpperCase()}`);
}

function updateFrontmatterDate(content) {
  const today = new Date().toISOString().split('T')[0];
  
  // Update last_updated in frontmatter
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  
  if (match) {
    let frontmatter = match[1];
    
    if (frontmatter.includes('last_updated:')) {
      frontmatter = frontmatter.replace(/last_updated:\s*[\d-]+/, `last_updated: ${today}`);
    } else {
      frontmatter += `\nlast_updated: ${today}`;
    }
    
    content = content.replace(frontmatterRegex, `---\n${frontmatter}\n---`);
  }
  
  return content;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { updateTaskStatus };
