/**
 * Session Stats Component
 * 
 * Simple component to display session statistics for a project.
 * This is a test component to verify session tracking works.
 */

import React, { useState, useEffect } from 'react';
import { getSessions, getSessionStats } from '../utils/session-manager';
import { getTokenHistory } from '../utils/cursor-token-tracker';
import { nakamaService } from '../services/nakama';

// Add CSS for smooth scrolling
const timelineScrollStyles = `
  .timeline-scroll-container::-webkit-scrollbar {
    width: 8px;
  }
  .timeline-scroll-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }
  .timeline-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
  }
  .timeline-scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('timeline-scroll-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'timeline-scroll-styles';
  styleSheet.textContent = timelineScrollStyles;
  document.head.appendChild(styleSheet);
}

export default function SessionStats({ projectId, projectCode, projectName, refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  
  // Helper function to get commit timestamp from git (if available)
  const getCommitTimestamp = async (commitHash, repoPath) => {
    if (!commitHash || commitHash === 'No Commit ID') return null;
    
    try {
      // Try to get commit timestamp from git via API endpoint (if available in dev mode)
      if (import.meta.env.DEV) {
        const url = repoPath 
          ? `/api/git-commit-time?hash=${commitHash}&repo=${encodeURIComponent(repoPath)}`
          : `/api/git-commit-time?hash=${commitHash}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.timestamp) {
            return new Date(data.timestamp);
          }
        }
      }
    } catch (e) {
      // Git lookup failed, return null
      console.log('[SessionStats] Could not get commit timestamp for', commitHash, 'in repo', repoPath);
    }
    return null;
  };

  const loadSessionData = async () => {
    const filterOptions = projectCode 
      ? { projectCode } 
      : (projectId !== null && projectId !== undefined ? { projectId } : null);
    
    if (filterOptions) {
      try {
        const rawStored = localStorage.getItem('cursor_sessions');
        const allStoredSessions = rawStored ? JSON.parse(rawStored) : [];
        const matchingStored = allStoredSessions.filter(s => 
          (filterOptions.projectCode && s.projectCode === filterOptions.projectCode) ||
          (filterOptions.projectId && s.projectId === filterOptions.projectId)
        );
        
        if (matchingStored.length > 0) {
          console.log('[SessionStats] Direct localStorage read:', {
            sessionId: matchingStored[0].id?.substring(0, 12),
            totalTokens: matchingStored[0].totalTokens,
            tokenEntries: matchingStored[0].tokenEntries?.length || 0
          });
        }
        
        let projectSessions = getSessions(filterOptions);
        let projectStats = getSessionStats(filterOptions);
        
        // When no local data, try Nakama (for public Zhong / verified account)
        if (projectCode && (projectSessions.length === 0 || (projectStats.totalTokens === 0 && !projectStats.totalSessions)) && nakamaService.isAuthenticated() && !nakamaService.offlineMode) {
          try {
            const remote = await nakamaService.loadSessionAnalytics(projectCode);
            if (remote && (remote.sessionCount > 0 || remote.totalTokens > 0)) {
              projectSessions = (remote.sessions || []).map(s => ({ ...s, totalTokens: s.totalTokens || 0 }));
              projectStats = {
                totalSessions: remote.sessionCount ?? 0,
                totalTokens: remote.totalTokens ?? 0,
                averageTokens: remote.sessionCount ? (remote.totalTokens ?? 0) / remote.sessionCount : 0,
                totalPrompts: remote.totalPrompts ?? 0
              };
            }
          } catch (e) {
            console.log('[SessionStats] Nakama analytics load failed (optional):', e?.message);
          }
        }
        
        // Log detailed info about what we're getting
        const sessionTokenDetails = projectSessions.map(s => ({ 
          id: s.id?.substring(0, 12), 
          tokens: s.totalTokens,
          rawTokens: s.totalTokens,
          tokenEntries: s.tokenEntries?.length || 0
        }));
        
        console.log('[SessionStats] Reloaded data via getSessions:', {
          sessions: projectSessions.length,
          totalTokens: projectStats.totalTokens,
          refreshKey,
          sessionTokens: sessionTokenDetails,
          calculatedTotal: projectSessions.reduce((sum, s) => sum + (Number(s.totalTokens) || 0), 0)
        });
        
        // Total prompts: use remote totalPrompts if set, else compute from local sessions
        let totalPrompts = Number(projectStats.totalPrompts) || 0;
        if (totalPrompts === 0) {
          projectSessions.forEach(session => {
            if (session.promptGroups && Array.isArray(session.promptGroups)) {
              totalPrompts += session.promptGroups.length;
            } else if (session.tokenEntries && session.tokenEntries.length > 0) {
              const minuteGroups = new Set();
              session.tokenEntries.forEach(entryId => {
                const timestampMatch = entryId.match(/entry_(?:estimated_)?(\d+)/);
                if (timestampMatch) minuteGroups.add(Math.floor(parseInt(timestampMatch[1], 10) / 60000));
              });
              totalPrompts += minuteGroups.size || 1;
            }
          });
        }
        const tokensPerPrompt = totalPrompts > 0 ? projectStats.totalTokens / totalPrompts : 0;
        
        // Force state update - create completely new objects/arrays
        const newSessions = projectSessions.map(s => ({ ...s, totalTokens: Number(s.totalTokens) || 0 }));
        const newStats = {
          ...projectStats,
          totalTokens: Number(projectStats.totalTokens) || 0,
          averageTokens: Number(projectStats.averageTokens) || 0,
          totalPrompts: totalPrompts,
          tokensPerPrompt: tokensPerPrompt
        };
        
        setSessions(newSessions);
        setStats(newStats);
        
        // Build timeline for active session
        if (projectSessions.length > 0) {
          const activeSession = projectSessions.find(s => !s.endTime) || projectSessions[0];
          buildTimeline(activeSession).catch(e => {
            console.error('[SessionStats] Error building timeline:', e);
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('[SessionStats] Error loading sessions:', error);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };
  
  const buildTimeline = async (session) => {
    const events = [];
    const sessionStart = new Date(session.startTime);
    const sessionEnd = session.endTime ? new Date(session.endTime) : new Date();
    
    // Add session start
    events.push({
      timestamp: sessionStart,
      type: 'session-start',
      label: 'Session Started',
      description: session.description || 'Session started'
    });
    
    // Add token entry timestamps
    try {
      const tokenHistory = getTokenHistory();
      console.log('[SessionStats] Building timeline:', {
        sessionId: session.id,
        tokenEntriesInSession: session.tokenEntries?.length || 0,
        totalTokenHistoryEntries: tokenHistory.entries.length
      });
      
      // Match entries by:
      // 1. Entry ID (if in session.tokenEntries)
      // 2. Session ID in metadata
      // 3. Timestamp within session window (for entries synced from Cursor)
      const sessionTokenEntries = tokenHistory.entries.filter(e => {
        const entryTime = new Date(e.timestamp);
        const inTimeWindow = entryTime >= sessionStart && entryTime <= sessionEnd;
        
        // Check if entry ID matches
        const entryIdMatch = session.tokenEntries?.includes(e.metadata?.entryId);
        
        // Check if session ID matches
        const sessionIdMatch = e.metadata?.sessionId === session.id;
        
        // Check if synced from Cursor and in time window (for entries without entryId)
        const syncedMatch = e.metadata?.syncedFromCursor && inTimeWindow;
        
        return entryIdMatch || sessionIdMatch || syncedMatch;
      });
      
      console.log('[SessionStats] Found matching token entries in history:', sessionTokenEntries.length);
      
      // Also extract timestamps from entry IDs that weren't found in history
      // Entry IDs from sync script are like: entry_<timestamp>_<hash>
      if (session.tokenEntries && session.tokenEntries.length > sessionTokenEntries.length) {
        const foundEntryIds = new Set(sessionTokenEntries.map(e => e.metadata?.entryId));
        const missingEntryIds = session.tokenEntries.filter(id => !foundEntryIds.has(id));
        
        missingEntryIds.forEach(entryId => {
          // Try to extract timestamp from entry ID
          // Format: entry_<timestamp>_<hash> or entry_estimated_<timestamp>
          const timestampMatch = entryId.match(/entry_(?:estimated_)?(\d+)/);
          if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1]);
            if (timestamp && timestamp >= sessionStart.getTime() && timestamp <= sessionEnd.getTime()) {
              events.push({
                timestamp: new Date(timestamp),
                type: 'token-entry',
                label: 'Code Generation',
                description: 'Code generated (synced from Cursor)',
                tokens: 0, // Unknown from entry ID alone
                file: null,
                model: 'unknown'
              });
            }
          }
        });
        
        console.log('[SessionStats] Added entries from entry IDs:', missingEntryIds.length);
      }
      
      // Add entries from token history
      sessionTokenEntries.forEach(entry => {
        events.push({
          timestamp: new Date(entry.timestamp),
          type: 'token-entry',
          label: 'Code Generation',
          description: `${entry.tokensUsed.toLocaleString()} tokens • ${entry.operation || 'code-generation'}`,
          tokens: entry.tokensUsed,
          file: entry.file,
          model: entry.model,
          conversationId: entry.metadata?.conversationId,
          requestId: entry.metadata?.requestId
        });
      });
    } catch (e) {
      console.error('[SessionStats] Error building token timeline:', e);
    }
    
    // Add activity timestamps
    if (session.activities && session.activities.length > 0) {
      session.activities.forEach(activity => {
        events.push({
          timestamp: new Date(activity.timestamp),
          type: 'activity',
          label: activity.type || 'Activity',
          description: activity.description || '',
          metadata: activity.metadata
        });
      });
    }
    
    // Add session end if ended
    if (session.endTime) {
      events.push({
        timestamp: new Date(session.endTime),
        type: 'session-end',
        label: 'Session Ended',
        description: 'Session completed'
      });
    }
    
    // Add commits from project history (if we can get timestamps)
    // Get project data from localStorage
    try {
      const projectsData = JSON.parse(localStorage.getItem('zhong_projects') || '[]');
      const project = projectsData.find(p => 
        (projectCode && p.projectCode === projectCode) || 
        (projectId !== null && projectId !== undefined && p.id === projectId)
      );
      
      if (project && project.history && Array.isArray(project.history)) {
        // Process commits asynchronously
        const commitPromises = project.history
          .filter(knot => knot.commit && knot.commit !== 'No Commit ID')
          .map(async (knot) => {
            // First check if there's a manually stored timestamp
            let commitTimestamp = null;
            if (knot.timestamp) {
              commitTimestamp = new Date(knot.timestamp);
            } else {
              // Try to get timestamp from git
              commitTimestamp = await getCommitTimestamp(knot.commit, knot.repo);
            }
            
            if (commitTimestamp && commitTimestamp >= sessionStart && commitTimestamp <= sessionEnd) {
              return {
                timestamp: commitTimestamp,
                type: 'commit',
                label: 'Commit',
                description: knot.description || `Commit ${knot.commit.substring(0, 7)}`,
                commit: knot.commit,
                repo: knot.repo,
                version: knot.version,
                timestampSource: knot.timestamp ? 'manual' : 'git'
              };
            }
            return null;
          });
        
        // Wait for all commit lookups and filter out nulls
        const commitEvents = (await Promise.all(commitPromises)).filter(e => e !== null);
        events.push(...commitEvents);
      }
    } catch (e) {
      console.log('[SessionStats] Could not load project commits:', e);
    }
    
    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);
    
    // Group code generation events by prompt (conversationId + requestId)
    const codeGenEvents = events.filter(e => e.type === 'token-entry');
    const otherEvents = events.filter(e => e.type !== 'token-entry');
    
    // Group code generation events by prompt
    const promptBlocks = new Map();
    codeGenEvents.forEach(event => {
      // Create prompt key from conversationId + requestId, or fallback to timestamp-based grouping
      let promptKey;
      if (event.conversationId && event.requestId) {
        promptKey = `${event.conversationId}_${event.requestId}`;
      } else if (event.conversationId) {
        promptKey = `conv_${event.conversationId}`;
      } else {
        // Fallback: group by minute if no conversation info available
        const eventTime = event.timestamp.getTime();
        promptKey = `minute_${Math.floor(eventTime / 60000)}`;
      }
      
      if (!promptBlocks.has(promptKey)) {
        // Use the earliest timestamp in the prompt group
        promptBlocks.set(promptKey, {
          timestamp: event.timestamp,
          type: 'token-entry-block',
          label: 'Code Generation Block',
          count: 0,
          totalTokens: 0,
          events: [],
          promptKey: promptKey
        });
      }
      
      const block = promptBlocks.get(promptKey);
      block.count++;
      block.totalTokens += event.tokens || 0;
      block.events.push(event);
      
      // Update timestamp to earliest event in the prompt
      if (event.timestamp < block.timestamp) {
        block.timestamp = event.timestamp;
      }
    });
    
    // Convert prompt blocks to events and merge with other events
    const blockEvents = Array.from(promptBlocks.values()).map(block => ({
      ...block,
      description: `${block.count} code generation event${block.count !== 1 ? 's' : ''}${block.totalTokens > 0 ? ` • ${block.totalTokens.toLocaleString()} tokens` : ''}`
    }));
    
    // Combine and sort all events
    const allEvents = [...otherEvents, ...blockEvents].sort((a, b) => a.timestamp - b.timestamp);
    
    setTimelineEvents(allEvents);
  };

  useEffect(() => {
    console.log('[SessionStats] useEffect triggered:', { projectId, projectCode, refreshKey });
    // Only reload data, don't reset timeline state
    loadSessionData();
  }, [projectId, projectCode, refreshKey]); // Refresh when refreshKey changes
  
  // Separate effect to preserve timeline state - don't reload data when this changes
  // This prevents timeline from collapsing on every refresh
  
  // Also add a listener for storage changes (in case localStorage is updated externally)
  useEffect(() => {
    const handleStorageChange = () => {
      console.log('[SessionStats] Storage changed, reloading...');
      loadSessionData();
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  if (loading) {
    return <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Loading session data...</div>;
  }

  if (!stats || stats.totalSessions === 0) {
    return (
      <div style={{ 
        marginTop: '15px', 
        padding: '10px', 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '4px',
        fontSize: '0.8rem',
        opacity: 0.7
      }}>
        No sessions tracked for this project yet.
        <br />
        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
          Start a session in Cursor to see stats here.
        </span>
      </div>
    );
  }

  return (
    <div 
      key={`session-stats-${refreshKey}-${stats.totalTokens}`}
      style={{ 
        marginTop: '15px', 
        marginBottom: '0',
        padding: '10px', 
        paddingBottom: showTimeline ? '0' : '10px',
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '4px',
        fontSize: '0.8rem',
        flex: showTimeline ? '1 1 0' : '0 1 auto', // Allow timeline to grow and fill space, but start from 0
        display: 'flex',
        flexDirection: 'column',
        minHeight: '0', // Important for flex children to shrink
        maxHeight: '100%', // Don't exceed parent height
        overflow: 'hidden' // Prevent overflow
      }}>
      <div style={{ 
        fontWeight: 'bold', 
        marginBottom: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>📊 Session Stats</span>
        <button
          onClick={() => {
            console.log('[SessionStats] Manual refresh triggered');
            loadSessionData();
          }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '0.65rem',
            cursor: 'pointer',
            opacity: 0.7
          }}
          title="Refresh data"
        >
          🔄
        </button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', flexShrink: 0 }}>
        <div>
          <span style={{ opacity: 0.6 }}>Total Sessions:</span>
          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{stats.totalSessions}</div>
        </div>
        
        <div>
          <span style={{ opacity: 0.6 }}>Code Tokens:</span>
          <div style={{ fontWeight: 'bold', marginTop: '2px' }} key={`tokens-${stats.totalTokens}-${refreshKey}`}>
            {stats.totalTokens.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '2px' }}>
            ${(stats.totalTokens * 0.015 / 1000).toFixed(2)} USD
          </div>
        </div>
        
        <div>
          <span style={{ opacity: 0.6 }}>Total Prompts:</span>
          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
            {(stats.totalPrompts || 0).toLocaleString()}
          </div>
        </div>
        
        <div>
          <span style={{ opacity: 0.6 }}>Tokens/Prompt:</span>
          <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
            {stats.tokensPerPrompt ? Math.round(stats.tokensPerPrompt).toLocaleString() : '0'}
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <>
          <div style={{ marginTop: '10px', fontSize: '0.7rem', opacity: 0.8, flexShrink: 0 }}>
            <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Recent Sessions:</div>
            {sessions.slice(0, 3).map((session, idx) => (
              <div key={session.id} style={{ 
                marginBottom: '5px', 
                padding: '5px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '3px'
              }}>
                <div style={{ fontWeight: 'bold' }}>
                  {session.description || `Session ${idx + 1}`}
                </div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '2px' }}>
                  {session.totalTokens.toLocaleString()} code tokens
                  {session.duration && ` • ${Math.round(session.duration / 1000 / 60)} min`}
                </div>
              </div>
            ))}
          </div>
          
          {/* Timeline Toggle */}
          <div style={{ marginTop: '10px', marginBottom: '0', paddingTop: '10px', paddingBottom: '0', borderTop: '1px solid rgba(255,255,255,0.1)', flex: showTimeline ? '1 1 0' : '0 1 auto', display: 'flex', flexDirection: 'column', minHeight: showTimeline ? '200px' : '0', maxHeight: showTimeline ? 'none' : 'auto', overflow: 'hidden' }}>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              {showTimeline ? '▼' : '▶'} Timeline ({timelineEvents.length} events)
            </button>
            
            {showTimeline && timelineEvents.length > 0 && (
              <div 
                className="timeline-scroll-container"
                style={{ 
                  marginTop: '8px',
                  marginBottom: '0',
                  flex: '1 1 0', // Take all available space, start from 0
                  minHeight: '0', // Important for flex children
                  maxHeight: 'none', // Let parent flex container handle height constraint
                  overflowY: 'auto', // Always scrollable
                  overflowX: 'hidden', // Prevent horizontal overflow
                  fontSize: '0.65rem',
                  paddingLeft: '10px',
                  borderLeft: '2px solid rgba(255,255,255,0.2)',
                  paddingRight: '4px',
                  paddingBottom: '0',
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.3) transparent'
                }}>
                {timelineEvents.map((event, idx) => {
                  const timeStr = event.timestamp.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit'
                  });
                  const dateStr = event.timestamp.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  });
                  
                  const icon = event.type === 'session-start' ? '🚀' :
                              event.type === 'session-end' ? '✅' :
                              event.type === 'commit' ? '📦' :
                              event.type === 'token-entry-block' ? '💻' :
                              event.type === 'token-entry' ? '💻' :
                              '📝';
                  
                  const dotColor = event.type === 'session-start' ? 'var(--accent-gold)' :
                                   event.type === 'session-end' ? '#4caf50' :
                                   event.type === 'commit' ? '#9c27b0' :
                                   event.type === 'token-entry-block' ? '#2196f3' :
                                   event.type === 'token-entry' ? '#2196f3' : '#ff9800';
                  
                  return (
                    <div key={idx} style={{ 
                      marginBottom: '10px',
                      paddingLeft: '8px',
                      paddingTop: '4px',
                      paddingBottom: '4px',
                      position: 'relative',
                      minHeight: '40px'
                    }}>
                      <div style={{
                        position: 'absolute',
                        left: '-6px',
                        top: '4px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: dotColor
                      }}></div>
                      <div style={{ opacity: 0.6, fontSize: '0.6rem' }}>
                        {dateStr} {timeStr}
                      </div>
                      <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
                        {icon} {event.label}
                      </div>
                      {event.description && (
                        <div style={{ opacity: 0.7, fontSize: '0.6rem', marginTop: '2px' }}>
                          {event.description}
                        </div>
                      )}
                      {event.type === 'token-entry-block' && event.count > 0 && (
                        <div style={{ opacity: 0.6, fontSize: '0.55rem', marginTop: '2px', fontStyle: 'italic' }}>
                          {event.count} event{event.count !== 1 ? 's' : ''} in this prompt
                        </div>
                      )}
                      {event.type === 'commit' && event.commit && (
                        <div style={{ opacity: 0.6, fontSize: '0.55rem', marginTop: '2px', fontFamily: 'monospace' }}>
                          {event.commit.substring(0, 7)}
                          {event.repo && <span style={{ marginLeft: '4px', opacity: 0.5 }}>• {event.repo}</span>}
                          {event.version && <span style={{ marginLeft: '4px' }}>• {event.version}</span>}
                        </div>
                      )}
                      {event.file && (
                        <div style={{ opacity: 0.5, fontSize: '0.55rem', marginTop: '1px', fontFamily: 'monospace' }}>
                          {event.file.split('/').pop()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
