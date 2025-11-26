
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dpteljnierdubqsqxfye.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdGVsam5pZXJkdWJxc3F4ZnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTM1ODgsImV4cCI6MjA3MTA4OTU4OH0.7DdNq1JsiH9y5_T3wii2cxJscd5DNoUgC95f11NI6yI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fetchData() {
    try {
        // 1. Find the project
        const { data: projects, error: projectError } = await supabase
            .from('projects')
            .select('id, name')
            .ilike('name', '%106%Tuna%');

        if (projectError) throw projectError;
        if (!projects || projects.length === 0) {
            console.error('Project "106 Tuna" not found.');
            return;
        }

        const project = projects[0];
        console.log(`Found project: ${project.name} (${project.id})`);

        // 2. Fetch wire drops
        const { data: wireDrops, error: dropsError } = await supabase
            .from('wire_drops')
            .select('uid, room_name, drop_name, wire_type, drop_type, notes')
            .eq('project_id', project.id)
            .limit(50); // Limit to 50 for testing

        if (dropsError) throw dropsError;

        console.log(JSON.stringify(wireDrops, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

fetchData();
