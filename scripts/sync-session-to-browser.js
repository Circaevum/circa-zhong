#!/usr/bin/env node

/**
 * Sync session from file system to browser localStorage format
 * 
 * This script reads sessions from ~/.cursor/sessions.json and outputs
 * JavaScript code that can be run in the browser console to populate localStorage.
 * 
 * Usage:
 *   node scripts/sync-session-to-browser.js > sync-sessions.js
 *   Then copy/paste the contents into browser console
 */

import * as sessionManager from '../src/utils/session-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');

if (!fs.existsSync(sessionsFile)) {
  console.error('No sessions file found at:', sessionsFile);
  process.exit(1);
}

const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));

console.log('// Copy and paste this into your browser console to sync sessions:');
console.log('// Then refresh the Zhong app');
console.log('');
console.log('const sessions =', JSON.stringify(sessions, null, 2), ';');
console.log('localStorage.setItem("cursor_sessions", JSON.stringify(sessions));');
console.log('console.log(`Synced ${sessions.length} sessions to localStorage`);');
console.log('');

// Also show active session
const activeSession = sessions.find(s => !s.endTime);
if (activeSession) {
  console.log('// Active session:');
  console.log('//', JSON.stringify(activeSession, null, 2));
  console.log('');
  console.log('localStorage.setItem("cursor_active_session", "' + activeSession.id + '");');
  console.log('console.log("Active session set:", "' + activeSession.id + '");');
}
