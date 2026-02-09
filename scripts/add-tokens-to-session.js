#!/usr/bin/env node

/**
 * Add estimated tokens to the active session
 * 
 * This is a workaround when the full sync isn't working.
 * Estimates tokens based on conversation activity.
 * 
 * Usage:
 *   node scripts/add-tokens-to-session.js [estimatedTokens]
 *   node scripts/add-tokens-to-session.js 5000
 */

import * as sessionManager from '../src/utils/session-manager.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getSessions } = sessionManager;

async function main() {
  const estimatedTokens = parseInt(process.argv[2]) || 0;
  
  if (estimatedTokens === 0) {
    console.log('💡 Usage: node scripts/add-tokens-to-session.js [estimatedTokens]');
    console.log('   Example: node scripts/add-tokens-to-session.js 5000');
    console.log('');
    console.log('   Or estimate based on conversation:');
    console.log('   - Short conversation (5-10 messages): ~2000-5000 tokens');
    console.log('   - Medium conversation (10-20 messages): ~5000-15000 tokens');
    console.log('   - Long conversation (20+ messages): ~15000+ tokens');
    process.exit(1);
  }
  
  // Get active session from file system
  const activeSessionFile = path.join(os.homedir(), '.cursor', 'active-session.txt');
  const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');
  
  if (!fs.existsSync(activeSessionFile)) {
    console.error('❌ No active session found');
    process.exit(1);
  }
  
  const activeSessionId = fs.readFileSync(activeSessionFile, 'utf8').trim();
  
  if (!fs.existsSync(sessionsFile)) {
    console.error('❌ Sessions file not found');
    process.exit(1);
  }
  
  const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
  const sessionIndex = sessions.findIndex(s => s.id === activeSessionId);
  
  if (sessionIndex === -1) {
    console.error('❌ Active session not found');
    process.exit(1);
  }
  
  const session = sessions[sessionIndex];
  
  console.log('📋 Active Session:');
  console.log(`   ID: ${session.id}`);
  console.log(`   Project: ${session.projectCode || session.projectName || 'N/A'}`);
  console.log(`   Current tokens: ${session.totalTokens || 0}`);
  console.log('');
  
  // Add estimated tokens
  const previousTokens = session.totalTokens || 0;
  sessions[sessionIndex].totalTokens = previousTokens + estimatedTokens;
  
  // Add a token entry reference (fake entry ID for tracking)
  if (!sessions[sessionIndex].tokenEntries) {
    sessions[sessionIndex].tokenEntries = [];
  }
  const entryId = `entry_estimated_${Date.now()}`;
  sessions[sessionIndex].tokenEntries.push(entryId);
  
  // Save updated sessions
  fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), 'utf8');
  
  console.log(`✅ Added ${estimatedTokens.toLocaleString()} tokens to session`);
  console.log(`   Previous: ${previousTokens.toLocaleString()}`);
  console.log(`   New total: ${sessions[sessionIndex].totalTokens.toLocaleString()}`);
  console.log('');
  console.log('💡 Refresh the Zhong app to see updated token counts.');
  console.log('   Or click the "🔄 Sync Sessions" button in the app.');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
