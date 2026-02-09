/**
 * Project ID Generator
 * 
 * Generates unique project IDs in format: YYQ[P][N]
 * - YY: Two-digit year (e.g., 26 for 2026)
 * - Q: Quarter (1-4)
 * - P: Platform code (U=Unity, W=Web, D=Database, A=API, Z=Zhong)
 * - N: Project number (2 digits, zero-padded)
 * 
 * Examples:
 * - 26Q1U12 = 2026 Q1, Unity project #12
 * - 26Q1W05 = 2026 Q1, Web project #5
 * - 26Q1D03 = 2026 Q1, Database project #3
 * - 26Q1A07 = 2026 Q1, API project #7
 */

/**
 * Platform codes mapping
 */
const PLATFORM_CODES = {
  'WEB': 'W',           // Web projects
  'DATABASE': 'D',      // Database projects
  'API': 'A',           // API projects
  'ZHONG': 'Z',         // Zhong center
  'UNITY': 'U'         // Unity/AVP projects
};

/**
 * Generate unique project ID
 * 
 * @param {Object} options - Project options
 * @param {Date} [options.date] - Date for year/quarter (default: now)
 * @param {string} options.type - Project type (YANG, YIN, ZHONG, UNITY, etc.)
 * @param {number} options.projectNumber - Project number (1-99)
 * @returns {string} Project ID (e.g., "26Q1U12")
 */
export function generateProjectId({ date = new Date(), type, projectNumber }) {
  const year = date.getFullYear().toString().slice(-2);
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  
  // Get platform code
  const platformCode = PLATFORM_CODES[type?.toUpperCase()] || 'X'; // X for unknown
  
  // Ensure project number is 2 digits
  const paddedNumber = String(projectNumber).padStart(2, '0');
  
  return `${year}Q${quarter}${platformCode}${paddedNumber}`;
}

/**
 * Parse project ID
 * 
 * @param {string} projectId - Project ID (e.g., "26Q1U12")
 * @returns {Object|null} Parsed components or null if invalid
 */
export function parseProjectId(projectId) {
  const regex = /^(\d{2})Q(\d)([A-Z])(\d{2})$/;
  const match = projectId.match(regex);
  
  if (!match) return null;
  
  const year = parseInt('20' + match[1]); // Convert 26 to 2026
  const quarter = parseInt(match[2]);
  const platformCode = match[3];
  const projectNumber = parseInt(match[4]);
  
  // Reverse lookup platform code - prefer primary names
  const codeToPrimaryName = {
    'W': 'WEB',
    'D': 'DATABASE',
    'A': 'API',
    'U': 'UNITY',
    'Z': 'ZHONG'
  };
  const platformType = codeToPrimaryName[platformCode] || 
    Object.entries(PLATFORM_CODES).find(([_, code]) => code === platformCode)?.[0] || 
    'UNKNOWN';
  
  return {
    year,
    quarter,
    platformCode,
    platformType,
    projectNumber,
    fullYear: year,
    quarterLabel: `Q${quarter}`
  };
}

/**
 * Get platform code from project type
 */
export function getPlatformCode(type) {
  return PLATFORM_CODES[type?.toUpperCase()] || 'X';
}

/**
 * Get platform name from code
 * Returns the primary name (WEB, DATABASE, API, etc.) not legacy names
 */
export function getPlatformName(code) {
  // Map codes to primary names
  const codeToName = {
    'W': 'WEB',
    'D': 'DATABASE',
    'A': 'API',
    'U': 'UNITY',
    'Z': 'ZHONG'
  };
  return codeToName[code] || 'UNKNOWN';
}
