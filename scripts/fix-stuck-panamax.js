#!/usr/bin/env node
/**
 * Fix Stuck Panamax MB1500 Part
 *
 * Run this script to:
 * 1. Find the Panamax MB1500 part
 * 2. Check its Manus task status
 * 3. Reset it to allow re-running AI lookup
 *
 * Usage: node scripts/fix-stuck-panamax.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixStuckPart() {
  console.log('🔍 Looking for Panamax MB1500...\n');

  // Find Panamax MB1500 part
  const { data: parts, error: partError } = await supabase
    .from('global_parts')
    .select('id, part_number, manufacturer, name, ai_enrichment_status, ai_enrichment_notes')
    .or('part_number.ilike.%MB1500%,part_number.ilike.%1500%')
    .ilike('manufacturer', '%Panamax%');

  if (partError) {
    console.error('Error finding part:', partError);
    return;
  }

  if (!parts || parts.length === 0) {
    console.log('No Panamax MB1500 found. Searching more broadly...');

    // Try broader search
    const { data: allPanamax } = await supabase
      .from('global_parts')
      .select('id, part_number, manufacturer, name, ai_enrichment_status')
      .ilike('manufacturer', '%Panamax%')
      .limit(10);

    console.log('\nAll Panamax parts found:');
    allPanamax?.forEach(p => {
      console.log(`  - ${p.part_number}: ${p.name} (status: ${p.ai_enrichment_status})`);
    });

    if (!allPanamax || allPanamax.length === 0) {
      console.log('No Panamax parts found at all.');
      return;
    }

    // Use the first Panamax part that's stuck in processing
    const stuckPart = allPanamax.find(p => p.ai_enrichment_status === 'processing');
    if (!stuckPart) {
      console.log('\nNo stuck parts found in processing status.');
      return;
    }
    parts.push(stuckPart);
  }

  for (const part of parts) {
    console.log(`\n📦 Found: ${part.manufacturer} ${part.part_number}`);
    console.log(`   Name: ${part.name}`);
    console.log(`   Status: ${part.ai_enrichment_status}`);
    console.log(`   Notes: ${part.ai_enrichment_notes || 'none'}`);
    console.log(`   Part ID: ${part.id}`);

    // Check for associated Manus tasks
    const { data: tasks, error: taskError } = await supabase
      .from('manus_tasks')
      .select('*')
      .eq('part_id', part.id)
      .order('created_at', { ascending: false });

    if (taskError) {
      console.log('   ⚠️ Error checking tasks:', taskError.message);
    } else if (tasks && tasks.length > 0) {
      console.log(`\n   📋 Found ${tasks.length} Manus task(s):`);
      for (const task of tasks) {
        console.log(`      - Task ID: ${task.manus_task_id}`);
        console.log(`        Status: ${task.status}`);
        console.log(`        Created: ${task.created_at}`);
        console.log(`        Completed: ${task.completed_at || 'not completed'}`);
        if (task.error) console.log(`        Error: ${task.error}`);
      }
    } else {
      console.log('   ℹ️ No Manus tasks found for this part');
    }

    // Reset the part if it's stuck in processing
    if (part.ai_enrichment_status === 'processing') {
      console.log('\n   🔧 Resetting stuck part...');

      const { error: updateError } = await supabase
        .from('global_parts')
        .update({
          ai_enrichment_status: null,
          ai_enrichment_notes: 'Reset from stuck processing state'
        })
        .eq('id', part.id);

      if (updateError) {
        console.log('   ❌ Error resetting part:', updateError.message);
      } else {
        console.log('   ✅ Part reset successfully! You can now run AI lookup again.');
      }

      // Also mark any pending/running tasks as failed
      if (tasks && tasks.length > 0) {
        const stuckTasks = tasks.filter(t => ['pending', 'running', 'processing'].includes(t.status));
        for (const task of stuckTasks) {
          const { error: taskUpdateError } = await supabase
            .from('manus_tasks')
            .update({
              status: 'failed',
              error: 'Manually reset from stuck state'
            })
            .eq('manus_task_id', task.manus_task_id);

          if (!taskUpdateError) {
            console.log(`   ✅ Task ${task.manus_task_id} marked as failed`);
          }
        }
      }
    }
  }

  console.log('\n✨ Done!');
}

fixStuckPart().catch(console.error);
