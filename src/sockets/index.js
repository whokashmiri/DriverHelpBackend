import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import { User } from "../models/User.js";
import { registerLocationSocket } from "./location.socket.js";

async function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(
        /^Bearer\s+/i,
        ""
      );

    if (!token) {
      return next(
        new Error("Authentication token is required")
      );
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(
      decoded.id
    ).select(
      "_id iqamaId name role supervisor isActive"
    );

    if (!user) {
      return next(
        new Error("User not found")
      );
    }

    if (!user.isActive) {
      return next(
        new Error("User account is inactive")
      );
    }

    socket.user = user;

    next();
  } catch (error) {
    next(
      new Error(
        "Invalid or expired authentication token"
      )
    );
  }
} 
export function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin:
        process.env.CORS_ORIGIN || "*",

      credentials: true,
    },

    /**
     * Optional heartbeat configuration.
     */
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  /**
   * Authentication middleware.
   *
   * Runs before connection is accepted.
   */
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user = socket.user;

    console.log(
      `[Socket] Connected: ${user._id} (${user.role})`
    );

    /**
     * Every user gets their own private room.
     *
     * Useful later for direct notifications.
     */
    socket.join(
      `user:${user._id.toString()}`
    );

    /**
     * Supervisors join a supervisor-specific room.
     *
     * Driver location/events will be emitted here.
     */
    if (user.role === "supervisor") {
      socket.join(
        `supervisor:${user._id.toString()}`
      );
    }

    /**
     * Register location events.
     */
    registerLocationSocket(
      io,
      socket
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `[Socket] Disconnected: ${user._id} (${reason})`
      );
    });
  });

  return io;
}