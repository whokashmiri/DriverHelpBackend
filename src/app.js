import cors from "cors";
import express from "express";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import shiftRoutes from "./routes/shift.routes.js";
import locationRoutes from "./routes/location.routes.js";
import statsRoutes from "./routes/stats.routes.js";

import {
  errorHandler,
  notFound,
} from "./middleware/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Delivery backend is running",
  });
});

app.use((req, res, next) => {
  console.log("[HTTP]", {
    method: req.method,
    url: req.originalUrl,
    contentType: req.headers["content-type"],
    contentLength: req.headers["content-length"],
    authorization: Boolean(req.headers.authorization),
  });

  next();
});

/**
 * API routes
 */
app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/drivers",
  driverRoutes
);

app.use(
  "/api/shifts",
  shiftRoutes
);

app.use(
  "/api/locations",
  locationRoutes
);

app.use(
  "/api/stats",
  statsRoutes
);

/**
 * 404 handler
 */
app.use(notFound);

/**
 * Global error handler
 */
app.use(errorHandler);

export default app;