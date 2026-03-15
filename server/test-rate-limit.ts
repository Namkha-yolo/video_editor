import { randomUUID } from "crypto";

import { supabase } from "./src/config/supabase.js";

const API_BASE = "http://localhost:3001/api";
const TEST_USER_EMAIL = "test-user@example.com";
const TEST_USER_PASSWORD = "test-password-123";

async function getAccessToken() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users.find((entry) => entry.email === TEST_USER_EMAIL);
  if (!user) {
    throw new Error(`Test user ${TEST_USER_EMAIL} was not found`);
  }

  const { data: sessionData, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (error || !sessionData.session?.access_token) {
    throw new Error(error?.message || "Could not create test session");
  }

  return {
    userId: user.id,
    token: sessionData.session.access_token,
  };
}

async function createClipIds(userId: string, requestIndex: number) {
  const clipIds = [randomUUID(), randomUUID()];
  const clipRows = clipIds.map((clipId, clipIndex) => ({
    id: clipId,
    user_id: userId,
    file_name: `rate-limit-${requestIndex}-${clipIndex + 1}.mp4`,
    storage_path: `${userId}/rate-limit-${requestIndex}-${clipIndex + 1}.mp4`,
    file_size: 1024,
    duration: 1,
    width: 1920,
    height: 1080,
    fps: 30,
  }));

  const { error } = await supabase.from("clips").insert(clipRows);
  if (error) {
    throw new Error(`Failed to create rate limit test clips: ${error.message}`);
  }

  return clipIds;
}

async function run() {
  const { userId, token } = await getAccessToken();

  console.log("\nRate limit verification");

  for (let index = 1; index <= 6; index += 1) {
    const clipIds = await createClipIds(userId, index);
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

    const body = await response.json().catch(() => ({}));
    console.log(
      `Request ${index}: status=${response.status}, remaining=${response.headers.get("x-ratelimit-remaining")}, retry_after=${response.headers.get("retry-after")}`
    );
    console.log(JSON.stringify(body));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});