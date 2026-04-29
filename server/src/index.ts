import "./config/env.js";

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import uploadRoutes from "./routes/upload.js";
import jobRoutes from "./routes/jobs.js";
import moodRoutes from "./routes/moods.js";
import clipRoutes from "./routes/clips.js";
import { setJobEventEmitter } from "./services/jobEvents.js";
import { shutdownJobQueue } from "./services/jobQueue.js";
import { getRateLimiterConfig } from "./services/rateLimiters.js";
import { redis } from "./config/redis.js";

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (raw && raw.trim()) {
    return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return [];
}

const allowedOrigins = parseAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

const app: Express = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : false, credentials: true },
});

setJobEventEmitter((room, event, payload) => {
  io.to(room).emit(event, payload);
});

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.use("/api/upload", uploadRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/moods", moodRoutes);
app.use("/api/clips", clipRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    rate_limits: getRateLimiterConfig(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "ClipVibe API",
    version: "0.1.0",
    status: "running",
    endpoints: {
      health: "/api/health",
      moods: "/api/moods",
      upload: "/api/upload",
      clips: "/api/clips",
      jobs: "/api/jobs",
    },
    documentation: "See README.md for full API documentation",
  });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("subscribe", (jobId: string) => {
    if (!jobId) {
      return;
    }

    socket.join(`job:${jobId}`);
    console.log(`Socket ${socket.id} subscribed to job:${jobId}`);
  });

  socket.on("unsubscribe", (jobId: string) => {
    if (!jobId) {
      return;
    }

    socket.leave(`job:${jobId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

export { app, httpServer, io };

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  const deadline = Date.now() + 25_000;
  const withDeadline = <T>(label: string, work: Promise<T>) =>
    Promise.race<T | undefined>([
      work,
      new Promise<undefined>((resolve) => {
        const remaining = Math.max(0, deadline - Date.now());
        setTimeout(() => {
          console.warn(`${label} did not finish before deadline`);
          resolve(undefined);
        }, remaining);
      }),
    ]);

  try {
    await withDeadline("HTTP server close", new Promise<void>((resolve) => httpServer.close(() => resolve())));
    await withDeadline("Socket.IO close", new Promise<void>((resolve) => io.close(() => resolve())));
    await withDeadline("Job queue shutdown", shutdownJobQueue());
    await withDeadline(
      "Redis quit",
      redis.quit().catch(() => {
        redis.disconnect();
      })
    );
  } catch (error: any) {
    console.error("Shutdown error:", error?.message || error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
