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

// Collection name for storing project data
const COLLECTION = 'zhong_projects';

class NakamaService {
  constructor() {
    this.client = null;
    this.session = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Nakama client (lazy load the SDK)
   */
  async init() {
    if (this.isInitialized) return;

    if (!NAKAMA_CONFIG.host || !NAKAMA_CONFIG.serverKey) {
      const msg = '[NakamaService] Missing configuration. Copy .env.example to .env and set VITE_NAKAMA_HOST and VITE_NAKAMA_SERVER_KEY.';
      console.error(msg);
      throw new Error(msg);
    }

    try {
      // Dynamically import Nakama JS SDK
      const { Client } = await import('@heroiclabs/nakama-js');

      this.client = new Client(
        NAKAMA_CONFIG.serverKey,
        NAKAMA_CONFIG.host,
        NAKAMA_CONFIG.port,
        NAKAMA_CONFIG.scheme === 'https'
      );
      
      this.isInitialized = true;
      console.log('[NakamaService] Initialized');
    } catch (error) {
      console.error('[NakamaService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Authenticate with device ID (anonymous/device session)
   */
  async authenticateDevice(deviceId = null) {
    if (!this.isInitialized) await this.init();
    
    if (!deviceId) {
      // Generate or retrieve device ID from localStorage
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
    if (!this.isInitialized) await this.init();

    try {
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
      console.error('[NakamaService] ❌ Email authentication failed:', error);
      // Provide more helpful error message
      if (error.message) {
        throw new Error(error.message);
      }
      throw new Error('Email authentication failed. Please check your credentials.');
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
