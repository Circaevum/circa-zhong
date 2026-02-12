/**
 * Nakama Service for Zhong
 * Handles authentication and project data persistence
 *
 * Configuration is loaded from environment variables (see .env.example).
 * Copy .env.example to .env and fill in your Nakama server details.
 */

const NAKAMA_CONFIG = {
  scheme: import.meta.env.VITE_NAKAMA_SCHEME || 'http',
  host: import.meta.env.VITE_NAKAMA_HOST || '',
  port: parseInt(import.meta.env.VITE_NAKAMA_PORT || '7350', 10),
  serverKey: import.meta.env.VITE_NAKAMA_SERVER_KEY || ''
};

// Log config in production to help debug (host/port are not sensitive)
if (import.meta.env.PROD) {
  console.log('[NakamaService] Config loaded:', {
    scheme: NAKAMA_CONFIG.scheme,
    host: NAKAMA_CONFIG.host || '(not set)',
    port: NAKAMA_CONFIG.port,
    hasServerKey: !!NAKAMA_CONFIG.serverKey,
    envHost: import.meta.env.VITE_NAKAMA_HOST || '(not set)'
  });
}

// Collection names
const COLLECTION = 'zhong_projects';
const COLLECTION_SESSION_ANALYTICS = 'zhong_session_analytics';

class NakamaService {
  constructor() {
    this.client = null;
    this.session = null;
    this.isInitialized = false;
    /** When true, no Nakama server is configured (e.g. GitHub Pages); app runs in local-only mode */
    this.offlineMode = false;
  }

  /**
   * Initialize Nakama client (lazy load the SDK).
   * If VITE_NAKAMA_HOST / VITE_NAKAMA_SERVER_KEY are missing, runs in offline mode (no throw).
   */
  async init() {
    if (this.isInitialized || this.offlineMode) return;

    if (!NAKAMA_CONFIG.host || !NAKAMA_CONFIG.serverKey) {
      console.warn('[NakamaService] No server config (VITE_NAKAMA_HOST / VITE_NAKAMA_SERVER_KEY). Running in local-only mode.');
      this.offlineMode = true;
      this.isInitialized = true;
      return;
    }

    try {
      const { Client } = await import('@heroiclabs/nakama-js');

      const nakamaUrl = `${NAKAMA_CONFIG.scheme}://${NAKAMA_CONFIG.host}:${NAKAMA_CONFIG.port}`;
      console.log('[NakamaService] Initializing client:', {
        url: nakamaUrl,
        host: NAKAMA_CONFIG.host,
        port: NAKAMA_CONFIG.port,
        scheme: NAKAMA_CONFIG.scheme,
        hasServerKey: !!NAKAMA_CONFIG.serverKey
      });

      this.client = new Client(
        NAKAMA_CONFIG.serverKey,
        NAKAMA_CONFIG.host,
        NAKAMA_CONFIG.port,
        NAKAMA_CONFIG.scheme === 'https'
      );
      
      this.isInitialized = true;
      console.log('[NakamaService] ✅ Initialized successfully');
    } catch (error) {
      console.error('[NakamaService] ❌ Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Authenticate with device ID (anonymous/device session).
   * In offline mode, returns a fake session so the app can render (local-only).
   */
  async authenticateDevice(deviceId = null) {
    if (!this.isInitialized && !this.offlineMode) await this.init();

    if (this.offlineMode) {
      deviceId = deviceId || localStorage.getItem('zhong_device_id') ||
                 `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('zhong_device_id', deviceId);
      const expireTime = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
      this.session = {
        user_id: `offline_${deviceId.replace(/[^a-z0-9]/gi, '').slice(0, 16)}`,
        username: 'Local Device',
        token: 'offline',
        expire_time: expireTime,
        isexpired: () => false
      };
      console.log('[NakamaService] ✅ Offline mode – local session');
      return this.session;
    }

    if (!deviceId) {
      deviceId = localStorage.getItem('zhong_device_id') ||
                 `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('zhong_device_id', deviceId);
    }

    try {
      this.session = await this.client.authenticateDevice(deviceId);
      console.log('[NakamaService] ✅ Device authenticated:', {
        userId: this.session.user_id,
        username: this.session.username || 'Anonymous Device',
        deviceId: deviceId,
        expiresAt: new Date(this.session.expire_time * 1000).toLocaleString(),
        token: this.session.token.substring(0, 20) + '...'
      });
      return this.session;
    } catch (error) {
      console.error('[NakamaService] ❌ Device authentication failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate with email/password (user session)
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {boolean} create - Whether to create a new account (true) or login (false)
   * @param {string} username - Optional username (only used when creating account)
   */
  async authenticateEmail(email, password, create = false, username = null) {
    if (!this.isInitialized && !this.offlineMode) await this.init();
    if (this.offlineMode) {
      throw new Error(
        'Cloud sync is not configured. Copy .env.example to .env in the circa-zhong folder, set VITE_NAKAMA_HOST and VITE_NAKAMA_SERVER_KEY to your Nakama server, then restart the dev server (npm run dev).'
      );
    }

    try {
      const nakamaUrl = `${NAKAMA_CONFIG.scheme}://${NAKAMA_CONFIG.host}:${NAKAMA_CONFIG.port}`;
      console.log('[NakamaService] Attempting email auth to:', nakamaUrl);
      
      // Nakama JS SDK signature: authenticateEmail(email, password, create, username, vars)
      this.session = await this.client.authenticateEmail(email, password, create, username);
      console.log('[NakamaService] ✅ User authenticated:', {
        userId: this.session.user_id,
        username: this.session.username,
        created: this.session.created,
        expiresAt: this.session.expires_at 
          ? new Date(this.session.expires_at * 1000).toLocaleString()
          : 'N/A'
      });
      return this.session;
    } catch (error) {
      console.error('[NakamaService] ❌ Email authentication failed:', {
        error: error.message || error,
        url: `${NAKAMA_CONFIG.scheme}://${NAKAMA_CONFIG.host}:${NAKAMA_CONFIG.port}`,
        host: NAKAMA_CONFIG.host,
        port: NAKAMA_CONFIG.port
      });
      // Provide more helpful error message
      if (error.message) {
        throw new Error(error.message);
      }
      throw new Error('Email authentication failed. Please check your credentials and ensure the Nakama server is accessible.');
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    if (!this.session) return false;
    
    // Nakama session uses isexpired(currenttime) where currenttime is in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    return !this.session.isexpired(currentTime);
  }

  /**
   * Get current user ID
   */
  getUserId() {
    return this.session?.user_id || null;
  }

  /**
   * Load projects from Nakama storage
   */
  async loadProjects() {
    if (this.offlineMode) return null;
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      const objects = await this.client.readStorageObjects(this.session, {
        objectIds: [{
          collection: COLLECTION,
          key: 'projects',
          userId: this.session.user_id
        }]
      });

      if (objects.objects && objects.objects.length > 0) {
        const data = JSON.parse(objects.objects[0].value);
        console.log('[NakamaService] Projects loaded from Nakama', {
          projectCount: Array.isArray(data) ? data.length : (data.projects?.length || 0),
          version: data._version || 'unknown'
        });
        // Return projects array if wrapped, or data as-is
        return Array.isArray(data) ? data : (data.projects || data);
      }

      return null; // No data stored yet
    } catch (error) {
      console.error('[NakamaService] Failed to load projects:', error);
      throw error;
    }
  }

  /**
   * Save projects to Nakama storage
   */
  async saveProjects(projects) {
    if (this.offlineMode) return true;
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      // Ensure projects is in the correct format
      const projectsData = Array.isArray(projects)
        ? { projects: projects, _version: Date.now().toString(), _synced: new Date().toISOString() }
        : projects;
      
      const value = JSON.stringify(projectsData);
      
      // Nakama JS SDK expects an array directly, not an object with 'objects' property
      await this.client.writeStorageObjects(this.session, [{
        collection: COLLECTION,
        key: 'projects',
        value: value,
        userId: this.session.user_id,
        permissionRead: 1, // Owner read
        permissionWrite: 1  // Owner write
      }]);

      console.log('[NakamaService] Projects saved to Nakama', {
        projectCount: Array.isArray(projects) ? projects.length : (projects.projects?.length || 0),
        version: projectsData._version
      });
      return true;
    } catch (error) {
      console.error('[NakamaService] Failed to save projects:', error);
      throw error;
    }
  }

  /**
   * Sync: Load from Nakama, merge with local, save back
   */
  async syncProjects(localProjects) {
    try {
      // Load from Nakama
      const remoteProjects = await this.loadProjects();
      
      if (!remoteProjects) {
        // First time: save local to Nakama
        const projectsToSave = Array.isArray(localProjects) 
          ? { projects: localProjects, _version: Date.now().toString(), _synced: new Date().toISOString() }
          : localProjects;
        await this.saveProjects(projectsToSave);
        return Array.isArray(localProjects) ? localProjects : (projectsToSave.projects || localProjects);
      }

      // Handle both array and object formats
      const remoteProjectsArray = Array.isArray(remoteProjects) 
        ? remoteProjects 
        : (remoteProjects.projects || []);
      const localProjectsArray = Array.isArray(localProjects) 
        ? localProjects 
        : (localProjects.projects || []);

      // Merge strategy: Use most recent version (simple approach)
      // You could implement more sophisticated merging here
      const localVersion = localStorage.getItem('zhong_projects_version') || '0';
      const remoteVersion = remoteProjects._version || remoteProjects._synced || '0';
      
      if (remoteVersion > localVersion) {
        // Remote is newer, use it
        localStorage.setItem('zhong_projects', JSON.stringify(remoteProjectsArray));
        localStorage.setItem('zhong_projects_version', remoteVersion);
        return remoteProjectsArray;
      } else {
        // Local is newer or same, save to remote
        const projectsToSave = {
          projects: localProjectsArray,
          _version: Date.now().toString(),
          _synced: new Date().toISOString()
        };
        await this.saveProjects(projectsToSave);
        localStorage.setItem('zhong_projects_version', projectsToSave._version);
        return localProjectsArray;
      }
    } catch (error) {
      console.error('[NakamaService] Sync failed:', error);
      // Return local on error (offline mode)
      return Array.isArray(localProjects) ? localProjects : (localProjects.projects || localProjects);
    }
  }

  /**
   * Save session analytics for a project (prompts, token counts). Only used when email-authenticated.
   * @param {string} projectCode - e.g. '26Q1W01'
   * @param {Object} payload - { totalTokens, totalPrompts, sessionCount, sessions: [...], lastUpdated }
   */
  async saveSessionAnalytics(projectCode, payload) {
    if (this.offlineMode || !this.isAuthenticated() || !projectCode || !payload) return false;
    try {
      const value = JSON.stringify({
        projectCode,
        totalTokens: payload.totalTokens ?? 0,
        totalPrompts: payload.totalPrompts ?? 0,
        sessionCount: payload.sessionCount ?? 0,
        sessions: payload.sessions ?? [],
        lastUpdated: payload.lastUpdated ?? new Date().toISOString()
      });
      await this.client.writeStorageObjects(this.session, [{
        collection: COLLECTION_SESSION_ANALYTICS,
        key: projectCode,
        value,
        userId: this.session.user_id,
        permissionRead: 1,
        permissionWrite: 1
      }]);
      return true;
    } catch (error) {
      console.error('[NakamaService] Failed to save session analytics:', error);
      return false;
    }
  }

  /**
   * Load session analytics for a project (for showing token/prompt counts on dots).
   * @param {string} projectCode - e.g. '26Q1W01'
   * @returns {Object|null} { totalTokens, totalPrompts, sessionCount, sessions, lastUpdated } or null
   */
  async loadSessionAnalytics(projectCode) {
    if (this.offlineMode || !this.isAuthenticated() || !projectCode) return null;
    try {
      const result = await this.client.readStorageObjects(this.session, {
        objectIds: [{
          collection: COLLECTION_SESSION_ANALYTICS,
          key: projectCode,
          userId: this.session.user_id
        }]
      });
      if (result?.objects?.length > 0) {
        return JSON.parse(result.objects[0].value);
      }
      return null;
    } catch (error) {
      console.error('[NakamaService] Failed to load session analytics:', error);
      return null;
    }
  }

  /**
   * Logout
   */
  logout() {
    this.session = null;
    localStorage.removeItem('zhong_session');
    console.log('[NakamaService] Logged out');
  }
}

// Export singleton instance
export const nakamaService = new NakamaService();
