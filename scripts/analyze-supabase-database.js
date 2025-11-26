#!/usr/bin/env node

// Script to analyze Supabase database tables and compare with code
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your_supabase_project_url_here')) {
  console.error('❌ Supabase credentials not configured properly in .env.local');
  console.error('Please check REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('✅ Supabase configuration found');
console.log(`URL: ${supabaseUrl.substring(0, 30)}...`);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' }
});

// Tables from schema.sql analysis
const tablesInSchema = [
  'profiles',
  'projects', 
  'wire_drops',
  'issues',
  'project_todos',
  'issue_photos',
  'issue_contacts',
  'stakeholder_roles',
  'stakeholder_defaults',
  'project_internal_stakeholders',
  'project_external_stakeholders',
  'contacts',
  'time_logs',
  'project_stakeholders',
  'roles',
  'wire_types'
];

// Tables found being used in code
const tablesUsedInCode = [
  'profiles',
  'projects',
  'wire_drops',
  'issues',
  'project_todos',
  'issue_photos',
  'contacts',
  'project_stakeholders',
  'stakeholder_roles',
  'equipment',
  'equipment_categories',
  'equipment_credentials',
  'equipment_types',
  'project_secure_data',
  'secure_data_audit_log',
  'lucid_pages',
  'lucid_chart_cache',
  'wire_drop_stages',
  'wire_drop_room_end',
  'wire_drop_head_end',
  'role_types',
  'project_stakeholders_detailed',
  'issue_comments',
  'issue_stakeholder_tags',
  'issue_stakeholder_tags_detailed',
  'stakeholder_slots',
  'project_assignments',
  'issue_assignments',
  'issues_with_stats',
  'project_phases',
  'project_statuses',
  'project_phase_milestones',
  'project_issues_with_stakeholders'
];

async function getAllTables() {
  console.log('\n📊 Fetching all database tables...\n');
  
  // Since we don't have a custom RPC function, check each table individually
  const results = [];
  const allPossibleTables = [...new Set([...tablesInSchema, ...tablesUsedInCode])];
  
  for (const tableName of allPossibleTables) {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        results.push({
          table_name: tableName,
          row_count: count || 0,
          in_schema: tablesInSchema.includes(tableName),
          in_database: true,
          used_in_code: tablesUsedInCode.includes(tableName)
        });
        console.log(`✓ ${tableName}: ${count || 0} rows`);
      } else {
        // Table doesn't exist
        results.push({
          table_name: tableName,
          row_count: 'N/A',
          in_schema: tablesInSchema.includes(tableName),
          in_database: false,
          used_in_code: tablesUsedInCode.includes(tableName)
        });
        console.log(`✗ ${tableName}: Not found in database`);
      }
    } catch (e) {
      console.log(`✗ ${tableName}: Error accessing`);
    }
  }
  
  return results;
}

async function checkTablePolicies(tableName) {
  try {
    // Try to perform basic operations to check policies
    const checks = {
      select: false,
      insert: false,
      update: false,
      delete: false
    };
    
    // Check SELECT
    const { error: selectError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    checks.select = !selectError;
    
    // We can't really test insert/update/delete without affecting data
    // So we'll just mark them as "needs verification"
    
    return checks;
  } catch (e) {
    return null;
  }
}

async function analyzeDatabase() {
  console.log('🔍 Starting Supabase Database Analysis\n');
  console.log('='.repeat(80));
  
  const tables = await getAllTables();
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 COMPARISON REPORT\n');
  console.log('TABLE NAME                     | IN SCHEMA | IN DATABASE | ROW COUNT | USED IN CODE');
  console.log('-'.repeat(85));
  
  const safeToDelete = [];
  const missingFromSchema = [];
  const usedButEmpty = [];
  const unusedWithData = [];
  const notInDatabase = [];
  
  for (const table of tables) {
    const inSchema = table.in_schema ? 'YES' : 'NO ';
    const inDatabase = table.in_database ? 'YES' : 'NO ';
    const rowCount = table.row_count !== 'N/A' ? String(table.row_count).padEnd(9) : 'N/A      ';
    const usedInCode = table.used_in_code ? 'YES' : 'NO ';
    
    console.log(
      `${table.table_name.padEnd(30)} | ${inSchema.padEnd(9)} | ${inDatabase.padEnd(11)} | ${rowCount} | ${usedInCode}`
    );
    
    // Categorize tables
    if (table.in_database) {
      if (table.row_count === 0 && !table.used_in_code) {
        safeToDelete.push(table.table_name);
      } else if (!table.in_schema && table.used_in_code) {
        missingFromSchema.push(table.table_name);
      } else if (table.used_in_code && table.row_count === 0) {
        usedButEmpty.push(table.table_name);
      } else if (!table.used_in_code && table.row_count > 0) {
        unusedWithData.push(table.table_name);
      }
    } else {
      if (table.used_in_code) {
        notInDatabase.push(table.table_name);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 ANALYSIS RESULTS\n');
  
  console.log('🟢 SAFE TO CLEAN UP (tables with 0 rows AND not used in code):');
  if (safeToDelete.length > 0) {
    safeToDelete.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('  None found');
  }
  
  console.log('\n🟡 NEEDS ATTENTION - MISSING FROM SCHEMA (tables with data that ARE used in code):');
  if (missingFromSchema.length > 0) {
    missingFromSchema.forEach(t => console.log(`  - ${t} [CRITICAL - needs to be documented!]`));
  } else {
    console.log('  None found');
  }
  
  console.log('\n🟡 USED BUT EMPTY (tables used in code but have no data yet):');
  if (usedButEmpty.length > 0) {
    usedButEmpty.forEach(t => console.log(`  - ${t} [OK to keep]`));
  } else {
    console.log('  None found');
  }
  
  console.log('\n🔴 UNUSED WITH DATA (tables not in code but have data):');
  if (unusedWithData.length > 0) {
    unusedWithData.forEach(t => console.log(`  - ${t} [INVESTIGATE before deleting!]`));
  } else {
    console.log('  None found');
  }
  
  console.log('\n⚠️ TABLES USED IN CODE BUT NOT IN DATABASE:');
  if (notInDatabase.length > 0) {
    // Filter out views (they often have special suffixes)
    const likelyViews = notInDatabase.filter(t => 
      t.includes('_detailed') || t.includes('_with_') || t.includes('_stats')
    );
    const likelyTables = notInDatabase.filter(t => 
      !t.includes('_detailed') && !t.includes('_with_') && !t.includes('_stats')
    );
    
    if (likelyTables.length > 0) {
      console.log('  Tables (need to be created):');
      likelyTables.forEach(t => console.log(`    - ${t}`));
    }
    if (likelyViews.length > 0) {
      console.log('  Views (might be OK if they\'re database views):');
      likelyViews.forEach(t => console.log(`    - ${t}`));
    }
  } else {
    console.log('  None found');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 RECOMMENDED ACTIONS (in order of safety and importance):\n');
  
  console.log('1. IMMEDIATE - Document missing tables:');
  console.log('   Check these SQL files for the missing table definitions:');
  console.log('   - supabase/project_enhancements_equipment_secure.sql (for equipment tables)');
  console.log('   - supabase/lucid_chart_cache.sql (for lucid_chart_cache)');
  console.log('   - supabase/wire_drops_enhancements.sql (for wire_drop_stages)');
  console.log('   - supabase/floor_plan_viewer_migration.sql (for lucid_pages)');
  
  console.log('\n2. SAFE - Remove backup files from code:');
  console.log('   rm src/**/*.backup');
  console.log('   rm src/**/*.debug.js');
  
  if (safeToDelete.length > 0) {
    console.log('\n3. CONSIDER - Drop unused empty tables:');
    safeToDelete.forEach(t => console.log(`   DROP TABLE IF EXISTS public.${t};`));
  }
  
  if (unusedWithData.length > 0) {
    console.log('\n4. INVESTIGATE - Tables with data but not used:');
    unusedWithData.forEach(t => console.log(`   - Check if ${t} is still needed`));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Analysis complete!\n');
}

// Run the analysis
analyzeDatabase().catch(console.error);
