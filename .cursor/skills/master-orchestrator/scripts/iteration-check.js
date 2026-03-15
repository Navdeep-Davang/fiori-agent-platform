#!/usr/bin/env node
/**
 * iteration-check.js
 * 
 * Stop hook script for the master-agent review cycle.
 * Checks if orchestration is complete by looking for "DONE" in the scratchpad.
 * If not done, returns a followup_message to continue the orchestration.
 * 
 * Input (via stdin): JSON with stop hook context
 * Output (via stdout): JSON with optional followup_message
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
        const result = await checkIterationStatus(input);
        console.log(JSON.stringify(result));
        process.exit(0);
    } catch (error) {
        // On error, allow completion (fail-open)
        console.log(JSON.stringify({}));
        process.exit(0);
    }
});

/**
 * Check if the orchestration is complete
 */
async function checkIterationStatus(input) {
    const { status, loop_count, workspace_roots } = input;
    
    // If agent was aborted or errored, don't continue
    if (status !== 'completed') {
        return {};
    }
    
    // Get workspace root
    const workspaceRoot = workspace_roots && workspace_roots[0] 
        ? workspace_roots[0] 
        : process.cwd();
    
    // Check for scratchpad
    const scratchpadPath = path.join(workspaceRoot, '.cursor', 'scratchpad.md');
    
    if (!fs.existsSync(scratchpadPath)) {
        // No scratchpad means no orchestration in progress
        return {};
    }
    
    // Read scratchpad
    const scratchpadContent = fs.readFileSync(scratchpadPath, 'utf8');
    
    // Check if DONE marker is present
    const isDone = checkDoneMarker(scratchpadContent);
    
    if (isDone) {
        // Orchestration complete, no followup needed
        return {};
    }
    
    // Check current status from scratchpad
    const currentStatus = extractStatus(scratchpadContent);
    const currentCycle = extractCycle(scratchpadContent);
    
    // Check for pending reports
    const reportsDir = path.join(workspaceRoot, '.cursor', 'worker-reports');
    const pendingReports = getPendingReports(reportsDir, scratchpadContent);
    
    // Craft followup message based on state
    const followupMessage = craftFollowupMessage({
        currentCycle,
        currentStatus,
        pendingReports,
        loopCount: loop_count
    });
    
    if (followupMessage) {
        return { followup_message: followupMessage };
    }
    
    return {};
}

/**
 * Check if DONE marker is present in scratchpad
 */
function checkDoneMarker(content) {
    // Look for ## DONE section with actual content
    const doneSection = content.match(/## DONE\s*\n([^\n#]*)/i);
    if (doneSection && doneSection[1]) {
        const doneContent = doneSection[1].trim();
        // Check if there's actual content (not just placeholder)
        return doneContent.length > 0 && 
               !doneContent.includes('[Write DONE') &&
               doneContent.toLowerCase().includes('done');
    }
    return false;
}

/**
 * Extract current status from scratchpad
 */
function extractStatus(content) {
    const statusMatch = content.match(/## Status:\s*(\w+)/i);
    return statusMatch ? statusMatch[1] : 'UNKNOWN';
}

/**
 * Extract current cycle from scratchpad
 */
function extractCycle(content) {
    const cycleMatch = content.match(/## Current Cycle:\s*(\d+)/i);
    return cycleMatch ? parseInt(cycleMatch[1], 10) : 1;
}

/**
 * Get list of pending reports (spawned but not reviewed)
 */
function getPendingReports(reportsDir, scratchpadContent) {
    if (!fs.existsSync(reportsDir)) {
        return [];
    }
    
    const pending = [];
    const files = fs.readdirSync(reportsDir);
    
    for (const file of files) {
        if (file.endsWith('.md')) {
            const taskId = file.replace('.md', '');
            // Check if this task is marked as reviewed in scratchpad
            const isReviewed = scratchpadContent.includes(`${taskId}`) && 
                              (scratchpadContent.includes('COMPLETE') || 
                               scratchpadContent.includes('reviewed'));
            
            if (!isReviewed) {
                pending.push(taskId);
            }
        }
    }
    
    return pending;
}

/**
 * Craft appropriate followup message
 */
function craftFollowupMessage({ currentCycle, currentStatus, pendingReports, loopCount }) {
    // Build context-aware followup
    let message = `[Orchestration Cycle ${currentCycle + 1}] `;
    
    if (pendingReports.length > 0) {
        message += `Review pending reports for: ${pendingReports.join(', ')}. `;
    }
    
    if (currentStatus === 'IN_PROGRESS') {
        message += 'Check spawned subagent status and review any completed reports. ';
    } else if (currentStatus === 'REVIEWING') {
        message += 'Continue review of completed tasks. ';
    }
    
    message += 'Update scratchpad with progress. If all tasks complete and verified, write DONE to scratchpad.';
    
    // Add iteration awareness
    if (loopCount >= 7) {
        message += ` (Iteration ${loopCount + 1}/10 - consider summarizing progress for user if close to limit)`;
    }
    
    return message;
}

// Handle process signals gracefully
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
