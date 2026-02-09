/**
 * Session Prompt Helper
 * 
 * Provides prompts for starting/ending sessions in Cursor chat.
 * Can be called manually or integrated into workflow.
 * 
 * Usage in Cursor:
 *   "start a new session" - Starts new session
 *   "end session" - Ends current session
 *   "start session for TimeBox" - Starts session with project
 */

import { startSession, endSession, getActiveSession, updateSessionDescription } from './session-manager';

/**
 * Handle "start a new session" command
 * 
 * @param {Object} [options] - Session options from user input
 * @param {string} [options.project] - Project name from user input
 * @param {string} [options.projectCode] - Project code (e.g., "26Q1U12") from user input
 * @param {string} [options.description] - Description from user input
 * @returns {Object} Session info
 */
export function handleStartSession(options = {}) {
  const active = getActiveSession();
  if (active) {
    return {
      success: false,
      message: `Active session already exists: ${active.id}`,
      activeSession: active
    };
  }
  
  const session = startSession({
    projectCode: options.projectCode,
    projectName: options.project,
    description: options.description || '',
    tags: options.tags || []
  });
  
  return {
    success: true,
    message: `Started new session: ${session.id}`,
    session: {
      id: session.id,
      startTime: session.startTime,
      project: session.projectName,
      description: session.description
    },
    prompt: options.description 
      ? null 
      : "Would you like to describe what you're working on in this session?"
  };
}

/**
 * Handle "end session" command
 * 
 * @param {Object} [options] - End session options
 * @param {string} [options.description] - Final description/summary
 * @returns {Object} Session summary
 */
export function handleEndSession(options = {}) {
  const active = getActiveSession();
  if (!active) {
    return {
      success: false,
      message: 'No active session to end'
    };
  }
  
  const ended = endSession({
    description: options.description
  });
  
  if (!ended) {
    return {
      success: false,
      message: 'Failed to end session'
    };
  }
  
  const duration = ended.duration ? Math.round(ended.duration / 1000 / 60) : 0;
  
  return {
    success: true,
    message: `Ended session: ${ended.id}`,
    summary: {
      id: ended.id,
      duration: `${duration} minutes`,
      tokens: ended.totalTokens,
      project: ended.projectName,
      description: ended.description
    }
  };
}

/**
 * Parse user input for session commands
 * 
 * @param {string} input - User input text
 * @returns {Object|null} Parsed command or null
 */
export function parseSessionCommand(input) {
  const lower = input.toLowerCase().trim();
  
  // Start session patterns
  if (lower.match(/^(start|begin|new)\s+(session|work)/)) {
    // Look for project code pattern (e.g., 26Q1U12)
    const codeMatch = lower.match(/(\d{2}q\d[a-z]\d{2})/i);
    // Look for "for [project name]"
    const projectMatch = lower.match(/for\s+(\w+)/);
    const descMatch = lower.match(/["'](.+?)["']/);
    
    return {
      command: 'start',
      projectCode: codeMatch ? codeMatch[1].toUpperCase() : null,
      project: projectMatch ? projectMatch[1] : null,
      description: descMatch ? descMatch[1] : null
    };
  }
  
  // End session patterns
  if (lower.match(/^(end|finish|close)\s+session/)) {
    const descMatch = lower.match(/["'](.+?)["']/);
    
    return {
      command: 'end',
      description: descMatch ? descMatch[1] : null
    };
  }
  
  // Update session description
  if (lower.match(/^(describe|update|note)\s+session/)) {
    const descMatch = lower.match(/["'](.+?)["']/);
    
    return {
      command: 'update',
      description: descMatch ? descMatch[1] : null
    };
  }
  
  return null;
}

/**
 * Interactive session prompt (for CLI or UI)
 */
export async function promptForSession() {
  // This would integrate with a UI component or CLI prompt
  // For now, returns a structure that can be used
  
  return {
    questions: [
      {
        type: 'input',
        name: 'projectName',
        message: 'What project are you working on?',
        default: null
      },
      {
        type: 'input',
        name: 'description',
        message: 'Describe what you\'ll be working on:',
        default: ''
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        default: ''
      }
    ]
  };
}
