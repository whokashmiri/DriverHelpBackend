import dotenv from "dotenv";
import http from "http";

dotenv.config();

const { default: app } =
  await import("./app.js");

const { connectDB } =
  await import("./config/db.js");

const { initializeSocket } =
  await import("./sockets/index.js");

const PORT =
  process.env.PORT || 5000;

/**
 * Connect MongoDB first.
 */
await connectDB();

/**
 * Create HTTP server from Express.
 */
const server =
  http.createServer(app);

/**
 * Attach Socket.IO to same server.
 */
const io =
  initializeSocket(server);

/**
 * Make io available if we need it later
 * from REST controllers.
 */
app.set("io", io);

/**
 * Start HTTP + Socket.IO server.
 */
server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);