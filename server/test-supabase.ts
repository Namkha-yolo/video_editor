/**
 * Quick Supabase connectivity test
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSupabase() {
  console.log("🔌 Testing Supabase Connection...\n");
  
  console.log("Configuration:");
  console.log(`  URL: ${supabaseUrl}`);
  console.log(`  Key: ${supabaseServiceKey.substring(0, 20)}...`);
  console.log();

  // Test 1: Check tables exist
  console.log("1. Checking if 'jobs' table exists...");
  const { data: jobsTest, error: jobsError } = await supabase
    .from("jobs")
    .select("count");
  
  if (jobsError) {
    console.log(`   ❌ Error: ${jobsError.message}`);
  } else {
    console.log(`   ✅ Jobs table accessible`);
  }

  // Test 2: Check clips table
  console.log("\n2. Checking if 'clips' table exists...");
  const { data: clipsTest, error: clipsError } = await supabase
    .from("clips")
    .select("count");
  
  if (clipsError) {
    console.log(`   ❌ Error: ${clipsError.message}`);
  } else {
    console.log(`   ✅ Clips table accessible`);
  }

  // Test 3: Check storage buckets
  console.log("\n3. Checking storage buckets...");
  const { data: buckets, error: bucketsError } = await supabase
    .storage
    .listBuckets();
  
  if (bucketsError) {
    console.log(`   ❌ Error: ${bucketsError.message}`);
  } else {
    console.log(`   ✅ Storage accessible`);
    console.log(`   Buckets: ${buckets?.map(b => b.name).join(", ") || "none"}`);
  }

  console.log("\n" + "=".repeat(60));
  
  if (jobsError || clipsError || bucketsError) {
    console.log("⚠️  SETUP REQUIRED:");
    console.log("   Member 4 (Jianhua) needs to create:");
    console.log("   - Database tables: jobs, clips");
    console.log("   - Storage buckets: clips, outputs");
    console.log("\n   See README.md 'Member 4 — Supabase project setup'");
  } else {
    console.log("✅ Supabase is ready for Week 3 implementation!");
  }
}

testSupabase().catch(console.error);
