/**
 * Cursor Token Usage Tracker
 * 
 * Lightweight JSON-based tracker for Cursor IDE token usage.
 * Stores usage history that can later be loaded into Circaevum as time-series data.
 * 
 * Usage:
 *   import { logTokenUsage, getTokenHistory } from './utils/cursor-token-tracker';
 *   
 *   // Log usage after each Cursor interaction
 *   logTokenUsage({
 *     tokensUsed: 1500,
 *     model: 'claude-3.5-sonnet',
 *     operation: 'code-completion',
 *     project: 'TimeBox'
 *   });
 *   
 *   // Get history for visualization
 *   const history = getTokenHistory();
 */

const TOKEN_LOG_FILE = 'cursor-token-usage.json';
const MAX_ENTRIES = 10000; // Prevent unbounded growth

/**
 * Get the storage path for token usage log
 * Uses localStorage in browser, or could be adapted for Node.js
 */
function getStoragePath() {
  if (typeof window !== 'undefined') {
    // Browser environment - use localStorage key
    return 'cursor_token_usage';
  } else {
    // Node.js environment - use file system
    const path = require('path');
    const os = require('os');
    return path.join(os.homedir(), '.cursor', TOKEN_LOG_FILE);
  }
}

/**
 * Load existing token usage history
 */
function loadHistory() {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(getStoragePath());
      return stored ? JSON.parse(stored) : { entries: [], metadata: { version: '1.0', created: new Date().toISOString() } };
    } else {
      // Node.js - use dynamic require pattern
      const getNodeModules = () => {
        if (typeof window !== 'undefined') return null;
        try {
          const moduleName = String.fromCharCode(109, 111, 100, 117, 108, 101); // 'module'
          const createRequireName = String.fromCharCode(99, 114, 101, 97, 116, 101, 82, 101, 113, 117, 105, 114, 101); // 'createRequire'
          const moduleModule = eval(`require('${moduleName}')`);
          const createRequire = moduleModule[createRequireName];
          const require = createRequire(import.meta.url);
          return { fs: require('fs'), path: require('path'), os: require('os') };
        } catch (e) {
          return null;
        }
      };
      
      const modules = getNodeModules();
      if (modules) {
        const { fs, path, os } = modules;
        const filePath = path.join(os.homedir(), '.cursor', TOKEN_LOG_FILE);
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(data);
        }
      }
    }
  } catch (error) {
    console.error('[CursorTokenTracker] Error loading history:', error);
    return { entries: [], metadata: { version: '1.0', created: new Date().toISOString() } };
  }
  
  return { entries: [], metadata: { version: '1.0', created: new Date().toISOString() } };
}

/**
 * Save token usage history
 */
function saveHistory(data) {
  try {
    // Trim to max entries (keep most recent)
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(-MAX_ENTRIES);
    }
    
    // Update metadata
    data.metadata.lastUpdated = new Date().toISOString();
    data.metadata.totalEntries = data.entries.length;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStoragePath(), JSON.stringify(data, null, 2));
    } else {
      // Node.js - use dynamic require pattern
      const getNodeModules = () => {
        if (typeof window !== 'undefined') return null;
        try {
          const moduleName = String.fromCharCode(109, 111, 100, 117, 108, 101); // 'module'
          const createRequireName = String.fromCharCode(99, 114, 101, 97, 116, 101, 82, 101, 113, 117, 105, 114, 101); // 'createRequire'
          const moduleModule = eval(`require('${moduleName}')`);
          const createRequire = moduleModule[createRequireName];
          const require = createRequire(import.meta.url);
          return { fs: require('fs'), path: require('path'), os: require('os') };
        } catch (e) {
          return null;
        }
      };
      
      const modules = getNodeModules();
      if (modules) {
        const { fs, path, os } = modules;
        const filePath = path.join(os.homedir(), '.cursor', TOKEN_LOG_FILE);
        const dir = path.dirname(filePath);
        
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      }
    }
    
    return true;
  } catch (error) {
    console.error('[CursorTokenTracker] Error saving history:', error);
    return false;
  }
}

/**
 * Log token usage
 * 
 * @param {Object} usage - Token usage data
 * @param {number} usage.tokensUsed - Number of tokens consumed
 * @param {string} [usage.model] - Model used (e.g., 'claude-3.5-sonnet')
 * @param {string} [usage.operation] - Operation type (e.g., 'code-completion', 'chat', 'refactor')
 * @param {string} [usage.project] - Project/repo name
 * @param {string} [usage.file] - File being edited
 * @param {Object} [usage.metadata] - Additional metadata
 */
export function logTokenUsage(usage) {
  const history = loadHistory();
  
  // Generate entry ID for session tracking
  const entryId = `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Check for active session
  let activeSessionId = null;
  try {
    if (typeof window !== 'undefined') {
      activeSessionId = localStorage.getItem('cursor_active_session');
    } else {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const filePath = path.join(os.homedir(), '.cursor', 'active-session.txt');
      if (fs.existsSync(filePath)) {
        activeSessionId = fs.readFileSync(filePath, 'utf8').trim();
      }
    }
  } catch (e) {
    // Session manager not available, continue without it
  }
  
  const entry = {
    timestamp: new Date().toISOString(),
    tokensUsed: usage.tokensUsed || 0,
    model: usage.model || 'unknown',
    operation: usage.operation || 'unknown',
    project: usage.project || 'unknown',
    file: usage.file || null,
    metadata: {
      ...usage.metadata,
      entryId: entryId,
      sessionId: activeSessionId
    }
  };
  
  history.entries.push(entry);
  saveHistory(history);
  
  // Update active session if exists (async, don't block)
  if (activeSessionId) {
    // Use dynamic import to avoid issues in browser
    Promise.resolve().then(async () => {
      try {
        if (typeof window === 'undefined') {
          // Node.js - can use require
          const { addTokenEntryToSession } = require('./session-manager');
          addTokenEntryToSession(activeSessionId, entryId);
        } else {
          // Browser - use dynamic import
          const sessionModule = await import('./session-manager');
          sessionModule.addTokenEntryToSession(activeSessionId, entryId);
        }
      } catch (e) {
        // Session manager not available, continue silently
      }
    }).catch(() => {
      // Ignore errors
    });
  }
  
  console.log(`[CursorTokenTracker] Logged ${entry.tokensUsed} tokens for ${entry.operation} in ${entry.project}${activeSessionId ? ` (session: ${activeSessionId.substring(0, 8)}...)` : ''}`);
  
  return entry;
}

/**
 * Get token usage history
 * 
 * @param {Object} [options] - Filter options
 * @param {Date} [options.startDate] - Start date filter
 * @param {Date} [options.endDate] - End date filter
 * @param {string} [options.project] - Filter by project
 * @param {string} [options.operation] - Filter by operation type
 * @returns {Object} History data with entries and statistics
 */
export function getTokenHistory(options = {}) {
  const history = loadHistory();
  let entries = [...history.entries];
  
  // Apply filters
  if (options.startDate) {
    const start = new Date(options.startDate);
    entries = entries.filter(e => new Date(e.timestamp) >= start);
  }
  
  if (options.endDate) {
    const end = new Date(options.endDate);
    entries = entries.filter(e => new Date(e.timestamp) <= end);
  }
  
  if (options.project) {
    entries = entries.filter(e => e.project === options.project);
  }
  
  if (options.operation) {
    entries = entries.filter(e => e.operation === options.operation);
  }
  
  // Calculate statistics
  const stats = {
    totalEntries: entries.length,
    totalTokens: entries.reduce((sum, e) => sum + e.tokensUsed, 0),
    averageTokens: entries.length > 0 ? entries.reduce((sum, e) => sum + e.tokensUsed, 0) / entries.length : 0,
    byProject: {},
    byOperation: {},
    byModel: {},
    dateRange: entries.length > 0 ? {
      start: entries[0].timestamp,
      end: entries[entries.length - 1].timestamp
    } : null
  };
  
  // Group by project
  entries.forEach(e => {
    stats.byProject[e.project] = (stats.byProject[e.project] || 0) + e.tokensUsed;
  });
  
  // Group by operation
  entries.forEach(e => {
    stats.byOperation[e.operation] = (stats.byOperation[e.operation] || 0) + e.tokensUsed;
  });
  
  // Group by model
  entries.forEach(e => {
    stats.byModel[e.model] = (stats.byModel[e.model] || 0) + e.tokensUsed;
  });
  
  return {
    entries,
    statistics: stats,
    metadata: history.metadata
  };
}

/**
 * Get daily token usage summary (for Circaevum visualization)
 * 
 * @returns {Array} Array of daily summaries with date and token counts
 */
export function getDailySummary() {
  const history = loadHistory();
  const dailyMap = {};
  
  history.entries.forEach(entry => {
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    if (!dailyMap[date]) {
      dailyMap[date] = {
        date,
        tokensUsed: 0,
        operations: 0,
        projects: new Set()
      };
    }
    
    dailyMap[date].tokensUsed += entry.tokensUsed;
    dailyMap[date].operations += 1;
    dailyMap[date].projects.add(entry.project);
  });
  
  // Convert to array and format for Circaevum
  return Object.values(dailyMap).map(day => ({
    date: day.date,
    tokensUsed: day.tokensUsed,
    operations: day.operations,
    projectCount: day.projects.size,
    projects: Array.from(day.projects)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Clear token usage history
 */
export function clearHistory() {
  const empty = { entries: [], metadata: { version: '1.0', created: new Date().toISOString() } };
  saveHistory(empty);
  console.log('[CursorTokenTracker] History cleared');
}

/**
 * Export history to file (for backup or migration)
 */
export function exportHistory(format = 'json') {
  const history = loadHistory();
  
  if (format === 'json') {
    return JSON.stringify(history, null, 2);
  } else if (format === 'csv') {
    // Convert to CSV format
    const headers = ['timestamp', 'tokensUsed', 'model', 'operation', 'project', 'file'];
    const rows = history.entries.map(e => [
      e.timestamp,
      e.tokensUsed,
      e.model,
      e.operation,
      e.project,
      e.file || ''
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
  
  return null;
}

/**
 * Sync token usage from Cursor's SQLite tracking database
 * Reads from ~/.cursor/ai-tracking/ai-code-tracking.db
 * 
 * @param {Object} [options] - Sync options
 * @param {Date} [options.since] - Only sync entries since this date
 * @param {boolean} [options.estimateTokens] - Estimate tokens based on model/file size
 * @returns {Object} Sync results with entries imported
 */
export async function syncFromCursorDatabase(options = {}) {
  if (typeof window !== 'undefined') {
    console.warn('[CursorTokenTracker] syncFromCursorDatabase only works in Node.js environment');
    return { success: false, reason: 'browser_environment' };
  }
  
  try {
    // Only import Node.js modules in Node.js environment
    // Use dynamic require/import to avoid browser bundling issues
    let sqlite3, path, os, fs;
    
    // Check if we're in Node.js (not browser)
    if (typeof window === 'undefined') {
      // Node.js environment
      if (typeof require !== 'undefined') {
        // CommonJS - use require
        sqlite3 = require('sqlite3');
        path = require('path');
        os = require('os');
        fs = require('fs');
      } else {
        // ES modules - use completely dynamic module name construction
        // Vite cannot statically analyze these because module names are built at runtime
        // Using character codes to prevent any static string analysis
        const getModuleName = (codes) => String.fromCharCode(...codes);
        const sqlite3Name = getModuleName([115, 113, 108, 105, 116, 101, 51]); // 'sqlite3'
        const pathName = getModuleName([112, 97, 116, 104]); // 'path'
        const osName = getModuleName([111, 115]); // 'os'
        const fsName = getModuleName([102, 115]); // 'fs'
        
        // Use Function constructor - Vite cannot analyze this
        const dynamicImport = new Function('spec', 'return import(spec)');
        
        const [sqlite3Module, pathModule, osModule, fsModule] = await Promise.all([
          dynamicImport(sqlite3Name),
          dynamicImport(pathName),
          dynamicImport(osName),
          dynamicImport(fsName)
        ]);
        
        sqlite3 = sqlite3Module.default || sqlite3Module;
        path = pathModule.default || pathModule;
        os = osModule.default || osModule;
        fs = fsModule.default || fsModule;
      }
    } else {
      // Browser environment - this function shouldn't be called
      return { success: false, reason: 'browser_environment' };
    }
    
    const dbPath = path.join(os.homedir(), '.cursor', 'ai-tracking', 'ai-code-tracking.db');
    
    if (!fs.existsSync(dbPath)) {
      console.warn('[CursorTokenTracker] Cursor database not found at:', dbPath);
      return { success: false, reason: 'database_not_found', path: dbPath };
    }
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject({ success: false, reason: 'database_error', error: err.message });
          return;
        }
      });
      
      const sinceTimestamp = options.since 
        ? Math.floor(new Date(options.since).getTime() / 1000) * 1000 
        : 0;
      
      // Query AI code usage entries
      const query = `
        SELECT 
          hash,
          model,
          fileName,
          fileExtension,
          source,
          timestamp,
          createdAt,
          conversationId,
          requestId
        FROM ai_code_hashes
        WHERE createdAt >= ?
        ORDER BY createdAt ASC
      `;
      
      db.all(query, [sinceTimestamp], async (err, rows) => {
        if (err) {
          db.close();
          reject({ success: false, reason: 'query_error', error: err.message });
          return;
        }
        
        const history = loadHistory();
        const existingHashes = new Set(history.entries.map(e => e.metadata?.hash).filter(Boolean));
        let imported = 0;
        let skipped = 0;
        
        // Group by conversation/request to estimate tokens
        const conversationMap = new Map();
        
        rows.forEach(row => {
          if (existingHashes.has(row.hash)) {
            skipped++;
            return;
          }
          
          const timestamp = new Date(row.createdAt).toISOString();
          const project = extractProjectFromPath(row.fileName || '');
          
          // Estimate tokens (rough approximation: ~4 chars per token)
          let estimatedTokens = 0;
          if (options.estimateTokens && row.source) {
            estimatedTokens = Math.ceil(row.source.length / 4);
          }
          
          const entry = {
            timestamp,
            tokensUsed: estimatedTokens || 0, // Will be 0 if not estimating
            model: row.model || 'unknown',
            operation: 'code-generation', // Cursor tracks code generation
            project: project,
            file: row.fileName || null,
            metadata: {
              hash: row.hash,
              fileExtension: row.fileExtension,
              conversationId: row.conversationId,
              requestId: row.requestId,
              sourceLength: row.source?.length || 0,
              syncedFromCursor: true
            }
          };
          
          history.entries.push(entry);
          imported++;
        });
        
        // Also get conversation summaries for additional context
        db.all('SELECT conversationId, title, model, tldr FROM conversation_summaries', [], (err, summaries) => {
          if (!err && summaries) {
            const summaryMap = new Map(summaries.map(s => [s.conversationId, s]));
            
            // Enhance entries with conversation context
            history.entries.forEach(entry => {
              if (entry.metadata?.conversationId) {
                const summary = summaryMap.get(entry.metadata.conversationId);
                if (summary) {
                  entry.metadata.conversationTitle = summary.title;
                  entry.metadata.conversationSummary = summary.tldr;
                  if (!entry.model || entry.model === 'unknown') {
                    entry.model = summary.model || entry.model;
                  }
                }
              }
            });
          }
          
          saveHistory(history);
          db.close();
          
          resolve({
            success: true,
            imported,
            skipped,
            totalInDatabase: rows.length,
            dateRange: rows.length > 0 ? {
              start: new Date(rows[0].createdAt).toISOString(),
              end: new Date(rows[rows.length - 1].createdAt).toISOString()
            } : null
          });
        });
      });
    });
  } catch (error) {
    console.error('[CursorTokenTracker] Error syncing from Cursor database:', error);
    return { 
      success: false, 
      reason: 'sync_error', 
      error: error.message 
    };
  }
}

/**
 * Extract project name from file path
 */
function extractProjectFromPath(filePath) {
  if (!filePath) return 'unknown';
  
  // Try to extract project from common patterns
  const patterns = [
    /(?:^|\/)(TimeBox|three-circa|circaevum|zhong|yin|yang)[\/\s]/i,
    /(?:^|\/)([^\/]+)\/Assets\//i, // Unity projects
    /(?:^|\/)([^\/]+)\/src\//i,    // Web projects
    /(?:^|\/)([^\/]+)\/package\.json/i
  ];
  
  for (const pattern of patterns) {
    const match = filePath.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  // Fallback: use first directory name
  const parts = filePath.split(/[\/\\]/);
  return parts.length > 1 ? parts[0] : 'unknown';
}
