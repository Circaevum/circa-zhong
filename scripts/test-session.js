#!/usr/bin/env node

/**
 * Simple test script for session management
 * 
 * Usage:
 *   node scripts/test-session.js
 * 
 * This will:
 * 1. Start a test session
 * 2. Log some token usage
 * 3. Add an activity
 * 4. End the session
 * 5. Display results
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import session manager
let sessionManager;
try {
  sessionManager = await import('../src/utils/session-manager.js');
} catch (e) {
  sessionManager = require('../src/utils/session-manager.js');
}

// Import token tracker
let tokenTracker;
try {
  tokenTracker = await import('../src/utils/cursor-token-tracker.js');
} catch (e) {
  tokenTracker = require('../src/utils/cursor-token-tracker.js');
}

const { startSession, endSession, getActiveSession, addActivityToSession, getSessions } = sessionManager;
const { logTokenUsage, getTokenHistory } = tokenTracker;

console.log('🧪 Starting Session Management Test...\n');

// Step 1: Start a test session
console.log('1️⃣ Starting test session...');
const session = startSession({
  projectId: 1,
  projectName: 'Test Project',
  description: 'Testing session management system',
  tags: ['test', 'session-management']
});

console.log('   ✅ Session started:', session.id);
console.log('   Project:', session.projectName);
console.log('   Description:', session.description);
console.log('');

// Step 2: Log some token usage
console.log('2️⃣ Logging token usage...');
const tokenEntries = [];

for (let i = 0; i < 3; i++) {
  const entry = logTokenUsage({
    tokensUsed: 500 + Math.floor(Math.random() * 1000),
    model: 'claude-3.5-sonnet',
    operation: 'code-completion',
    project: 'Test Project',
    file: `src/test-file-${i}.js`,
    metadata: {
      test: true,
      iteration: i
    }
  });
  tokenEntries.push(entry);
  console.log(`   ✅ Logged ${entry.tokensUsed} tokens (${entry.operation})`);
}

const totalTokens = tokenEntries.reduce((sum, e) => sum + e.tokensUsed, 0);
console.log(`   Total tokens: ${totalTokens}`);
console.log('');

// Step 3: Add activities
console.log('3️⃣ Adding activities...');
addActivityToSession(session.id, {
  type: 'code-edit',
  description: 'Created test files',
  metadata: {
    files: ['test-file-1.js', 'test-file-2.js', 'test-file-3.js'],
    linesChanged: 45
  }
});

addActivityToSession(session.id, {
  type: 'test',
  description: 'Ran test script',
  metadata: {
    script: 'test-session.js',
    duration: 5
  }
});

console.log('   ✅ Added 2 activities');
console.log('');

// Step 4: Wait a moment (simulate work)
console.log('4️⃣ Simulating work session...');
await new Promise(resolve => setTimeout(resolve, 1000));
console.log('   ✅ Work completed');
console.log('');

// Step 5: End session
console.log('5️⃣ Ending session...');
const ended = endSession({
  description: 'Completed session management test'
});

if (ended) {
  const duration = ended.duration ? Math.round(ended.duration / 1000) : 0;
  console.log('   ✅ Session ended');
  console.log(`   Duration: ${duration} seconds`);
  console.log(`   Total tokens: ${ended.totalTokens}`);
  console.log(`   Activities: ${ended.activities?.length || 0}`);
} else {
  console.log('   ❌ Failed to end session');
}
console.log('');

// Step 6: Verify results
console.log('6️⃣ Verifying results...\n');

// Check active session (should be null)
const active = getActiveSession();
if (active) {
  console.log('   ⚠️  Active session still exists (should be null)');
} else {
  console.log('   ✅ No active session (correct)');
}

// Get all sessions
const allSessions = getSessions();
console.log(`   ✅ Total sessions: ${allSessions.length}`);

// Get project sessions
const projectSessions = getSessions({ projectId: 1 });
console.log(`   ✅ Project sessions: ${projectSessions.length}`);

if (projectSessions.length > 0) {
  const testSession = projectSessions.find(s => s.id === session.id);
  if (testSession) {
    console.log('   ✅ Test session found');
    console.log(`      Description: ${testSession.description}`);
    console.log(`      Tokens: ${testSession.totalTokens}`);
    console.log(`      Activities: ${testSession.activities?.length || 0}`);
    console.log(`      Duration: ${testSession.duration ? Math.round(testSession.duration / 1000) + 's' : 'N/A'}`);
  } else {
    console.log('   ❌ Test session not found');
  }
}

// Check token history
const history = getTokenHistory({ project: 'Test Project' });
const sessionTokens = history.entries.filter(e => e.metadata?.sessionId === session.id);
console.log(`   ✅ Token entries with session ID: ${sessionTokens.length}`);

console.log('\n✅ Test Complete!');
console.log('\nNext steps:');
console.log('1. Check Zhong project to see if session data appears');
console.log('2. Run: node scripts/sync-cursor-tokens.js --estimate-tokens');
console.log('3. View sessions in browser console: getSessions({ projectId: 1 })');
