#!/usr/bin/env node

/**
 * Recalculate tokens for all sessions from Cursor database
 * 
 * This script recalculates tokens for both active and ended sessions
 * by querying the Cursor database for all code generation entries
 * and matching them to sessions by timestamp.
 * 
 * Usage:
 *   node scripts/recalculate-all-session-tokens.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  console.log('🔄 Recalculating tokens for all sessions...\n');
  
  const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');
  
  if (!fs.existsSync(sessionsFile)) {
    console.error('❌ Sessions file not found');
    process.exit(1);
  }
  
  const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
  
  if (sessions.length === 0) {
    console.log('💡 No sessions found');
    return;
  }
  
  // Find Cursor database
  const cursorDbPath = path.join(os.homedir(), '.cursor', 'ai-tracking', 'ai-code-tracking.db');
  
  if (!fs.existsSync(cursorDbPath)) {
    console.error('❌ Cursor database not found at:', cursorDbPath);
    console.error('   Make sure Cursor has been used to generate code');
    process.exit(1);
  }
  
  console.log(`📊 Found ${sessions.length} session(s) to process\n`);
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(cursorDbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
    });
    
    // Get all code entries
    const query = `
      SELECT 
        hash,
        model,
        fileName,
        fileExtension,
        source,
        createdAt,
        conversationId
      FROM ai_code_hashes
      ORDER BY createdAt ASC
    `;
    
    db.all(query, [], (err, rows) => {
      if (err) {
        db.close();
        reject({ success: false, reason: 'query_error', error: err.message });
        return;
      }
      
      console.log(`📊 Found ${rows.length} total code generation entries in database\n`);
      
      // Process each session
      let updatedCount = 0;
      
      sessions.forEach((session, sessionIndex) => {
        const sessionStart = new Date(session.startTime).getTime();
        // Don't filter by endTime - match the original sync script behavior
        // which only filters by startTime to capture all entries from session start
        // This ensures we get all tokens that were accumulated during the session
        
        // Find entries from session start onwards (like the original sync script)
        const sessionEntries = rows.filter(row => {
          const entryTime = row.createdAt;
          return entryTime >= sessionStart;
        });
        
        // If session has an endTime, we could optionally filter, but for accuracy
        // we'll include all entries from start time (matching original behavior)
        
        if (sessionEntries.length === 0) {
          console.log(`⏭️  Session ${session.projectCode || session.id.substring(0, 12)}...: No entries found`);
          return;
        }
        
        // Calculate tokens from code length (~4 chars per token)
        let totalTokens = 0;
        const entryIds = new Set();
        
        sessionEntries.forEach(row => {
          const codeLength = row.source ? row.source.length : 0;
          const estimatedTokens = Math.ceil(codeLength / 4);
          totalTokens += estimatedTokens;
          
          // Generate entry ID
          const entryId = `entry_${row.createdAt}_${row.hash.substring(0, 8)}`;
          entryIds.add(entryId);
        });
        
        // Update session
        const previousTokens = session.totalTokens || 0;
        session.totalTokens = totalTokens;
        session.tokenEntries = Array.from(entryIds);
        
        if (previousTokens !== totalTokens) {
          updatedCount++;
          console.log(`✅ Session ${session.projectCode || session.id.substring(0, 12)}...:`);
          console.log(`   Entries: ${sessionEntries.length}`);
          console.log(`   Tokens: ${previousTokens.toLocaleString()} → ${totalTokens.toLocaleString()}`);
        } else {
          console.log(`✓  Session ${session.projectCode || session.id.substring(0, 12)}...: ${totalTokens.toLocaleString()} tokens (unchanged)`);
        }
      });
      
      // Save updated sessions
      fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), 'utf8');
      
      console.log(`\n✅ Updated ${updatedCount} session(s)`);
      console.log('💡 Refresh the Zhong app to see updated token counts.');
      
      db.close();
      resolve();
    });
  });
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
