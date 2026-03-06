/**
 * Create a test job that stays in the database
 * So you can inspect it in Supabase Dashboard
 */

import { supabase } from "./src/config/supabase.js";
import { randomUUID } from "crypto";

const API_BASE = "http://localhost:3001/api";
const TEST_USER_EMAIL = "test-user@example.com";

async function createPersistentTestJob() {
  console.log("🎬 Creating a job that will stay in Supabase...\n");

  // Get test user
  const { data: users } = await supabase.auth.admin.listUsers();
  const testUser = users?.users.find((u) => u.email === TEST_USER_EMAIL);

  if (!testUser) {
    console.log("❌ Test user doesn't exist. Run test-api-manual.ts first!");
    return;
  }

  console.log(`✅ Using test user: ${testUser.email}`);
  console.log(`   User ID: ${testUser.id}\n`);

  // Sign in to get token
  const { data: sessionData } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: "test-password-123",
  });

  const token = sessionData.session?.access_token!;

  // Create test clips
  const clip1Id = randomUUID();
  const clip2Id = randomUUID();

  await supabase.from("clips").insert([
    {
      id: clip1Id,
      user_id: testUser.id,
      file_name: "demo-clip-1.mp4",
      storage_path: `${testUser.id}/demo-clip-1.mp4`,
      file_size: 1024000,
      duration: 10.5,
      width: 1920,
      height: 1080,
      fps: 30.0,
    },
    {
      id: clip2Id,
      user_id: testUser.id,
      file_name: "demo-clip-2.mp4",
      storage_path: `${testUser.id}/demo-clip-2.mp4`,
      file_size: 2048000,
      duration: 15.2,
      width: 1920,
      height: 1080,
      fps: 30.0,
    },
  ]);

  console.log(`✅ Created clip 1: ${clip1Id}`);
  console.log(`✅ Created clip 2: ${clip2Id}\n`);

  // Create job
  const response = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mood: "cinematic",
      clip_ids: [clip1Id, clip2Id],
    }),
  });

  if (!response.ok) {
    console.log(`❌ Failed to create job: ${response.status} ${response.statusText}`);
    const errorData = await response.json().catch(() => ({}));
    console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
    return;
  }

  const data = await response.json();
  const jobId = data.jobId;
  
  if (!jobId) {
    console.log(`❌ No jobId in response:`, data);
    return;
  }
  
  console.log(`✅ Job created: ${jobId}\n`);

  // Wait for processing
  console.log("⏳ Waiting 3 seconds for processing...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check final status
  const statusResponse = await fetch(`${API_BASE}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!statusResponse.ok) {
    console.log(`❌ Failed to get job status: ${statusResponse.status}`);
    return;
  }
  
  const jobData = await statusResponse.json();

  console.log("📊 Final Job Status:");
  console.log(`   Status: ${jobData.status}`);
  console.log(`   Mood: ${jobData.mood}`);
  console.log(`   Clips: ${jobData.clip_ids?.length || 0}`);
  if (jobData.error_message) {
    console.log(`   Error: ${jobData.error_message}`);
  }
  console.log();

  console.log("=" .repeat(60));
  console.log("✨ Now go to Supabase Dashboard:");
  console.log("   1. Click 'Table Editor' → 'jobs' table");
  console.log("   2. Click the refresh icon");
  console.log(`   3. Look for job ID: ${jobId}`);
  console.log();
  console.log("   You should see:");
  console.log(`   - status: "${jobData.status}"`);
  console.log(`   - mood: "cinematic"`);
  console.log(`   - clip_ids: array with 2 UUIDs`);
  console.log(`   - error_message: (why it failed)`);
  console.log("=" .repeat(60));
  console.log();

  console.log("🧹 To clean up later, run:");
  console.log(`   DELETE FROM jobs WHERE id = '${jobId}';`);
  console.log(`   DELETE FROM clips WHERE id IN ('${clip1Id}', '${clip2Id}');`);
}

// Run
(async () => {
  try {
    const response = await fetch("http://localhost:3001/");
    if (!response.ok) throw new Error();
  } catch {
    console.log("❌ Server not running! Start with: pnpm dev\n");
    process.exit(1);
  }

  await createPersistentTestJob();
})();
