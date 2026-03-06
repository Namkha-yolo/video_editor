/**
 * Manual API Testing Script
 * Tests Week 3 API endpoints with real authentication and data
 * 
 * Prerequisites:
 * 1. Server running on http://localhost:3001
 * 2. .env file configured with Supabase credentials
 * 3. Database tables and storage buckets set up
 * 
 * Usage:
 *   npx tsx test-api-manual.ts
 */

import { supabase } from "./src/config/supabase.js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

const API_BASE = "http://localhost:3001/api";
const TEST_USER_EMAIL = "test-user@example.com";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

/**
 * Get or create a test user with Supabase Admin API
 */
async function getOrCreateTestUser() {
  log("👤", "Setting up test user...");

  // Check if user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let testUser = existingUsers?.users.find((u) => u.email === TEST_USER_EMAIL);

  if (!testUser) {
    // Create test user
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: "test-password-123",
      email_confirm: true,
    });

    if (error) {
      logError(`Failed to create test user: ${error.message}`);
      throw error;
    }

    testUser = data.user;
    logSuccess(`Created test user: ${TEST_USER_EMAIL}`);
  } else {
    logSuccess(`Using existing test user: ${TEST_USER_EMAIL}`);
  }

  return testUser;
}

/**
 * Get an auth token for the test user
 */
async function getAuthToken(userId: string): Promise<string> {
  log("🔑", "Generating auth token...");

  // Generate a JWT token for the test user
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_USER_EMAIL,
  });

  if (error) {
    logError(`Failed to generate auth link: ${error.message}`);
    throw error;
  }

  // Sign in with the test user to get a session token
  const { data: sessionData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: "test-password-123",
    });

  if (signInError) {
    logError(`Failed to sign in: ${signInError.message}`);
    throw signInError;
  }

  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("No access token returned");
  }

  logSuccess(`Got auth token: ${token.substring(0, 20)}...`);
  return token;
}

/**
 * Create test clips in the database
 */
async function createTestClips(userId: string): Promise<string[]> {
  log("🎬", "Creating test clips...");

  const clipIds: string[] = [];

  // Create 2 test clips
  for (let i = 1; i <= 2; i++) {
    const clipId = randomUUID();
    const { error } = await supabase.from("clips").insert({
      id: clipId,
      user_id: userId,
      file_name: `test-clip-${i}.mp4`,
      storage_path: `${userId}/test-clip-${i}.mp4`,
      file_size: 1024000,
      duration: 10.5,
      width: 1920,
      height: 1080,
      fps: 30.0,
    });

    if (error) {
      logError(`Failed to create clip ${i}: ${error.message}`);
      throw error;
    }

    clipIds.push(clipId);
    logSuccess(`Created test clip ${i}: ${clipId}`);
  }

  return clipIds;
}

/**
 * Test creating a job
 */
async function testCreateJob(
  token: string,
  clipIds: string[]
): Promise<string> {
  log("📋", "Testing POST /api/jobs...");

  const response = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mood: "cinematic",
      clip_ids: clipIds,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    logError(`Failed to create job: ${JSON.stringify(data, null, 2)}`);
    throw new Error(`HTTP ${response.status}`);
  }

  logSuccess(`Job created successfully!`);
  console.log(JSON.stringify(data, null, 2));

  return data.job_id;
}

/**
 * Test getting job status
 */
async function testGetJobStatus(token: string, jobId: string) {
  log("🔍", `Testing GET /api/jobs/${jobId}...`);

  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    logError(`Failed to get job: ${JSON.stringify(data, null, 2)}`);
    throw new Error(`HTTP ${response.status}`);
  }

  logSuccess(`Job details retrieved!`);
  console.log(JSON.stringify(data, null, 2));

  return data;
}

/**
 * Test listing all jobs
 */
async function testListJobs(token: string) {
  log("📜", "Testing GET /api/jobs...");

  const response = await fetch(`${API_BASE}/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    logError(`Failed to list jobs: ${JSON.stringify(data, null, 2)}`);
    throw new Error(`HTTP ${response.status}`);
  }

  logSuccess(`Found ${data.jobs?.length || 0} jobs`);
  console.log(JSON.stringify(data, null, 2));

  return data;
}

/**
 * Test getting download URLs (for completed jobs)
 */
async function testGetDownloadUrls(token: string, jobId: string) {
  log("⬇️", `Testing GET /api/jobs/${jobId}/download...`);

  const response = await fetch(`${API_BASE}/jobs/${jobId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    logError(`Failed to get download URLs: ${JSON.stringify(data, null, 2)}`);
    // Don't throw - might be because job isn't complete yet
    return null;
  }

  logSuccess(`Download URLs retrieved!`);
  console.log(JSON.stringify(data, null, 2));

  return data;
}

/**
 * Test deleting a job
 */
async function testDeleteJob(token: string, jobId: string) {
  log("🗑️", `Testing DELETE /api/jobs/${jobId}...`);

  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    logError(`Failed to delete job: ${JSON.stringify(data, null, 2)}`);
    throw new Error(`HTTP ${response.status}`);
  }

  logSuccess(`Job deleted successfully!`);
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Cleanup test data
 */
async function cleanup(userId: string, jobId?: string) {
  log("🧹", "Cleaning up test data...");

  try {
    // Delete test job if exists
    if (jobId) {
      await supabase.from("jobs").delete().eq("id", jobId);
      logSuccess(`Deleted test job`);
    }

    // Delete test clips
    await supabase.from("clips").delete().eq("user_id", userId);
    logSuccess(`Deleted test clips`);

    // Optionally delete test user (commented out to avoid breaking other tests)
    // await supabase.auth.admin.deleteUser(userId);
    // logSuccess(`Deleted test user`);
  } catch (error: any) {
    logError(`Cleanup warning: ${error.message}`);
  }
}

/**
 * Main test flow
 */
async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 Week 3 API Manual Testing");
  console.log("=".repeat(60) + "\n");

  let testUser: any;
  let authToken: string;
  let clipIds: string[];
  let jobId: string;

  try {
    // Step 1: Setup test user
    testUser = await getOrCreateTestUser();
    console.log();

    // Step 2: Get auth token
    authToken = await getAuthToken(testUser.id);
    console.log();

    // Step 3: Create test clips
    clipIds = await createTestClips(testUser.id);
    console.log();

    // Step 4: Create a job
    jobId = await testCreateJob(authToken, clipIds);
    console.log();

    // Wait a moment for job to be processed
    logInfo("Waiting 2 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log();

    // Step 5: Get job status
    await testGetJobStatus(authToken, jobId);
    console.log();

    // Step 6: List all jobs
    await testListJobs(authToken);
    console.log();

    // Step 7: Try to get download URLs (might fail if job not complete)
    await testGetDownloadUrls(authToken, jobId);
    console.log();

    // Step 8: Delete the job
    await testDeleteJob(authToken, jobId);
    console.log();

    // Success!
    console.log("\n" + "=".repeat(60));
    log("🎉", "All API tests completed successfully!");
    console.log("=".repeat(60) + "\n");

    logInfo(
      "Note: The job processing might fail because AI Pipeline isn't running."
    );
    logInfo("That's expected - the API endpoints are working correctly!");
    console.log();
  } catch (error: any) {
    console.log("\n" + "=".repeat(60));
    logError(`Test failed: ${error.message}`);
    console.log("=".repeat(60) + "\n");

    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Cleanup
    if (testUser && jobId) {
      await cleanup(testUser.id, jobId);
    }
  }
}

// Check if server is running first
async function checkServer() {
  try {
    logInfo("Checking if server is running on http://localhost:3001...");
    const response = await fetch("http://localhost:3001/");
    if (response.ok) {
      logSuccess("Server is running!");
      return true;
    }
  } catch (error) {
    logError("Server is not running!");
    logInfo("Please start the server first with: pnpm dev");
    return false;
  }
  return false;
}

// Run the tests
(async () => {
  const serverRunning = await checkServer();
  console.log();

  if (serverRunning) {
    await runTests();
  } else {
    process.exit(1);
  }
})();
