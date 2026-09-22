import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import { User } from "../models/User.js";
import { registerLocationSocket } from "./location.socket.js";

async function authenticateSocket(
  socket,
  next,
) {
  try {
    const token =
      socket.handshake.auth
        ?.token ||
      socket.handshake.headers
        ?.authorization?.replace(
          /^Bearer\s+/i,
          "",
        );

    if (!token) {
      return next(
        new Error(
          "Authentication token is required",
        ),
      );
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
      );

    const user =
      await User.findById(
        decoded.id,
      ).select(
        [
          "_id",
          "iqamaId",
          "name",
          "shortName",
          "profilePicture",
          "vehicleType",
          "role",
          "supervisor",
          "isActive",
        ].join(" "),
      );

    if (!user) {
      return next(
        new Error(
          "User not found",
        ),
      );
    }

    if (!user.isActive) {
      return next(
        new Error(
          "User account is inactive",
        ),
      );
    }

    socket.user =
      user;

    next();
  } catch {
    next(
      new Error(
        "Invalid or expired authentication token",
      ),
    );
  }
}

export function initializeSocket(
  server,
) {
  const io =
    new Server(server, {
      cors: {
        origin:
          process.env
            .CORS_ORIGIN ||
          "*",

        credentials: true,
      },

      pingInterval:
        25000,

      pingTimeout:
        20000,
    });

  io.use(
    authenticateSocket,
  );

  io.on(
    "connection",
    (socket) => {
      const user =
        socket.user;

      const userId =
        user._id.toString();

      console.log(
        `[Socket] Connected: ${userId} (${user.role})`,
      );

      /*
       * Private user room
       */
      socket.join(
        `user:${userId}`,
      );

      /*
       * Supervisor receives
       * driver live updates here.
       */
      if (
        user.role ===
        "supervisor"
      ) {
        socket.join(
          `supervisor:${userId}`,
        );
      }

      registerLocationSocket(
        io,
        socket,
      );

      socket.on(
        "disconnect",
        (reason) => {
          console.log(
            `[Socket] Disconnected: ${userId} (${reason})`,
          );
        },
      );
    },
  );

  return io;
}