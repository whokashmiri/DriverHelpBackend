//server.js

import dotenv from "dotenv";
import http from "http";
const {
  startNotificationScheduler,
  stopNotificationScheduler,
} = await import(
  "./services/notificationScheduler.service.js"
);

dotenv.config();

const { default: app } =
  await import("./app.js");

const { connectDB } =
  await import("./config/db.js");

const { initializeSocket } =
  await import("./sockets/index.js");

const PORT =
  process.env.PORT || 5000;

await connectDB();

const server =
  http.createServer(app);

const io =
  initializeSocket(server);

app.set("io", io);


server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`,
    );

    if (
      process.env.ENABLE_NOTIFICATION_SCHEDULER ===
      "true"
    ) {
      startNotificationScheduler();
    } else {
      console.log(
        "[REMINDER] Scheduler disabled",
      );
    }
  },
);


function shutdown(signal) {
  console.log(
    `[Server] ${signal} received`,
  );

  io.close(() => {
    server.close(() => {
      console.log(
        "[Server] Closed",
      );

      process.exit(0);
    });
  });
}

stopNotificationScheduler();

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
    ),
);

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
    ),
);