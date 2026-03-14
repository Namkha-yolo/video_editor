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
import { getRateLimiterConfig } from "./services/rateLimiters.js";

const app: Express = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: "*" },
});

setJobEventEmitter((room, event, payload) => {
  io.to(room).emit(event, payload);
});

app.use(helmet());
app.use(cors());
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
    features: {
      claude_rate_limiting: true,
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
