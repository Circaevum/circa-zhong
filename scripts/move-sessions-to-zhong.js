#!/usr/bin/env node

/**
 * Move sessions for specific project codes to Zhong (26Q1Z00).
 *
 * This is a small migration script to re-associate existing sessions
 * (and all their tokens, prompts, timestamps, etc.) with the Zhong
 * center project instead of their original project codes.
 *
 * It updates:
 * - projectCode  -> "26Q1Z00"
 * - projectId    -> 0
 * - projectName  -> "Zhong"
 *
 * The underlying token history entries remain the same; only the
 * session metadata changes so the UI groups them under Zhong.
 *
 * Usage:
 *   node scripts/move-sessions-to-zhong.js
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SOURCE_PROJECT_CODES = ['26Q1W21', '26Q1W22'];
const TARGET_PROJECT_CODE = '26Q1Z00';
const TARGET_PROJECT_ID = 0;
const TARGET_PROJECT_NAME = 'Zhong';

function loadSessions(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('❌ Sessions file not found at:', filePath);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ Failed to read or parse sessions file:', e.message);
    process.exit(1);
  }
}

function saveSessions(filePath, sessions) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf8');
    console.log('✅ Sessions file updated:', filePath);
  } catch (e) {
    console.error('❌ Failed to write sessions file:', e.message);
    process.exit(1);
  }
}

function main() {
  const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');
  console.log('📂 Using sessions file:', sessionsFile);

  const sessions = loadSessions(sessionsFile);

  if (!Array.isArray(sessions) || sessions.length === 0) {
    console.log('ℹ️ No sessions found, nothing to move.');
    return;
  }

  let updatedCount = 0;

  const updatedSessions = sessions.map((session) => {
    if (!session || !session.projectCode) return session;

    if (!SOURCE_PROJECT_CODES.includes(session.projectCode)) {
      return session;
    }

    const before = {
      id: session.id,
      projectCode: session.projectCode,
      projectId: session.projectId,
      projectName: session.projectName,
    };

    session.projectCode = TARGET_PROJECT_CODE;
    session.projectId = TARGET_PROJECT_ID;
    session.projectName = TARGET_PROJECT_NAME;

    // Optionally clean up tags: keep everything but overwrite project-related ones
    if (Array.isArray(session.tags)) {
      session.tags = session.tags.filter(
        (t) =>
          !t.startsWith('Project-') &&
          t !== 'YANG' &&
          t !== 'YIN' &&
          t !== 'WEB' &&
          t !== 'DATABASE' &&
          t !== 'API'
      );
      session.tags.push('ZHONG', `Project-${TARGET_PROJECT_ID}`);
    } else {
      session.tags = ['ZHONG', `Project-${TARGET_PROJECT_ID}`];
    }

    updatedCount++;

    console.log(
      `🔁 Moved session ${before.id} from ${before.projectCode} -> ${TARGET_PROJECT_CODE}`
    );

    return session;
  });

  if (updatedCount === 0) {
    console.log(
      'ℹ️ No sessions found with project codes:',
      SOURCE_PROJECT_CODES.join(', ')
    );
    return;
  }

  saveSessions(sessionsFile, updatedSessions);

  console.log('\n📊 Summary');
  console.log('-----------');
  console.log(`Moved sessions: ${updatedCount}`);
  console.log(`From codes: ${SOURCE_PROJECT_CODES.join(', ')}`);
  console.log(`To Zhong: ${TARGET_PROJECT_CODE} (id=${TARGET_PROJECT_ID})`);
  console.log('\nNext steps:');
  console.log('- In Zhong UI, click “🔄 Sync Sessions” to pull the updated sessions.json into the browser.');
}

main();

