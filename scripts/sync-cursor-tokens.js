#!/usr/bin/env node

/**
 * CLI script to sync Cursor token usage from SQLite database
 * 
 * Usage:
 *   node scripts/sync-cursor-tokens.js
 *   node scripts/sync-cursor-tokens.js --since 2025-01-01
 *   node scripts/sync-cursor-tokens.js --estimate-tokens
 * 
 * Note: Requires sqlite3 package: npm install sqlite3
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');

// Import the tracker (may need to adjust path based on module system)
let tracker;
try {
  // Try ES module import
  tracker = await import('../src/utils/cursor-token-tracker.js');
} catch (e) {
  // Fallback to CommonJS
  tracker = require('../src/utils/cursor-token-tracker.js');
}

const { syncFromCursorDatabase, getTokenHistory, exportHistory } = tracker;

async function main() {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf('--since');
  const estimateTokens = args.includes('--estimate-tokens');
  
  let sinceDate = null;
  if (sinceIndex !== -1 && args[sinceIndex + 1]) {
    sinceDate = new Date(args[sinceIndex + 1]);
    if (isNaN(sinceDate.getTime())) {
      console.error('Invalid date format. Use YYYY-MM-DD');
      process.exit(1);
    }
  }
  
  console.log('🔄 Syncing Cursor token usage from database...');
  console.log(`   Estimate tokens: ${estimateTokens ? 'Yes' : 'No'}`);
  if (sinceDate) {
    console.log(`   Since: ${sinceDate.toISOString().split('T')[0]}`);
  }
  console.log('');
  
  const result = await syncFromCursorDatabase({
    since: sinceDate,
    estimateTokens: estimateTokens
  });
  
  if (result.success) {
    console.log('✅ Sync completed!');
    console.log(`   Imported: ${result.imported} entries`);
    console.log(`   Skipped: ${result.skipped} entries (already tracked)`);
    console.log(`   Total in database: ${result.totalInDatabase} entries`);
    if (result.dateRange) {
      console.log(`   Date range: ${result.dateRange.start.split('T')[0]} to ${result.dateRange.end.split('T')[0]}`);
    }
    console.log('');
    
    // Show summary statistics
    const history = getTokenHistory();
    console.log('📊 Current Statistics:');
    console.log(`   Total entries: ${history.statistics.totalEntries}`);
    console.log(`   Total tokens: ${history.statistics.totalTokens.toLocaleString()}`);
    console.log(`   Average per entry: ${Math.round(history.statistics.averageTokens)}`);
    console.log('');
    
    if (Object.keys(history.statistics.byProject).length > 0) {
      console.log('📁 By Project:');
      Object.entries(history.statistics.byProject)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([project, tokens]) => {
          console.log(`   ${project}: ${tokens.toLocaleString()} tokens`);
        });
      console.log('');
    }
    
    // Export options
    if (args.includes('--export-json')) {
      const json = exportHistory('json');
      const fs = require('fs');
      const exportPath = path.join(__dirname, '..', 'cursor-token-export.json');
      fs.writeFileSync(exportPath, json, 'utf8');
      console.log(`💾 Exported to: ${exportPath}`);
    }
    
    if (args.includes('--export-csv')) {
      const csv = exportHistory('csv');
      const fs = require('fs');
      const exportPath = path.join(__dirname, '..', 'cursor-token-export.csv');
      fs.writeFileSync(exportPath, csv, 'utf8');
      console.log(`💾 Exported to: ${exportPath}`);
    }
  } else {
    console.error('❌ Sync failed:', result.reason);
    if (result.error) {
      console.error('   Error:', result.error);
    }
    if (result.path) {
      console.error('   Database path:', result.path);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
