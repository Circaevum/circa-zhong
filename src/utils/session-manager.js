/**
 * Session Manager for Cursor Token Tracking
 * 
 * Groups token usage, code edits, and other activities into work sessions.
 * Uses Cursor's conversationId as natural session boundaries, with manual override.
 * 
 * Usage:
 *   import { startSession, endSession, getSessions, associateSessionWithProject } from './utils/session-manager';
 *   
 *   // Start a new session (manual)
 *   const session = await startSession({
 *     projectId: 1,
 *     description: 'Working on trip text scaling fix'
 *   });
 *   
 *   // Or auto-detect from Cursor conversation
 *   const sessions = await detectSessionsFromCursor();
 */

import { getTokenHistory, logTokenUsage } from './cursor-token-tracker.js';

const SESSION_STORAGE_KEY = 'cursor_sessions';
const ACTIVE_SESSION_KEY = 'cursor_active_session';

// Session timeout configuration (in milliseconds)
// Default: 2 hours of inactivity
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Get Node.js modules (only in Node.js, not browser)
// Uses a pattern that works in both browser and Node.js
let nodeModulesCache = null;
function getNodeModules() {
  // Early return in browser - this code never executes in browser
  if (typeof window !== 'undefined') return null;
  if (nodeModulesCache) return nodeModulesCache;
  
  // In Node.js, try to get modules using createRequire
  // This uses a pattern Vite can't statically analyze
  try {
    // Check if we're in Node.js by looking for Node.js globals
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      // We're in Node.js - use createRequire pattern
      // Build module name dynamically so Vite can't analyze it
      const modName = 'mod' + 'ule'; // Split to avoid static analysis
      const crName = 'create' + 'Require'; // Split to avoid static analysis
      
      // Use Function constructor to create a require-like access
      // This prevents Vite from bundling the 'module' package
      const getModule = new Function('name', `
        try {
          const m = require(name);
          return m;
        } catch(e) {
          return null;
        }
      `);
      
      const moduleModule = getModule(modName);
      if (moduleModule && moduleModule[crName]) {
        const createRequire = moduleModule[crName];
        const req = createRequire(import.meta.url);
        
        nodeModulesCache = {
          fs: req('fs'),
          path: req('path'),
          os: req('os')
        };
        return nodeModulesCache;
      }
    }
    
    return null;
  } catch (e) {
    // Not in Node.js or modules not available - expected in browser
    return null;
  }
}

/**
 * Session data structure
 */
export class Session {
  constructor(data = {}) {
    this.id = data.id || generateSessionId();
    this.startTime = data.startTime || new Date().toISOString();
    this.endTime = data.endTime || null;
    this.projectId = data.projectId || null;
    this.projectCode = data.projectCode || null; // Unique project code (e.g., "26Q1U12")
    this.projectName = data.projectName || null;
    this.description = data.description || '';
    this.conversationId = data.conversationId || null; // Cursor conversation ID
    this.tokenEntries = data.tokenEntries || []; // Array of token entry IDs
    this.totalTokens = data.totalTokens || 0;
    this.activities = data.activities || []; // Code edits, builds, tests, etc.
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
  }
  
  get duration() {
    if (!this.endTime) return null;
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);
    return end - start;
  }
  
  get isActive() {
    return this.endTime === null;
  }
  
  toJSON() {
    return {
      id: this.id,
      startTime: this.startTime,
      endTime: this.endTime,
      projectId: this.projectId,
      projectCode: this.projectCode,
      projectName: this.projectName,
      description: this.description,
      conversationId: this.conversationId,
      tokenEntries: this.tokenEntries,
      totalTokens: this.totalTokens,
      activities: this.activities,
      tags: this.tags,
      metadata: this.metadata
    };
  }
}

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load sessions from storage
 */
function loadSessions() {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } else {
      const modules = getNodeModules();
      if (!modules) return [];
      const { fs, path, os } = modules;
      const filePath = path.join(os.homedir(), '.cursor', 'sessions.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    }
  } catch (error) {
    console.error('[SessionManager] Error loading sessions:', error);
    return [];
  }
  return [];
}

/**
 * Save sessions to storage
 */
function saveSessions(sessions) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    } else {
      const modules = getNodeModules();
      if (!modules) return false;
      const { fs, path, os } = modules;
      const filePath = path.join(os.homedir(), '.cursor', 'sessions.json');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf8');
    }
    return true;
  } catch (error) {
    console.error('[SessionManager] Error saving sessions:', error);
    return false;
  }
}

/**
 * Get active session ID
 */
function getActiveSessionId() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } else {
    const modules = getNodeModules();
    if (!modules) return null;
    const { fs, path, os } = modules;
    const filePath = path.join(os.homedir(), '.cursor', 'active-session.txt');
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  }
  return null;
}

/**
 * Set active session ID
 */
function setActiveSessionId(sessionId) {
  if (typeof window !== 'undefined') {
    if (sessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } else {
    const modules = getNodeModules();
    if (!modules) return;
    const { fs, path, os } = modules;
    const filePath = path.join(os.homedir(), '.cursor', 'active-session.txt');
    if (sessionId) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, sessionId, 'utf8');
    } else if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

/**
 * Start a new session
 * 
 * @param {Object} options - Session options
 * @param {number} [options.projectId] - Associated project ID
 * @param {string} [options.projectCode] - Project code (e.g., "26Q1U12") - alternative to projectId
 * @param {string} [options.projectName] - Project name
 * @param {string} [options.description] - Session description
 * @param {string} [options.conversationId] - Cursor conversation ID
 * @param {Array<string>} [options.tags] - Session tags
 * @returns {Session} Created session
 */
export function startSession(options = {}) {
  // Check for and end any timed-out sessions first
  checkAndEndTimedOutSessions();
  
  // Check if there's an active session
  const activeId = getActiveSessionId();
  if (activeId) {
    const sessions = loadSessions();
    const active = sessions.find(s => s.id === activeId);
    if (active && !active.endTime) {
      console.warn('[SessionManager] Active session already exists:', active.id);
      return new Session(active);
    }
  }
  
  const session = new Session({
    projectId: options.projectId,
    projectCode: options.projectCode,
    projectName: options.projectName,
    description: options.description || '',
    conversationId: options.conversationId,
    tags: options.tags || []
  });
  
  const sessions = loadSessions();
  sessions.push(session.toJSON());
  saveSessions(sessions);
  setActiveSessionId(session.id);
  
  console.log(`[SessionManager] Started session: ${session.id}`, {
    project: session.projectName || session.projectId,
    description: session.description
  });
  
  return session;
}

/**
 * End the active session
 * 
 * @param {Object} [options] - End session options
 * @param {string} [options.description] - Update description before ending
 * @returns {Session|null} Ended session or null if no active session
 */
export function endSession(options = {}) {
  const activeId = getActiveSessionId();
  if (!activeId) {
    console.warn('[SessionManager] No active session to end');
    return null;
  }
  
  const sessions = loadSessions();
  const sessionIndex = sessions.findIndex(s => s.id === activeId);
  if (sessionIndex === -1) {
    console.warn('[SessionManager] Active session not found:', activeId);
    setActiveSessionId(null);
    return null;
  }
  
  const session = sessions[sessionIndex];
  if (session.endTime) {
    console.warn('[SessionManager] Session already ended:', activeId);
    setActiveSessionId(null);
    return new Session(session);
  }
  
  // Update description if provided
  if (options.description) {
    session.description = options.description;
  }
  
  // Calculate total tokens from associated entries
  // Only recalculate if totalTokens is not already set (preserve existing value from sync script)
  if (!session.totalTokens || session.totalTokens === 0) {
    try {
      const tokenHistory = getTokenHistory();
      const sessionTokens = session.tokenEntries
        ?.map(entryId => tokenHistory.entries.find(e => e.metadata?.entryId === entryId))
        .filter(Boolean)
        .reduce((sum, e) => sum + e.tokensUsed, 0) || 0;
      
      // Only update if we found tokens in history, otherwise preserve existing (might be from sync script)
      if (sessionTokens > 0) {
        session.totalTokens = sessionTokens;
      }
    } catch (e) {
      // If token history is unavailable, keep existing totalTokens (might be from sync script)
      console.warn('[SessionManager] Could not calculate tokens from history, preserving existing value');
    }
  }
  
  session.endTime = new Date().toISOString();
  sessions[sessionIndex] = session;
  saveSessions(sessions);
  setActiveSessionId(null);
  
  console.log(`[SessionManager] Ended session: ${session.id}`, {
    duration: new Date(session.endTime) - new Date(session.startTime),
    tokens: session.totalTokens
  });
  
  return new Session(session);
}

/**
 * Get the last activity time for a session
 * Checks token entries and activities to find most recent activity
 */
function getLastActivityTime(session) {
  let lastActivity = new Date(session.startTime);
  
  // Check activities
  if (session.activities && session.activities.length > 0) {
    const activityTimes = session.activities.map(a => new Date(a.timestamp));
    const latestActivity = new Date(Math.max(...activityTimes));
    if (latestActivity > lastActivity) {
      lastActivity = latestActivity;
    }
  }
  
  // Check token entries (if we have token history available)
  try {
    const tokenHistory = getTokenHistory();
    if (session.tokenEntries && session.tokenEntries.length > 0) {
      const sessionTokenEntries = tokenHistory.entries.filter(e => 
        session.tokenEntries.includes(e.metadata?.entryId)
      );
      if (sessionTokenEntries.length > 0) {
        const tokenTimes = sessionTokenEntries.map(e => new Date(e.timestamp));
        const latestToken = new Date(Math.max(...tokenTimes));
        if (latestToken > lastActivity) {
          lastActivity = latestToken;
        }
      }
    }
  } catch (e) {
    // Token history not available, use activities only
  }
  
  return lastActivity;
}

/**
 * Check and auto-end sessions that have timed out due to inactivity
 * 
 * @param {number} [timeoutMs] - Timeout in milliseconds (default: SESSION_TIMEOUT_MS)
 * @returns {Array<string>} IDs of sessions that were auto-ended
 */
export function checkAndEndTimedOutSessions(timeoutMs = SESSION_TIMEOUT_MS) {
  const sessions = loadSessions();
  const now = new Date();
  const endedSessions = [];
  
  sessions.forEach((session, index) => {
    // Skip already ended sessions
    if (session.endTime) return;
    
    const lastActivity = getLastActivityTime(session);
    const inactiveMs = now - lastActivity;
    
    if (inactiveMs >= timeoutMs) {
      // Session has timed out - auto-end it
      const sessionObj = new Session(session);
      
      // Calculate final token totals
      // Only recalculate if totalTokens is not already set (preserve existing value from sync script)
      if (!session.totalTokens || session.totalTokens === 0) {
        try {
          const tokenHistory = getTokenHistory();
          const sessionTokens = session.tokenEntries
            ?.map(entryId => tokenHistory.entries.find(e => e.metadata?.entryId === entryId))
            .filter(Boolean)
            .reduce((sum, e) => sum + e.tokensUsed, 0) || 0;
          
          // Only update if we found tokens in history, otherwise preserve existing (might be from sync script)
          if (sessionTokens > 0) {
            session.totalTokens = sessionTokens;
          }
        } catch (e) {
          // Keep existing totalTokens if we can't calculate
          console.warn('[SessionManager] Could not calculate tokens from history, preserving existing value');
        }
      }
      
      session.endTime = new Date().toISOString();
      session.description = session.description || 
        `Auto-ended after ${Math.round(inactiveMs / (60 * 60 * 1000))} hours of inactivity`;
      
      sessions[index] = session;
      endedSessions.push(session.id);
      
      // Clear active session if this was the active one
      const activeId = getActiveSessionId();
      if (activeId === session.id) {
        setActiveSessionId(null);
      }
      
      console.log(`[SessionManager] Auto-ended timed out session: ${session.id}`, {
        inactiveHours: Math.round(inactiveMs / (60 * 60 * 1000)),
        tokens: session.totalTokens
      });
    }
  });
  
  if (endedSessions.length > 0) {
    saveSessions(sessions);
  }
  
  return endedSessions;
}

/**
 * Get active session
 * Automatically checks for and ends timed-out sessions
 */
export function getActiveSession() {
  // Check for timed out sessions first
  checkAndEndTimedOutSessions();
  
  const activeId = getActiveSessionId();
  if (!activeId) return null;
  
  const sessions = loadSessions();
  const session = sessions.find(s => s.id === activeId && !s.endTime);
  return session ? new Session(session) : null;
}

/**
 * Get all sessions
 * 
 * @param {Object} [options] - Filter options
 * @param {number} [options.projectId] - Filter by project ID
 * @param {string} [options.projectCode] - Filter by project code (e.g., "26Q1U12")
 * @param {Date} [options.startDate] - Filter by start date
 * @param {Date} [options.endDate] - Filter by end date
 * @param {boolean} [options.activeOnly] - Only return active sessions
 * @returns {Array<Session>} Filtered sessions
 */
export function getSessions(options = {}) {
  let sessions = loadSessions().map(s => new Session(s));
  
  if (options.projectId !== undefined) {
    sessions = sessions.filter(s => s.projectId === options.projectId);
  }
  
  if (options.projectCode !== undefined) {
    sessions = sessions.filter(s => s.projectCode === options.projectCode);
  }
  
  if (options.startDate) {
    const start = new Date(options.startDate);
    sessions = sessions.filter(s => new Date(s.startTime) >= start);
  }
  
  if (options.endDate) {
    const end = new Date(options.endDate);
    sessions = sessions.filter(s => new Date(s.startTime) <= end);
  }
  
  if (options.activeOnly) {
    sessions = sessions.filter(s => s.isActive);
  }
  
  return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

/**
 * Associate session with project
 */
export function associateSessionWithProject(sessionId, projectId, projectName) {
  const sessions = loadSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    console.warn('[SessionManager] Session not found:', sessionId);
    return false;
  }
  
  sessions[sessionIndex].projectId = projectId;
  sessions[sessionIndex].projectName = projectName;
  saveSessions(sessions);
  
  return true;
}

/**
 * Update session description
 */
export function updateSessionDescription(sessionId, description) {
  const sessions = loadSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    console.warn('[SessionManager] Session not found:', sessionId);
    return false;
  }
  
  sessions[sessionIndex].description = description;
  saveSessions(sessions);
  
  return true;
}

/**
 * Add token entry to session
 */
export function addTokenEntryToSession(sessionId, entryId) {
  // Check for timed-out sessions first
  checkAndEndTimedOutSessions();
  
  const sessions = loadSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    console.warn('[SessionManager] Session not found:', sessionId);
    return false;
  }
  
  // Don't add to ended sessions
  if (sessions[sessionIndex].endTime) {
    console.warn('[SessionManager] Cannot add token entry to ended session:', sessionId);
    return false;
  }
  
  if (!sessions[sessionIndex].tokenEntries) {
    sessions[sessionIndex].tokenEntries = [];
  }
  
  if (!sessions[sessionIndex].tokenEntries.includes(entryId)) {
    sessions[sessionIndex].tokenEntries.push(entryId);
    saveSessions(sessions);
  }
  
  return true;
}

/**
 * Add activity to session (code edit, build, test, etc.)
 */
export function addActivityToSession(sessionId, activity) {
  // Check for timed-out sessions first
  checkAndEndTimedOutSessions();
  
  const sessions = loadSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    console.warn('[SessionManager] Session not found:', sessionId);
    return false;
  }
  
  // Don't add to ended sessions
  if (sessions[sessionIndex].endTime) {
    console.warn('[SessionManager] Cannot add activity to ended session:', sessionId);
    return false;
  }
  
  if (!sessions[sessionIndex].activities) {
    sessions[sessionIndex].activities = [];
  }
  
  sessions[sessionIndex].activities.push({
    timestamp: new Date().toISOString(),
    type: activity.type, // 'code-edit', 'build', 'test', 'deploy', etc.
    description: activity.description || '',
    metadata: activity.metadata || {}
  });
  
  saveSessions(sessions);
  return true;
}

/**
 * Auto-detect sessions from Cursor conversations
 * Groups token entries by conversationId
 * 
 * @param {Object} [options] - Detection options
 * @param {number} [options.maxGapMinutes] - Max gap between entries to consider same session (default: 60)
 * @param {boolean} [options.autoCreate] - Automatically create sessions (default: false)
 * @returns {Array<Object>} Detected session candidates
 */
export async function detectSessionsFromCursor(options = {}) {
  const maxGapMinutes = options.maxGapMinutes || 60;
  const tokenHistory = getTokenHistory();
  
  // Group by conversationId
  const byConversation = {};
  tokenHistory.entries.forEach(entry => {
    const convId = entry.metadata?.conversationId || entry.metadata?.syncedFromCursor?.conversationId;
    if (!convId) return;
    
    if (!byConversation[convId]) {
      byConversation[convId] = [];
    }
    byConversation[convId].push(entry);
  });
  
  // Detect session boundaries within conversations
  const candidates = [];
  
  Object.entries(byConversation).forEach(([conversationId, entries]) => {
    // Sort by timestamp
    entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    let currentSession = null;
    
    entries.forEach((entry, index) => {
      const entryTime = new Date(entry.timestamp);
      
      if (!currentSession) {
        // Start new session
        currentSession = {
          conversationId,
          startTime: entry.timestamp,
          endTime: entry.timestamp,
          entries: [entry],
          totalTokens: entry.tokensUsed,
          projects: new Set([entry.project])
        };
      } else {
        const lastTime = new Date(currentSession.endTime);
        const gapMinutes = (entryTime - lastTime) / (1000 * 60);
        
        if (gapMinutes <= maxGapMinutes) {
          // Continue current session
          currentSession.endTime = entry.timestamp;
          currentSession.entries.push(entry);
          currentSession.totalTokens += entry.tokensUsed;
          currentSession.projects.add(entry.project);
        } else {
          // Save current session and start new one
          candidates.push({
            ...currentSession,
            projects: Array.from(currentSession.projects),
            duration: new Date(currentSession.endTime) - new Date(currentSession.startTime)
          });
          
          currentSession = {
            conversationId,
            startTime: entry.timestamp,
            endTime: entry.timestamp,
            entries: [entry],
            totalTokens: entry.tokensUsed,
            projects: new Set([entry.project])
          };
        }
      }
      
      // Save last session
      if (index === entries.length - 1 && currentSession) {
        candidates.push({
          ...currentSession,
          projects: Array.from(currentSession.projects),
          duration: new Date(currentSession.endTime) - new Date(currentSession.startTime)
        });
      }
    });
  });
  
  // Auto-create sessions if requested
  if (options.autoCreate) {
    const existingSessions = loadSessions();
    const existingConvIds = new Set(existingSessions.map(s => s.conversationId).filter(Boolean));
    
    candidates.forEach(candidate => {
      if (!existingConvIds.has(candidate.conversationId)) {
        const session = startSession({
          conversationId: candidate.conversationId,
          description: `Auto-detected from conversation ${candidate.conversationId.substring(0, 8)}...`,
          projectName: candidate.projects[0] || 'unknown'
        });
        
        // Associate token entries
        candidate.entries.forEach(entry => {
          if (!entry.metadata) entry.metadata = {};
          entry.metadata.entryId = `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          entry.metadata.sessionId = session.id;
        });
        
        // End the session
        endSession();
      }
    });
  }
  
  return candidates;
}

/**
 * Get session statistics
 * 
 * @param {Object} [options] - Filter options (same as getSessions)
 * @returns {Object} Statistics object
 */
export function getSessionStats(options = {}) {
  const sessions = getSessions(options);
  
  const stats = {
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.isActive).length,
    totalTokens: sessions.reduce((sum, s) => sum + s.totalTokens, 0),
    averageTokens: sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.totalTokens, 0) / sessions.length 
      : 0,
    totalDuration: sessions
      .filter(s => s.duration !== null)
      .reduce((sum, s) => sum + s.duration, 0),
    byProject: {},
    byTag: {}
  };
  
  sessions.forEach(session => {
    if (session.projectName) {
      stats.byProject[session.projectName] = (stats.byProject[session.projectName] || 0) + session.totalTokens;
    }
    session.tags.forEach(tag => {
      stats.byTag[tag] = (stats.byTag[tag] || 0) + session.totalTokens;
    });
  });
  
  return stats;
}
