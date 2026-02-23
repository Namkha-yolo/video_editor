import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import uploadRoutes from "./routes/upload.js";
import jobRoutes from "./routes/jobs.js";
import moodRoutes from "./routes/moods.js";
import clipRoutes from "./routes/clips.js";

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: "*" },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/moods", moodRoutes);
app.use("/api/clips", clipRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// WebSocket
io.on("connection", (socket) => {
  // TODO: Handle job subscription for real-time progress
  console.log("Client connected:", socket.id);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
