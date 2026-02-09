#!/usr/bin/env node

/**
 * Sync code-related tokens from Cursor database and associate with active session
 * 
 * Queries Cursor's database for code generation entries since session started,
 * estimates tokens from code length, and associates them with the session.
 * 
 * Usage:
 *   node scripts/sync-tokens-to-session.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import session manager to check for timeouts
import * as sessionManager from '../src/utils/session-manager.js';

async function main() {
  console.log('🔄 Syncing code-related tokens from Cursor database...\n');
  
  // Check for and end timed-out sessions first
  const { checkAndEndTimedOutSessions } = sessionManager;
  const endedSessions = checkAndEndTimedOutSessions();
  if (endedSessions.length > 0) {
    console.log(`⏰ Auto-ended ${endedSessions.length} timed-out session(s)\n`);
  }
  
  // Get active session from file system
  const activeSessionFile = path.join(os.homedir(), '.cursor', 'active-session.txt');
  const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');
  
  if (!fs.existsSync(activeSessionFile)) {
    console.error('❌ No active session found. Start a session first:');
    console.error('   node scripts/start-session.js <projectCode>');
    process.exit(1);
  }
  
  const activeSessionId = fs.readFileSync(activeSessionFile, 'utf8').trim();
  
  if (!fs.existsSync(sessionsFile)) {
    console.error('❌ Sessions file not found');
    process.exit(1);
  }
  
  const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
  const sessionIndex = sessions.findIndex(s => s.id === activeSessionId && !s.endTime);
  
  if (sessionIndex === -1) {
    console.error('❌ Active session not found');
    process.exit(1);
  }
  
  const activeSession = sessions[sessionIndex];
  
  console.log('📋 Active Session:');
  console.log(`   ID: ${activeSession.id}`);
  console.log(`   Project: ${activeSession.projectCode || activeSession.projectName || 'N/A'}`);
  console.log(`   Started: ${new Date(activeSession.startTime).toLocaleString()}`);
  console.log('');
  
  // Query Cursor database
  const dbPath = path.join(os.homedir(), '.cursor', 'ai-tracking', 'ai-code-tracking.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Cursor database not found at:', dbPath);
    console.error('   Make sure Cursor has been used to generate code');
    process.exit(1);
  }
  
  const sessionStartTimestamp = Math.floor(new Date(activeSession.startTime).getTime());
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject({ success: false, reason: 'database_error', error: err.message });
        return;
      }
    });
    
    // Query code entries since session started
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
      WHERE createdAt >= ?
      ORDER BY createdAt ASC
    `;
    
    db.all(query, [sessionStartTimestamp], (err, rows) => {
      if (err) {
        db.close();
        reject({ success: false, reason: 'query_error', error: err.message });
        return;
      }
      
      console.log(`📊 Found ${rows.length} code generation entries since session started\n`);
      
      if (rows.length === 0) {
        console.log('💡 No code-related tokens found for this session.');
        console.log('   This is normal if you haven\'t generated code in Cursor yet.');
        db.close();
        resolve();
        return;
      }
      
      // Update session with token entries and totals
      if (!sessions[sessionIndex].tokenEntries) {
        sessions[sessionIndex].tokenEntries = [];
      }
      
      // Get existing entry IDs to avoid duplicates
      const existingIds = new Set(sessions[sessionIndex].tokenEntries);
      
      // Process entries: estimate tokens and associate with session
      // Only count tokens for NEW entries (not already in session)
      let newTokens = 0;
      let newChars = 0;
      const fileSet = new Set();
      const newEntryIds = [];
      
      // Group entries by conversationId+requestId to count actual prompts
      // Multiple code blocks from the same prompt share the same conversationId+requestId
      const promptGroups = new Map(); // Map of "conversationId_requestId" -> entryIds
      
      rows.forEach((row, index) => {
        // Generate entry ID for tracking
        const entryId = `entry_${row.createdAt}_${row.hash.substring(0, 8)}`;
        
        // Only process if this entry hasn't been added yet
        if (!existingIds.has(entryId)) {
          // Estimate tokens from code length (~4 chars per token)
          const codeLength = row.source ? row.source.length : 0;
          const estimatedTokens = Math.ceil(codeLength / 4);
          
          newTokens += estimatedTokens;
          newChars += codeLength;
          newEntryIds.push(entryId);
          
          // Group by prompt (conversationId + requestId, or just timestamp if not available)
          const promptKey = row.conversationId && row.requestId 
            ? `${row.conversationId}_${row.requestId}`
            : `prompt_${Math.floor(row.createdAt / 60000)}`; // Fallback: group by minute
          
          if (!promptGroups.has(promptKey)) {
            promptGroups.set(promptKey, []);
          }
          promptGroups.get(promptKey).push(entryId);
          
          if (row.fileName) {
            fileSet.add(row.fileName);
          }
        }
      });
      
      const uniquePrompts = promptGroups.size;
      
      // Store prompt groups in session metadata for accurate prompt counting
      if (!sessions[sessionIndex].promptGroups) {
        sessions[sessionIndex].promptGroups = new Set();
      }
      // Add prompt keys to session (convert Set to Array for JSON serialization)
      const existingPromptGroups = new Set(sessions[sessionIndex].promptGroups || []);
      promptGroups.forEach((entryIds, promptKey) => {
        if (!existingPromptGroups.has(promptKey)) {
          existingPromptGroups.add(promptKey);
        }
      });
      sessions[sessionIndex].promptGroups = Array.from(existingPromptGroups);
      
      // Add new entry IDs
      sessions[sessionIndex].tokenEntries.push(...newEntryIds);
      
      // Update total tokens (add only new tokens to existing total)
      const previousTokens = sessions[sessionIndex].totalTokens || 0;
      sessions[sessionIndex].totalTokens = previousTokens + newTokens;
      
      // Save updated sessions
      fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), 'utf8');
      
      console.log('✅ Token sync completed:');
      console.log(`   Total entries in database: ${rows.length}`);
      console.log(`   New entries added: ${newEntryIds.length}`);
      console.log(`   Unique prompts: ${uniquePrompts}`);
      console.log(`   New code length: ${newChars.toLocaleString()} characters`);
      console.log(`   New tokens: ${newTokens.toLocaleString()}`);
      console.log(`   Files touched: ${fileSet.size}`);
      console.log(`   Previous tokens: ${previousTokens.toLocaleString()}`);
      console.log(`   New total: ${sessions[sessionIndex].totalTokens.toLocaleString()}`);
      console.log('');
      
      if (fileSet.size > 0) {
        console.log('📁 Files with code generation:');
        Array.from(fileSet).slice(0, 10).forEach(file => {
          console.log(`   - ${file}`);
        });
        if (fileSet.size > 10) {
          console.log(`   ... and ${fileSet.size - 10} more`);
        }
        console.log('');
      }
      
      db.close();
      console.log('💡 Refresh the Zhong app to see updated token counts.');
      console.log('   Or click the "🔄 Sync Sessions" button in the app.');
      resolve();
    });
  });
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  if (error.reason) {
    console.error('   Reason:', error.reason);
  }
  if (error.error) {
    console.error('   Error:', error.error);
  }
  process.exit(1);
});
