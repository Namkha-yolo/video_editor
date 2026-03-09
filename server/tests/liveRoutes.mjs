import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import "../dist/server/src/config/env.js";

const apiBase = "http://127.0.0.1:3001";
const authUrl = `${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.VITE_SUPABASE_URL || !anonKey || !serviceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceKey);

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return data;
}

async function signIn() {
  return requestJson(authUrl, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });
}

async function apiRequest(path, token, init = {}) {
  return requestJson(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

async function main() {
  const auth = await signIn();
  const accessToken = auth.access_token;
  const userId = auth.user?.id;

  if (!accessToken || !userId) {
    throw new Error("Supabase auth response did not include access token and user id");
  }

  const clipIds = [randomUUID(), randomUUID()];
  let jobId = null;

  await supabase.from("clips").insert([
    {
      id: clipIds[0],
      user_id: userId,
      file_name: "integration-a.mp4",
      storage_path: `${userId}/integration-a.mp4`,
      file_size: 1024,
      duration: 1,
      width: 1920,
      height: 1080,
      fps: 30,
    },
    {
      id: clipIds[1],
      user_id: userId,
      file_name: "integration-b.mp4",
      storage_path: `${userId}/integration-b.mp4`,
      file_size: 1024,
      duration: 1,
      width: 1920,
      height: 1080,
      fps: 30,
    },
  ]);

  try {
    const clips = await apiRequest("/api/clips", accessToken);
    console.log(`clips-ok:${clips.total}`);

    const createdJob = await apiRequest("/api/jobs", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mood: "cinematic",
        clip_ids: clipIds,
      }),
    });

    jobId = createdJob.job_id || createdJob.jobId;
    console.log(`job-create-ok:${jobId}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const jobs = await apiRequest("/api/jobs", accessToken);
    console.log(`jobs-ok:${jobs.total}`);

    const job = await apiRequest(`/api/jobs/${jobId}`, accessToken);
    console.log(`job-get-ok:${job.status}`);

    await apiRequest(`/api/jobs/${jobId}`, accessToken, {
      method: "DELETE",
    });
    console.log("job-delete-ok");
  } finally {
    if (jobId) {
      await supabase.from("jobs").delete().eq("id", jobId);
    }

    await supabase.from("clips").delete().in("id", clipIds);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
