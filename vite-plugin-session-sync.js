/**
 * Vite Plugin for Session Sync
 * 
 * Creates an API endpoint that serves session data from the file system
 * so the browser can automatically sync sessions without manual console work.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export function sessionSyncPlugin() {
  return {
    name: 'session-sync',
    configureServer(server) {
      // Add API endpoint for syncing tokens from Cursor database
      server.middlewares.use('/api/sync-tokens', async (req, res, next) => {
        // Only handle POST requests
        if (req.method !== 'POST') {
          return next();
        }

        try {
          // Run the sync script as a child process
          const scriptPath = path.join(process.cwd(), 'scripts', 'sync-tokens-to-session.js');
          
          const child = spawn('node', [scriptPath], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST');

            if (code === 0) {
              res.end(JSON.stringify({
                success: true,
                message: 'Token sync completed',
                output: stdout
              }));
            } else {
              res.statusCode = 500;
              res.end(JSON.stringify({
                success: false,
                error: 'Sync failed',
                output: stdout,
                errorOutput: stderr
              }));
            }
          });
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });

      // Add API endpoint for session sync
      server.middlewares.use('/api/sessions', (req, res, next) => {
        // Only handle GET requests
        if (req.method !== 'GET') {
          return next();
        }

        try {
          const sessionsFile = path.join(os.homedir(), '.cursor', 'sessions.json');
          const activeSessionFile = path.join(os.homedir(), '.cursor', 'active-session.txt');

          let sessions = [];
          let activeSessionId = null;

          // Read sessions from file system
          if (fs.existsSync(sessionsFile)) {
            const data = fs.readFileSync(sessionsFile, 'utf8');
            sessions = JSON.parse(data);
          }

          // Read active session ID
          if (fs.existsSync(activeSessionFile)) {
            activeSessionId = fs.readFileSync(activeSessionFile, 'utf8').trim();
          }

          // Set CORS headers
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET');

          // Return session data
          res.end(JSON.stringify({
            sessions,
            activeSessionId,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('[SessionSync] Error reading sessions:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      // Add API endpoint for git commit timestamp lookup
      server.middlewares.use('/api/git-commit-time', async (req, res, next) => {
        // Only handle GET requests
        if (req.method !== 'GET') {
          return next();
        }

        try {
          // Parse query parameters from URL
          const urlParts = req.url.split('?');
          const queryString = urlParts[1] || '';
          const params = new URLSearchParams(queryString);
          const commitHash = params.get('hash');
          const repoPath = params.get('repo') || ''; // Optional repo path
          
          if (!commitHash) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Commit hash required' }));
            return;
          }

          // Try to get commit timestamp from git
          const { exec } = require('child_process');
          const util = require('util');
          const execPromise = util.promisify(exec);
          
          // Determine the git repo directory
          let gitRepoPath = process.cwd(); // Default to current directory
          if (repoPath) {
            // If repo path is provided, resolve it relative to workspace root
            const workspaceRoot = process.cwd();
            gitRepoPath = path.join(workspaceRoot, repoPath);
            
            // Verify it's a valid git repo
            if (!fs.existsSync(path.join(gitRepoPath, '.git'))) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: `Git repository not found at: ${repoPath}` }));
              return;
            }
          }
          
          try {
            // Get commit timestamp: git show -s --format=%ct <hash>
            const { stdout } = await execPromise(`git show -s --format=%ct ${commitHash}`, {
              cwd: gitRepoPath,
              timeout: 5000
            });
            
            const timestamp = parseInt(stdout.trim()) * 1000; // Convert to milliseconds
            if (timestamp && !isNaN(timestamp)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET');
              res.end(JSON.stringify({ 
                timestamp: new Date(timestamp).toISOString(),
                hash: commitHash
              }));
              return;
            }
          } catch (gitError) {
            // Git command failed (commit not found, not a git repo, etc.)
            console.log('[SessionSync] Git lookup failed for commit:', commitHash, gitError.message);
          }

          // If git lookup failed, return error
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Commit timestamp not found' }));
        } catch (error) {
          console.error('[SessionSync] Error looking up commit:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    }
  };
}
