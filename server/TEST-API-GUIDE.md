# 🧪 Week 3 API Testing Guide

Two ways to test your Week 3 API implementation:

## Option 1: Automated Test Script (Easiest!)

### **Step 1: Start the server**
```bash
cd server
pnpm dev
```

Keep this terminal running. Open a new terminal for Step 2.

### **Step 2: Run the automated test**
```bash
cd server
npx tsx test-api-manual.ts
```

This script will:
- ✅ Create a test user automatically
- ✅ Generate an auth token
- ✅ Create test clips in the database
- ✅ Test all API endpoints (POST, GET, DELETE)
- ✅ Show you the actual responses
- ✅ Clean up test data automatically

**Expected Output:**
```
============================================================
🧪 Week 3 API Manual Testing
============================================================

✓ Using existing test user: test-user@example.com
✓ Got auth token: eyJhbGciOiJIUzI1Ni...

📋 Testing POST /api/jobs...
✓ Job created successfully!
{
  "job_id": "uuid-here",
  "status": "queued",
  "message": "Job created and processing started"
}

🔍 Testing GET /api/jobs/uuid-here...
✓ Job details retrieved!
...
```

---

## Option 2: Manual Testing with curl

If you want to test manually with curl commands:

### **Step 1: Get your Supabase credentials**

Check your `.env` file (in the root workspace folder):
```bash
cat ../.env
```

You need:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your public anon key

### **Step 2: Create a test user in Supabase Dashboard**

1. Go to: `https://supabase.com/dashboard`
2. Select your project
3. Go to **Authentication** → **Users**
4. Click **Add User**
5. Enter test email/password
6. Save the user ID (UUID)

### **Step 3: Get an auth token**

**Option A: Use Supabase Dashboard**
1. Go to **Authentication** → **Users**
2. Click on your test user
3. Copy the **Access Token** (JWT)

**Option B: Sign in via API**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'
```

This returns:
```json
{
  "access_token": "eyJhbGc...",
  ...
}
```

Copy the `access_token`.

### **Step 4: Create test clips in Supabase**

Go to **Table Editor** → **clips** table → **Insert row**:

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "user_id": "YOUR_USER_UUID",
  "file_name": "test-clip-1.mp4",
  "storage_path": "user-id/test-clip-1.mp4",
  "file_size": 1024000,
  "duration": 10.5,
  "width": 1920,
  "height": 1080,
  "fps": 30
}
```

Create 2-3 test clips with different UUIDs.

### **Step 5: Test the API endpoints**

Replace `YOUR_TOKEN` with your actual access token and `CLIP_UUID` with your clip IDs:

#### **Create a Job**
```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "mood": "cinematic",
    "clip_ids": ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]
  }'
```

**Expected Response:**
```json
{
  "job_id": "uuid-of-job",
  "status": "queued",
  "message": "Job created and processing started"
}
```

Save the `job_id` for next steps!

#### **List Your Jobs**
```bash
curl http://localhost:3001/api/jobs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "jobs": [
    {
      "id": "job-uuid",
      "mood": "cinematic",
      "status": "analyzing",
      "created_at": "...",
      ...
    }
  ],
  "total": 1
}
```

#### **Get Job Details**
```bash
curl http://localhost:3001/api/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Replace `JOB_ID` with the actual job UUID from step above.

**Expected Response:**
```json
{
  "id": "job-uuid",
  "mood": "cinematic",
  "status": "grading",
  "clip_ids": ["..."],
  "clips": [
    {
      "id": "...",
      "file_name": "test-clip-1.mp4",
      "duration": 10.5
    }
  ],
  "output_urls": []  // Empty until complete
}
```

#### **Get Download URLs** (only works after job completes)
```bash
curl http://localhost:3001/api/jobs/JOB_ID/download \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (if complete):**
```json
{
  "job_id": "...",
  "mood": "cinematic",
  "download_urls": [
    {
      "clip_index": 1,
      "url": "https://supabase.co/signed-url...",
      "path": "user-id/job-id/clip1.mp4"
    }
  ],
  "expires_in": "2 hours"
}
```

#### **Delete a Job**
```bash
curl -X DELETE http://localhost:3001/api/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "message": "Job deleted successfully"
}
```

---

## 🎯 What Each Test Shows

| Endpoint | What It Tests |
|----------|--------------|
| POST /api/jobs | Auth middleware<br> Request validation<br> Clip ownership check<br> Job creation<br> Async processing starts |
| GET /api/jobs |  Pagination<br> User filtering<br> Database query |
| GET /api/jobs/:id |  Job details<br> Clip relationships<br> Signed URL generation |
| GET /api/jobs/:id/download |  Download URLs<br> Longer expiry times<br> Complete job check |
| DELETE /api/jobs/:id | Ownership verification<br> Storage cleanup<br> Database deletion |

---

## ⚠️ Expected Behaviors

### **Job Processing Will Fail** (That's OK!)
The job will likely fail during processing because:
- AI Pipeline isn't running (Member 3's work)
- No actual video files in storage

**But that's fine!** The API endpoints are working correctly:
- ✅ Job gets created with `queued` status
- ✅ Status updates to `analyzing` or `grading`
- ✅ Eventually fails with error message
- ✅ You can still test all CRUD operations

### **Authentication Required**
All endpoints require a valid Supabase JWT token. Without it:
```json
{
  "error": "Unauthorized"
}
```

### **Invalid Clip IDs**
If you use clip IDs that don't belong to your user:
```json
{
  "error": "Some clips not found or don't belong to user"
}
```

---

## 🐛 Troubleshooting

### **"Server is not running"**
```bash
cd server
pnpm dev
```

### **"Unauthorized" errors**
- Check your auth token is valid and not expired
- Token format: `Bearer eyJhbGc...` (don't forget "Bearer " prefix)
- Generate a new token if needed

### **"Test user not found"**
Run the automated script once to create the test user:
```bash
npx tsx test-api-manual.ts
```

### **"Clips not found"**
Make sure clip IDs:
- Are valid UUIDs
- Exist in the clips table
- Belong to your user (same `user_id`)

### **Can't connect to Supabase**
Check `.env` file has:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

---

## 📸 For Your Presentation

Use **Option 1** (automated script) and screenshot:

1. **Terminal Output**: Shows all API tests passing with real responses
2. **Supabase Dashboard**: Go to **Table Editor** → **jobs** table to show created jobs
3. **Server Logs**: Show WebSocket events and processing attempts

These prove your Week 3 implementation works end-to-end! 🎉
