#!/usr/bin/env node

/**
 * Start a new session for a project
 * 
 * Usage:
 *   node scripts/start-session.js [projectCode]
 * 
 * Examples:
 *   node scripts/start-session.js 26Q1W21
 *   node scripts/start-session.js 26Q1U12
 */

// Import session manager
import * as sessionManager from '../src/utils/session-manager.js';

// Import project ID parser
import * as projectIdUtils from '../src/utils/project-id.js';

const { startSession, getActiveSession, endSession } = sessionManager;
const { parseProjectId } = projectIdUtils;

// Get project code from command line
const projectCode = process.argv[2] || null;

if (!projectCode) {
  console.error('❌ Error: Project code required');
  console.log('\nUsage: node scripts/start-session.js [projectCode]');
  console.log('Example: node scripts/start-session.js 26Q1W21');
  process.exit(1);
}

// Validate project code format
const parsed = parseProjectId(projectCode);
if (!parsed) {
  console.error(`❌ Error: Invalid project code format: ${projectCode}`);
  console.log('Expected format: YYQ[P][N] (e.g., 26Q1W21)');
  process.exit(1);
}

console.log('🚀 Starting new session...\n');

// Check for active session
const active = getActiveSession();
if (active) {
  console.log('⚠️  Active session found:');
  console.log(`   ID: ${active.id}`);
  console.log(`   Project: ${active.projectName || active.projectCode || 'N/A'}`);
  console.log(`   Started: ${new Date(active.startTime).toLocaleString()}`);
  console.log('\n   Ending active session before starting new one...\n');
  endSession();
}

// Parse project info
const platformName = parsed.platformType || 'Unknown';
const projectName = `Project ${parsed.projectNumber} (${platformName})`;

// Start new session
const session = startSession({
  projectCode: projectCode,
  projectName: projectName,
  description: `Session for ${projectCode}`,
  tags: [
    `Q${parsed.quarter}`,
    parsed.platformType,
    `Project-${parsed.projectNumber}`
  ]
});

console.log('✅ Session started successfully!\n');
console.log('Session Details:');
console.log(`   ID: ${session.id}`);
console.log(`   Project Code: ${session.projectCode}`);
console.log(`   Project Name: ${session.projectName}`);
console.log(`   Description: ${session.description}`);
console.log(`   Started: ${new Date(session.startTime).toLocaleString()}`);
console.log(`   Tags: ${session.tags.join(', ')}`);
console.log('\n📝 Session is now active. All token usage will be tracked to this session.');
console.log('\nTo end this session, run:');
console.log(`   node scripts/end-session.js`);
