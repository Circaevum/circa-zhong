import React, { useState, useEffect } from 'react';
import HexGrid from './components/HexGrid';
import { motion, AnimatePresence } from 'framer-motion';
import { projects as initialProjects } from './data/projects';
import { generateVersion } from './utils/versioning';
import { nakamaService } from './services/nakama';
import LoginModal from './components/LoginModal';
import SessionStats from './components/SessionStats';
import { generateProjectId, parseProjectId } from './utils/project-id';
import { getSessions, getSessionStats } from './utils/session-manager';

/** Push session analytics (tokens, prompts) to Nakama per projectCode. Only for email-authenticated users. */
async function pushSessionAnalyticsToNakama() {
  if (!nakamaService.isAuthenticated() || nakamaService.offlineMode) return;
  if (localStorage.getItem('zhong_auth_type') !== 'email') return;
  try {
    const raw = localStorage.getItem('cursor_sessions');
    const sessions = raw ? JSON.parse(raw) : [];
    const byCode = {};
    sessions.forEach(s => {
      const code = s.projectCode || 'unknown';
      if (!byCode[code]) byCode[code] = [];
      byCode[code].push(s);
    });
    for (const [projectCode, list] of Object.entries(byCode)) {
      if (projectCode === 'unknown') continue;
      const stats = getSessionStats({ projectCode });
      let totalPrompts = 0;
      list.forEach(s => {
        if (s.promptGroups && Array.isArray(s.promptGroups)) totalPrompts += s.promptGroups.length;
        else if (s.tokenEntries?.length) totalPrompts += 1;
      });
      await nakamaService.saveSessionAnalytics(projectCode, {
        totalTokens: stats.totalTokens ?? 0,
        totalPrompts,
        sessionCount: list.length,
        sessions: list.map(s => ({ id: s.id, totalTokens: s.totalTokens, startTime: s.startTime, endTime: s.endTime, description: s.description })),
        lastUpdated: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('[App] Push session analytics to Nakama failed:', e);
  }
}

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEmailAuthenticated, setIsEmailAuthenticated] = useState(false); // Only true for email login
  const [showLogin, setShowLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('local'); // 'local' | 'synced' | 'syncing' | 'error'
  const [sessionSyncKey, setSessionSyncKey] = useState(0); // Force SessionStats to refresh
  const [pushStatus, setPushStatus] = useState(null); // 'pushing' | 'pushed' | 'error' | null

  // Initialize from LocalStorage or fall back to default
  // Ensure all projects have projectCode
  const [projectsData, setProjectsData] = useState(() => {
    const saved = localStorage.getItem('zhong_projects');
    const projects = saved ? JSON.parse(saved) : initialProjects;
    
    // Ensure all projects have projectCode (for existing projects without it)
    return projects.map(project => {
      if (!project.projectCode) {
        return {
          ...project,
          projectCode: generateProjectId({
            date: new Date(),
            type: project.type || 'WEB',
            projectNumber: project.id
          })
        };
      }
      return project;
    });
  });

  // Sync sessions from file system (via API endpoint)
  const syncSessionsFromFileSystem = async () => {
    try {
      // Only in development - the API endpoint is provided by Vite plugin
      if (import.meta.env.DEV) {
        console.log('[App] 🔄 Starting sync from file system...');
        const response = await fetch('/api/sessions');
        if (response.ok) {
          const data = await response.json();
          
          if (data.sessions && data.sessions.length > 0) {
            // Merge with existing sessions in localStorage
            const existingSessions = JSON.parse(localStorage.getItem('cursor_sessions') || '[]');
            console.log('[App] 🔍 Sync comparison:', {
              fileSystemSessions: data.sessions.length,
              localStorageSessions: existingSessions.length
            });
            const existingIds = new Set(existingSessions.map(s => s.id));
            
            // Add new sessions that don't exist in localStorage
            const newSessions = data.sessions.filter(s => !existingIds.has(s.id));
            
            // Check for updated sessions (existing sessions with changed data)
            let hasUpdates = false;
            const updatedSessions = existingSessions.map(existing => {
              const updated = data.sessions.find(s => s.id === existing.id);
              if (updated) {
                // Check if anything changed (tokens, activities, etc.)
                // Use strict comparison and handle null/undefined
                const existingTokens = Number(existing.totalTokens) || 0;
                const updatedTokens = Number(updated.totalTokens) || 0;
                const tokensChanged = updatedTokens !== existingTokens;
                const existingEntries = existing.tokenEntries?.length || 0;
                const updatedEntries = updated.tokenEntries?.length || 0;
                const entriesChanged = updatedEntries !== existingEntries;
                const endTimeChanged = (updated.endTime || null) !== (existing.endTime || null);
                
                // Always log the comparison for debugging
                console.log(`[App] 🔍 Comparing session ${updated.id.substring(0, 12)}...:`, {
                  existingTokens,
                  updatedTokens,
                  tokensChanged,
                  existingEntries,
                  updatedEntries,
                  entriesChanged
                });
                
                if (tokensChanged || entriesChanged || endTimeChanged) {
                  hasUpdates = true;
                  console.log(`[App] 🔄 Session ${updated.id.substring(0, 12)}... changed:`, {
                    tokens: `${existingTokens.toLocaleString()} → ${updatedTokens.toLocaleString()}`,
                    entries: `${existingEntries} → ${updatedEntries}`,
                    endTime: `${existing.endTime || 'null'} → ${updated.endTime || 'null'}`
                  });
                } else {
                  // Log when no changes detected for debugging
                  console.log(`[App] ✓ Session ${updated.id.substring(0, 12)}... unchanged (${updatedTokens.toLocaleString()} tokens)`);
                }
                // Always use the updated version from file system (even if no change detected)
                return updated;
              }
              return existing;
            });
            
            // Add new sessions
            const mergedSessions = [...updatedSessions, ...newSessions];
            
            // Log before writing to localStorage
            const targetSession = mergedSessions.find(s => s.id === data.activeSessionId) ?? mergedSessions[0];
            if (targetSession) {
              console.log('[App] 📝 About to write to localStorage:', {
                sessionId: targetSession.id.substring(0, 12),
                totalTokens: targetSession.totalTokens,
                tokenEntries: targetSession.tokenEntries?.length || 0
              });
            }
            
            localStorage.setItem('cursor_sessions', JSON.stringify(mergedSessions));
            
            // Verify what was written
            const verifyStored = JSON.parse(localStorage.getItem('cursor_sessions') || '[]');
            const verifySession = verifyStored.find(s => s.id === (targetSession?.id || data.activeSessionId));
            if (verifySession) {
              console.log('[App] ✅ Verified localStorage write:', {
                sessionId: verifySession.id.substring(0, 12),
                totalTokens: verifySession.totalTokens,
                tokenEntries: verifySession.tokenEntries?.length || 0
              });
            }
            
            // Set active session if available
            if (data.activeSessionId) {
              localStorage.setItem('cursor_active_session', data.activeSessionId);
            }
            
            if (newSessions.length > 0) {
              console.log(`[App] ✅ Synced ${newSessions.length} new session(s) from file system`);
              console.log('[App] New sessions:', newSessions.map(s => ({
                id: s.id,
                projectCode: s.projectCode,
                description: s.description
              })));
            }
            
            // Always refresh if we have sessions (even if no changes detected, to ensure sync)
            if (data.sessions.length > 0) {
              if (hasUpdates) {
                console.log('[App] ✅ Updated existing session(s) with new data');
              } else if (newSessions.length > 0) {
                console.log(`[App] ✅ Synced ${newSessions.length} new session(s) from file system`);
              } else {
                // Still refresh to ensure UI is in sync, but log it
                console.log('[App] 🔄 Synced sessions (no changes detected, refreshing UI)');
              }
              
              // ALWAYS force a refresh after syncing, regardless of whether changes were detected
              // This ensures the UI stays in sync with the file system
              console.log('[App] 🔄 Forcing UI refresh after sync...');
              
              // Force SessionStats to refresh by updating key
              // This will cause the component to remount and reload data from localStorage
              setSessionSyncKey(prev => {
                const newKey = prev + 1;
                console.log(`[App] 🔑 Updating sessionSyncKey: ${prev} → ${newKey}`);
                return newKey;
              });
              
              // Also force a small delay to ensure localStorage is written before refresh
              setTimeout(() => {
                // Trigger a storage event to force components to reload
                window.dispatchEvent(new Event('storage'));
                console.log('[App] 📡 Dispatched storage event');
                
                // Double-check: verify what's in localStorage now
                const finalCheck = JSON.parse(localStorage.getItem('cursor_sessions') || '[]');
                const finalSession = finalCheck.find(s => s.id === (targetSession?.id || data.activeSessionId));
                if (finalSession) {
                  console.log('[App] 🔍 Final localStorage check:', {
                    sessionId: finalSession.id.substring(0, 12),
                    totalTokens: finalSession.totalTokens
                  });
                }
              }, 100);
            }
          }
        }
      }
    } catch (error) {
      // Silently fail - this is optional functionality
      console.log('[App] Session sync unavailable (expected in production)');
    }
  };

  // Sync on mount only (no periodic refresh - user can click refresh button)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    
    // Sync once on mount
    syncSessionsFromFileSystem();
  }, []);

  // Initialize Nakama and check authentication on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Sync tokens from Cursor database first (if in dev mode)
        if (import.meta.env.DEV) {
          try {
            console.log('[App] 🔄 Triggering token sync from Cursor database...');
            const syncResponse = await fetch('/api/sync-tokens', { method: 'POST' });
            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              console.log('[App] ✅ Token sync completed:', syncData.message);
            } else {
              console.log('[App] ⚠️ Token sync failed (this is OK if no active session)');
            }
          } catch (error) {
            console.log('[App] Token sync unavailable:', error.message);
          }
        }
        
        // Sync sessions from file system (if available)
        await syncSessionsFromFileSystem();
        
        await nakamaService.init();
        
        // Check if we have a saved email session
        const savedSession = localStorage.getItem('zhong_session');
        const savedAuthType = localStorage.getItem('zhong_auth_type'); // 'device' or 'email'
        
        if (savedSession && savedAuthType === 'email') {
          try {
            const session = JSON.parse(savedSession);
            nakamaService.session = session;
            if (nakamaService.isAuthenticated()) {
              console.log('[App] ✅ Found valid email session:', {
                userId: session.user_id,
                username: session.username
              });
              setIsAuthenticated(true);
              setIsEmailAuthenticated(true);
              // Sync from Nakama for email-authenticated users
              await syncFromNakama();
            } else {
              console.log('[App] ⚠️ Email session expired, switching to device auth');
              // Session expired, do automatic device auth
              await handleDeviceAuth();
            }
          } catch (e) {
            console.log('[App] ⚠️ Invalid email session, switching to device auth');
            // Invalid session, do automatic device auth
            await handleDeviceAuth();
          }
        } else if (savedSession && savedAuthType === 'device') {
          // Check if existing device session is still valid
          try {
            const session = JSON.parse(savedSession);
            nakamaService.session = session;
            if (nakamaService.isAuthenticated()) {
              console.log('[App] ✅ Found valid device session:', {
                userId: session.user_id,
                username: session.username || 'Anonymous Device'
              });
              setIsAuthenticated(true);
              setIsEmailAuthenticated(false);
            } else {
              console.log('[App] ⚠️ Device session expired, re-authenticating...');
              await handleDeviceAuth();
            }
          } catch (e) {
            console.log('[App] ⚠️ Invalid device session, re-authenticating...');
            await handleDeviceAuth();
          }
        } else {
          // No session, do automatic device auth (silent, local only)
          console.log('[App] 📱 No existing session, starting device authentication...');
          await handleDeviceAuth();
        }
      } catch (error) {
        console.error('[App] Auth initialization failed:', error);
        // Continue in offline mode
        setIsAuthenticated(false);
        setIsEmailAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Device authentication (for local use only, doesn't save to Nakama)
  const handleDeviceAuth = async () => {
    try {
      console.log('[App] 🔐 Starting automatic device authentication...');
      const session = await nakamaService.authenticateDevice();
      localStorage.setItem('zhong_session', JSON.stringify(session));
      localStorage.setItem('zhong_auth_type', 'device');
      setIsAuthenticated(true);
      setIsEmailAuthenticated(false); // Device auth doesn't enable cloud sync
      console.log('[App] ✅ Device authenticated successfully:', {
        userId: session.user_id,
        username: session.username,
        expiresAt: new Date(session.expire_time * 1000).toLocaleString()
      });
      // Don't sync from Nakama for device auth
    } catch (error) {
      console.error('[App] ❌ Device auth failed:', error);
      setIsAuthenticated(false);
      setIsEmailAuthenticated(false);
    }
  };

  // Handle successful authentication
  const handleAuthenticated = async (session, authType = 'email') => {
    localStorage.setItem('zhong_session', JSON.stringify(session));
    localStorage.setItem('zhong_auth_type', authType);
    setIsAuthenticated(true);
    setIsEmailAuthenticated(authType === 'email');
    setShowLogin(false);
    // Only sync from Nakama if email authenticated
    if (authType === 'email') {
      await syncFromNakama();
    }
  };

  // Sync from Nakama
  const syncFromNakama = async () => {
    if (!nakamaService.isAuthenticated()) return;

    setSyncStatus('syncing');
    try {
      const syncedProjects = await nakamaService.syncProjects(projectsData);
      setProjectsData(syncedProjects);
      setSyncStatus('synced');
    } catch (error) {
      console.error('[App] Sync failed:', error);
      setSyncStatus('error');
      // Continue with local data
    }
  };

  // Persist changes to Nakama (only when email-authenticated)
  useEffect(() => {
    // Only save if email-authenticated - no local-only mode
    if (isEmailAuthenticated && nakamaService.isAuthenticated()) {
      // Save to Nakama
      nakamaService.saveProjects(projectsData).catch(error => {
        console.error('[App] Failed to save to Nakama:', error);
        setSyncStatus('error');
      });
      
      // Also save to localStorage as backup/cache
      localStorage.setItem('zhong_projects', JSON.stringify(projectsData));
      localStorage.setItem('zhong_projects_version', Date.now().toString());
    }
  }, [projectsData, isEmailAuthenticated]);

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [theme, setTheme] = useState('burgundy_royal');
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showHistory, setShowHistory] = useState(false); // Toggle for Worldline view
  /** Session analytics (tokens, prompts) per projectCode for showing on hex dots */
  const [sessionStatsByProjectCode, setSessionStatsByProjectCode] = useState({});

  // New Update Form State
  const [newUpdate, setNewUpdate] = useState({ description: '', commit: '', repo: '', timestamp: '' });
  
  // Project ID Configuration State (for uninitialized projects)
  const [projectIdConfig, setProjectIdConfig] = useState({
    year: new Date().getFullYear().toString().slice(-2),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
    systemType: 'WEB'
  });

  const selectedProject = projectsData.find(p => p.id === selectedProjectId);

  // Load session analytics from Nakama for all projects so we can show token/prompt counts on dots
  useEffect(() => {
    if (!nakamaService.isAuthenticated() || nakamaService.offlineMode) return;
    const codes = [...new Set(projectsData.map(p => p.projectCode).filter(Boolean))];
    if (codes.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = {};
      for (const code of codes) {
        if (cancelled) return;
        const data = await nakamaService.loadSessionAnalytics(code);
        if (data && (data.totalTokens > 0 || data.totalPrompts > 0)) next[code] = data;
      }
      if (!cancelled) setSessionStatsByProjectCode(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [projectsData, isAuthenticated]);

  // In dev, merge in session stats from localStorage (cursor_sessions) so dots update right after Sync Sessions
  const localStatsForDots = React.useMemo(() => {
    if (!import.meta.env.DEV) return {};
    try {
      const raw = localStorage.getItem('cursor_sessions');
      if (!raw) return {};
      const sessions = JSON.parse(raw);
      const byCode = {};
      sessions.forEach(s => {
        const code = s.projectCode;
        if (!code || code === 'unknown') return;
        if (!byCode[code]) byCode[code] = { totalTokens: 0, totalPrompts: 0, sessionCount: 0 };
        byCode[code].sessionCount += 1;
        byCode[code].totalTokens += Number(s.totalTokens) || 0;
        if (s.promptGroups && Array.isArray(s.promptGroups)) byCode[code].totalPrompts += s.promptGroups.length;
        else if (s.tokenEntries?.length) byCode[code].totalPrompts += 1;
      });
      return byCode;
    } catch {
      return {};
    }
  }, [sessionSyncKey]);

  const statsForGrid = { ...sessionStatsByProjectCode, ...localStatsForDots };

  // Calculate YANG/YIN type based on position (matching HexGrid logic)
  const getPositionType = (projectId) => {
    if (projectId === 0) return 'ZHONG';
    
    // Generate the same spiral coordinates as HexGrid
    function generateSpiral(n) {
      let results = [{ q: 0, r: 0 }];
      if (n === 0) return results;
      for (let k = 1; k <= n; k++) {
        let q = 0, r = -k, s = k;
        for (let i = 0; i < k; i++) { q++; s--; results.push({ q, r }); }
        for (let i = 0; i < k; i++) { r++; s--; results.push({ q, r }); }
        for (let i = 0; i < k; i++) { q--; r++; results.push({ q, r }); }
        for (let i = 0; i < k; i++) { q--; s++; results.push({ q, r }); }
        for (let i = 0; i < k; i++) { r--; s++; results.push({ q, r }); }
        for (let i = 0; i < k; i++) { q++; r--; results.push({ q, r }); }
      }
      return results;
    }
    
    const hexSize = 60;
    function hexToPixel(q, r, size) {
      const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
      const y = size * (3 / 2 * r);
      return { x, y };
    }
    
    const coords = generateSpiral(3);
    const coord = coords[projectId];
    if (!coord) return 'YANG'; // Default fallback
    
    const { x, y } = hexToPixel(coord.q, coord.r, hexSize);
    const { q, r } = coord;
    
    const isTopEye = (q === 1 && r === -2);
    const isBottomEye = (q === -1 && r === 2);
    const topEyeNeighbors = [
      { q: 2, r: -2 }, { q: 2, r: -3 }, { q: 1, r: -3 }, { q: 0, r: -2 }, { q: 0, r: -1 }, { q: 1, r: -1 }
    ];
    const bottomEyeNeighbors = [
      { q: 0, r: 2 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -2, r: 2 }, { q: -2, r: 3 }, { q: -1, r: 3 }
    ];
    const isTopNeighbor = topEyeNeighbors.some(n => n.q === q && n.r === r);
    const isBottomNeighbor = bottomEyeNeighbors.some(n => n.q === q && n.r === r);
    
    if (isTopEye) return 'YIN';
    if (isBottomEye) return 'YANG';
    if (isTopNeighbor) return 'YANG';
    if (isBottomNeighbor) return 'YIN';
    if (x < 0) return 'YANG';
    if (x > 0) return 'YIN';
    return y < 0 ? 'YANG' : 'YIN';
  };
  
  // Get position-based type for display
  const positionType = selectedProject ? getPositionType(selectedProject.id) : null;
  
  // Check if project is uninitialized
  const isProjectUninitialized = selectedProject && selectedProject.id !== 0 && (
    (selectedProject.status === 'Pending' || selectedProject.status === 'Unknown') &&
    selectedProject.description === 'Initialize project details...' &&
    selectedProject.name.match(/^Project \d+$/) &&
    (!selectedProject.history || selectedProject.history.length === 0)
  );

  const handleSelectProject = (project) => {
    setSelectedProjectId(project.id);
    setIsEditing(false);
    setShowHistory(false);
    // Auto-suggest repo based on project type
    const suggestedRepo = project.type === 'WEB' ? 'yang/web' :
                          project.type === 'DATABASE' ? 'yin/database' :
                          project.type === 'API' ? 'yin/rest' :
                          project.type === 'ZHONG' ? 'Zhong' :
                          project.type === 'UNITY' ? 'yang/unity' : '';
    setNewUpdate({ description: '', commit: '', repo: suggestedRepo, timestamp: '' });
    
    // Initialize project ID config with current defaults or existing projectCode
    if (project.projectCode) {
      const parsed = parseProjectId(project.projectCode);
      if (parsed) {
        setProjectIdConfig({
          year: parsed.year.toString().slice(-2),
          quarter: parsed.quarter,
          systemType: parsed.platformType
        });
      }
    } else {
      // Default to current date
      const now = new Date();
      setProjectIdConfig({
        year: now.getFullYear().toString().slice(-2),
        quarter: Math.floor(now.getMonth() / 3) + 1,
        systemType: project.type || 'WEB'
      });
    }
  };
  
  const handleInitializeProject = () => {
    if (!isEmailAuthenticated) {
      setShowLogin(true);
      return;
    }
    
    // Generate projectCode from selected parameters
    const fullYear = parseInt('20' + projectIdConfig.year);
    const dateForQuarter = new Date(fullYear, (projectIdConfig.quarter - 1) * 3, 1);
    const projectCode = generateProjectId({
      date: dateForQuarter,
      type: projectIdConfig.systemType,
      projectNumber: selectedProject.id
    });
    
    // Update project with generated code and mark as initialized
    const updatedProject = {
      ...selectedProject,
      projectCode: projectCode,
      type: projectIdConfig.systemType,
      status: 'Pending', // Still pending until they add more details
      description: 'Initialize project details...' // Keep default for now
    };
    
    setProjectsData(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
  };

  const handleEditClick = () => {
    if (!isEmailAuthenticated) {
      setShowLogin(true);
      return;
    }
    setEditForm(selectedProject);
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (!isEmailAuthenticated) {
      setShowLogin(true);
      return;
    }
    setProjectsData(prev => prev.map(p => p.id === editForm.id ? editForm : p));
    setIsEditing(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddKnot = () => {
    if (!isEmailAuthenticated) {
      setShowLogin(true);
      return;
    }
    if (!newUpdate.description) return;

    const today = new Date();
    const updateIndex = (selectedProject.history?.length || 0) + 1;
    const version = generateVersion(today, selectedProject.id, updateIndex);

    // Use manual timestamp if provided, otherwise use current date/time
    let commitTimestamp = null;
    if (newUpdate.timestamp) {
      const parsedTimestamp = new Date(newUpdate.timestamp);
      if (!isNaN(parsedTimestamp.getTime())) {
        commitTimestamp = parsedTimestamp.toISOString();
      }
    }
    
    const knot = {
      version,
      date: today.toLocaleDateString(),
      commit: newUpdate.commit || 'No Commit ID',
      repo: newUpdate.repo || '', // Store repo path if provided
      timestamp: commitTimestamp, // Store manual timestamp if provided
      description: newUpdate.description
    };

    const updatedProject = {
      ...selectedProject,
      history: [knot, ...(selectedProject.history || [])] // Newest first
    };

    setProjectsData(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
    // Keep repo suggestion for next commit, clear timestamp
    setNewUpdate({ description: '', commit: '', repo: newUpdate.repo || '', timestamp: '' });
  };

  const themes = {
    default: "Classic",
    obsidian: "Obsidian & Jade",
    midnight: "Midnight & Gold",
    red_blue: "Red & Blue",
    crimson_azure: "Crimson & Azure",
    burgundy_royal: "Burgundy & Royal",
    cosmic: "Cosmic Nebula"
  };
  
  const [swapBackgrounds, setSwapBackgrounds] = useState(false);
  const [swapDots, setSwapDots] = useState(false);

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        background: '#0a0a0f',
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>中</div>
          <div>Initializing Zhong...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 100 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 100, margin: 0, letterSpacing: '4px' }}>ZHONG</h1>
        <p style={{ opacity: 0.5, margin: 0 }}>Quarterly Development Dashboard</p>
        <div style={{ 
          marginTop: '5px',
          fontSize: '0.7rem',
          opacity: 0.6,
          lineHeight: '1.4'
        }}>
          <div>
            <span>Status: {isEmailAuthenticated 
              ? (syncStatus === 'synced' ? '✓ Synced' : syncStatus === 'syncing' ? '⟳ Syncing...' : syncStatus === 'error' ? '⚠ Offline' : '✓ Verified – you can edit cards')
              : isAuthenticated 
                ? '🔐 Device Session'
                : '📱 Offline'}
            </span>
          </div>
          {isEmailAuthenticated && (
            <div style={{ marginTop: '2px' }}>
              <span style={{ opacity: 0.8 }}>Verified account – card edits sync to your account</span>
            </div>
          )}
          {isAuthenticated && !isEmailAuthenticated && (
            <div style={{ marginTop: '2px' }}>
              <span>(Local only – log in to edit and sync)</span>
            </div>
          )}
          {!isEmailAuthenticated && (isAuthenticated || nakamaService.offlineMode) && (
            <div style={{ marginTop: '2px' }}>
              <span style={{ opacity: 0.85 }}>Log in with your account to see session stats (tokens, prompts) from other devices.</span>
            </div>
          )}
          {nakamaService.offlineMode && (
            <div style={{ marginTop: '2px' }}>
              <span style={{ opacity: 0.7 }}>Cloud not configured for this build – set VITE_NAKAMA_HOST and VITE_NAKAMA_SERVER_KEY when building to see stats on the public site.</span>
            </div>
          )}
          {isAuthenticated && !isEmailAuthenticated && (
            <div style={{ marginTop: '2px' }}>
              <span style={{ opacity: 0.7 }}>
                Device: {nakamaService.getUserId()?.substring(0, 8)}...
              </span>
            </div>
          )}
          <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {isEmailAuthenticated && (
              <button
                onClick={() => setShowLogin(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem'
                }}
              >
                Account
              </button>
            )}
            {!isEmailAuthenticated && (
              <button
                onClick={() => setShowLogin(true)}
                style={{
                  background: 'var(--accent-gold)',
                  border: 'none',
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 'bold'
                }}
              >
                Log in to edit cards
              </button>
            )}
            {import.meta.env.DEV && (
              <button
                onClick={syncSessionsFromFileSystem}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  marginLeft: '5px'
                }}
                title="Sync sessions from file system"
              >
                🔄 Sync Sessions
              </button>
            )}
            {isEmailAuthenticated && import.meta.env.DEV && (
              <button
                onClick={async () => {
                  if (nakamaService.offlineMode) {
                    setPushStatus('error');
                    setTimeout(() => setPushStatus(null), 3000);
                    return;
                  }
                  setPushStatus('pushing');
                  try {
                    await pushSessionAnalyticsToNakama();
                    setPushStatus('pushed');
                    setTimeout(() => setPushStatus(null), 3000);
                  } catch (e) {
                    setPushStatus('error');
                    setTimeout(() => setPushStatus(null), 3000);
                  }
                }}
                style={{
                  background: pushStatus === 'pushed' ? 'rgba(76,175,80,0.3)' : pushStatus === 'error' ? 'rgba(244,67,54,0.3)' : 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: pushStatus === 'pushing' ? 'wait' : 'pointer',
                  fontSize: '0.7rem',
                  marginLeft: '5px'
                }}
                title="Push session stats (tokens, prompts) to your account so they show on the public site"
                disabled={pushStatus === 'pushing'}
              >
                {pushStatus === 'pushing' ? '⟳ Pushing...' : pushStatus === 'pushed' ? '✓ Pushed to cloud' : pushStatus === 'error' ? (nakamaService.offlineMode ? '✗ Cloud not configured' : '✗ Push failed') : '☁ Push to cloud'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Theme Dropdown - Bottom Left */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 100, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        {/* Swap Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <button
            onClick={() => setSwapBackgrounds(!swapBackgrounds)}
            style={{
              background: swapBackgrounds ? 'var(--accent-gold)' : 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: swapBackgrounds ? '#000' : '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              whiteSpace: 'nowrap'
            }}
            title="Swap Background Colors"
          >
            🔄 BG
          </button>
          <button
            onClick={() => setSwapDots(!swapDots)}
            style={{
              background: swapDots ? 'var(--accent-gold)' : 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: swapDots ? '#000' : '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              whiteSpace: 'nowrap'
            }}
            title="Swap Dot Colors"
          >
            🔄 Dots
          </button>
        </div>
        
        {/* Theme Dropdown Button */}
        <div>
        <button
          onClick={() => setShowThemeDropdown(!showThemeDropdown)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>🎨 {themes[theme]}</span>
          <span style={{ fontSize: '0.6rem' }}>{showThemeDropdown ? '▼' : '▲'}</span>
        </button>
        
        {showThemeDropdown && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '5px',
              background: 'rgba(20, 20, 30, 0.95)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              padding: '8px',
              minWidth: '180px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 101
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(themes).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTheme(key);
                  setShowThemeDropdown(false);
                }}
                style={{
                  width: '100%',
                  background: theme === key ? 'var(--accent-gold)' : 'transparent',
                  color: theme === key ? '#000' : '#fff',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  fontWeight: theme === key ? 'bold' : 'normal',
                  marginBottom: '2px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (theme !== key) {
                    e.target.style.background = 'rgba(255,255,255,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (theme !== key) {
                    e.target.style.background = 'transparent';
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>
      
      {/* Click outside to close dropdown */}
      {showThemeDropdown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99
          }}
          onClick={() => setShowThemeDropdown(false)}
        />
      )}

      <HexGrid
        projects={projectsData}
        onSelectProject={handleSelectProject}
        currentTheme={theme}
        swapBackgrounds={swapBackgrounds}
        swapDots={swapDots}
        sessionStatsByProjectCode={statsForGrid}
      />

      <AnimatePresence>
        {selectedProject && (
          <motion.div
            className="info-panel"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              {!isEditing ? (
                <div>
                  <h2 style={{ margin: 0 }}>{selectedProject.name}</h2>
                  <div style={{ fontSize: '0.7em', opacity: 0.7, marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>
                      {selectedProject.history && selectedProject.history.length > 0
                        ? selectedProject.history[0].version
                        : 'v0.0.0'}
                    </span>
                    {selectedProject.projectCode && (
                      <span
                        onClick={(e) => {
                          navigator.clipboard.writeText(selectedProject.projectCode);
                          // Simple feedback - could enhance with toast notification
                          const el = e.target;
                          const originalText = el.textContent;
                          el.textContent = '✓ Copied!';
                          el.style.color = 'var(--accent-gold)';
                          setTimeout(() => {
                            el.textContent = originalText;
                            el.style.color = '';
                          }, 1000);
                        }}
                        style={{
                          fontFamily: 'monospace',
                          background: 'rgba(255,255,255,0.1)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.2)',
                          transition: 'all 0.2s'
                        }}
                        title="Click to copy Project ID"
                        onMouseEnter={(e) => {
                          e.target.style.background = 'rgba(255,255,255,0.2)';
                          e.target.style.borderColor = 'var(--accent-gold)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = 'rgba(255,255,255,0.1)';
                          e.target.style.borderColor = 'rgba(255,255,255,0.2)';
                        }}
                      >
                        {selectedProject.projectCode}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <input
                  name="name"
                  value={editForm.name}
                  onChange={handleInputChange}
                  disabled={!isEmailAuthenticated}
                  style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    border: 'none', 
                    color: isEmailAuthenticated ? '#fff' : 'rgba(255,255,255,0.5)', 
                    padding: '5px', 
                    borderRadius: '4px', 
                    width: '70%',
                    cursor: isEmailAuthenticated ? 'text' : 'not-allowed'
                  }}
                />
              )}

              <div>
                {!isEditing && (
                  <button
                    onClick={handleEditClick}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', marginRight: '5px', display: 'none' }} // Hidden for now, redundant?
                  >✎</button>
                )}
                {!isEditing ? (
                  <button
                    onClick={handleEditClick}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', marginRight: '10px' }}
                    title="Edit Details"
                  >✎</button>
                ) : (
                  <button
                    onClick={handleSaveClick}
                    style={{ background: 'transparent', border: 'none', color: '#4caf50', cursor: 'pointer', marginRight: '10px' }}
                    title="Save Changes"
                  >💾</button>
                )}
                <button
                  onClick={() => setSelectedProjectId(null)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                >✕</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '4px',
                background: positionType === 'YANG' ? '#eee' : positionType === 'ZHONG' ? 'var(--accent-gold)' : '#333',
                color: positionType === 'YANG' ? '#000' : positionType === 'ZHONG' ? '#000' : '#eee',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                {positionType === 'YANG' ? 'YANG' : 
                 positionType === 'YIN' ? 'YIN' :
                 positionType === 'ZHONG' ? 'ZHONG' : 'Unknown'}
              </div>

              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }}
              >
                {showHistory ? 'Show Details' : 'View Worldline'}
              </button>
            </div>

            <div style={{ marginTop: '20px', flex: '1 1 0', minHeight: '0', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
              {isProjectUninitialized ? (
                // Project ID Configuration Form (for uninitialized projects)
                <div style={{ padding: '10px' }}>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px' }}>
                    Configure Project ID
                  </h3>
                  <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '15px' }}>
                    Set the parameters that will generate your project code (e.g., 26Q1W22)
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', opacity: 0.8 }}>
                        Year (last 2 digits)
                      </label>
                      <input
                        type="number"
                        min="20"
                        max="99"
                        value={projectIdConfig.year}
                        onChange={(e) => {
                          const year = e.target.value.padStart(2, '0').slice(-2);
                          setProjectIdConfig({ ...projectIdConfig, year });
                        }}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          padding: '5px',
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', opacity: 0.8 }}>
                        Quarter
                      </label>
                      <select
                        value={projectIdConfig.quarter}
                        onChange={(e) => setProjectIdConfig({ ...projectIdConfig, quarter: parseInt(e.target.value) })}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          padding: '5px',
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <option value={1}>Q1 (Jan-Mar)</option>
                        <option value={2}>Q2 (Apr-Jun)</option>
                        <option value={3}>Q3 (Jul-Sep)</option>
                        <option value={4}>Q4 (Oct-Dec)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '5px', opacity: 0.8 }}>
                        System Type
                      </label>
                      <select
                        value={projectIdConfig.systemType}
                        onChange={(e) => setProjectIdConfig({ ...projectIdConfig, systemType: e.target.value })}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          padding: '5px',
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <option value="WEB">Web (W)</option>
                        <option value="DATABASE">Database (D)</option>
                        <option value="API">API (A)</option>
                        <option value="UNITY">Unity/AVP (U)</option>
                        <option value="ZHONG">Zhong (Z)</option>
                      </select>
                    </div>
                    
                    <div style={{ 
                      background: 'rgba(255,255,255,0.05)', 
                      padding: '10px', 
                      borderRadius: '4px',
                      marginTop: '10px',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}>
                      <div style={{ opacity: 0.6, marginBottom: '5px' }}>Generated Project Code:</div>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                        {(() => {
                          const fullYear = parseInt('20' + projectIdConfig.year);
                          const dateForQuarter = new Date(fullYear, (projectIdConfig.quarter - 1) * 3, 1);
                          return generateProjectId({
                            date: dateForQuarter,
                            type: projectIdConfig.systemType,
                            projectNumber: selectedProject.id
                          });
                        })()}
                      </div>
                    </div>
                    
                    {!isEmailAuthenticated ? (
                      <button
                        onClick={() => setShowLogin(true)}
                        style={{
                          width: '100%',
                          marginTop: '10px',
                          background: 'var(--accent-gold)',
                          color: '#000',
                          border: 'none',
                          padding: '8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.8rem'
                        }}
                      >
                        Login to Initialize Project
                      </button>
                    ) : (
                      <button
                        onClick={handleInitializeProject}
                        style={{
                          width: '100%',
                          marginTop: '10px',
                          background: 'var(--accent-gold)',
                          color: '#000',
                          border: 'none',
                          padding: '8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.8rem'
                        }}
                      >
                        Initialize Project
                      </button>
                    )}
                  </div>
                </div>
              ) : showHistory ? (
                <div className="worldline-container">
                  <h3 style={{ fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px' }}>Feature History</h3>

                  {/* New Knot Form */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                    <input
                      type="text"
                      placeholder="Repo Path (e.g., yang/web, yang/unity, yin/rest) - Optional"
                      value={newUpdate.repo}
                      onChange={(e) => setNewUpdate({ ...newUpdate, repo: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '5px',
                        marginBottom: '5px',
                        fontSize: '0.8rem'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Commit Hash (Optional)"
                      value={newUpdate.commit}
                      onChange={(e) => setNewUpdate({ ...newUpdate, commit: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '5px',
                        marginBottom: '5px',
                        fontSize: '0.8rem'
                      }}
                    />
                    <input
                      type="datetime-local"
                      placeholder="Commit Timestamp (Optional - if git lookup fails)"
                      value={newUpdate.timestamp}
                      onChange={(e) => setNewUpdate({ ...newUpdate, timestamp: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '5px',
                        marginBottom: '5px',
                        fontSize: '0.8rem'
                      }}
                      title="Manually enter timestamp if commit is in private/remote repo not accessible via git"
                    />
                    <textarea
                      placeholder="Update Description..."
                      value={newUpdate.description}
                      onChange={(e) => setNewUpdate({ ...newUpdate, description: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '5px',
                        fontSize: '0.8rem',
                        resize: 'none'
                      }}
                      rows={2}
                    />
                    {!isEmailAuthenticated ? (
                      <button
                        onClick={() => setShowLogin(true)}
                        style={{
                          width: '100%',
                          marginTop: '5px',
                          background: 'var(--accent-gold)',
                          color: '#000',
                          border: 'none',
                          padding: '5px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.8rem'
                        }}
                      >
                        Login to Add Update
                      </button>
                    ) : (
                      <button
                        onClick={handleAddKnot}
                        disabled={!newUpdate.description}
                        style={{
                          width: '100%',
                          marginTop: '5px',
                          background: !newUpdate.description ? '#555' : 'var(--accent-gold)',
                          color: !newUpdate.description ? '#aaa' : '#000',
                          border: 'none',
                          padding: '5px',
                          borderRadius: '4px',
                          cursor: !newUpdate.description ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          opacity: !newUpdate.description ? 0.5 : 1
                        }}
                      >
                        + Log Update
                      </button>
                    )}
                  </div>

                  {/* Timeline */}
                  <div style={{ position: 'relative', paddingLeft: '15px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                    {selectedProject.history && selectedProject.history.length > 0 ? (
                      selectedProject.history.map((knot, idx) => (
                        <div key={idx} style={{ marginBottom: '15px', position: 'relative' }}>
                          <div style={{
                            position: 'absolute',
                            left: '-20px',
                            top: '5px',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: idx === 0 ? 'var(--accent-gold)' : '#555'
                          }}></div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{knot.date} • {knot.version}</div>
                          <div style={{ fontSize: '0.85rem', margin: '2px 0' }}>{knot.description}</div>
                          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', opacity: 0.7 }}>
                            Commit: {knot.commit}
                            {knot.repo && <span style={{ marginLeft: '8px', opacity: 0.6 }}>• {knot.repo}</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '0.8rem' }}>No history recorded.</div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Standard Details View */}
                  {isEditing ? (
                    <textarea
                      name="description"
                      value={editForm.description}
                      onChange={handleInputChange}
                      disabled={!isEmailAuthenticated}
                      rows={6}
                      style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        border: 'none', 
                        color: isEmailAuthenticated ? '#fff' : 'rgba(255,255,255,0.5)', 
                        padding: '10px', 
                        borderRadius: '4px', 
                        width: '100%', 
                        fontFamily: 'inherit',
                        cursor: isEmailAuthenticated ? 'text' : 'not-allowed'
                      }}
                    />
                  ) : (
                    <p style={{ lineHeight: 1.5 }}>
                      {selectedProject.description || "No description available."}
                    </p>
                  )}

                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>Status</span>
                    {isEditing ? (
                      <select
                        name="status"
                        value={editForm.status}
                        onChange={handleInputChange}
                        disabled={!isEmailAuthenticated}
                        style={{ 
                          display: 'block', 
                          marginTop: '5px', 
                          background: 'rgba(255,255,255,0.1)', 
                          border: 'none', 
                          color: isEmailAuthenticated ? '#fff' : 'rgba(255,255,255,0.5)', 
                          padding: '5px', 
                          borderRadius: '4px', 
                          width: '100%',
                          cursor: isEmailAuthenticated ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Active">Active</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Paused">Paused</option>
                      </select>
                    ) : (
                      <div style={{ fontSize: '1.2rem' }}>{selectedProject.status}</div>
                    )}
                  </div>

                  {/* Session Stats - Test Component */}
                  <SessionStats 
                    key={`session-stats-${sessionSyncKey}`}
                    refreshKey={sessionSyncKey}
                    projectId={selectedProject.id}
                    projectCode={selectedProject.projectCode}
                    projectName={selectedProject.name} 
                  />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}

export default App;
