import express from "express";

import {
  getDriverStats,
  getMyDashboardStats,
  getMyStats,
  getSupervisorDashboard,
  getSupervisorRangeStats,
} from "../controllers/stats.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

/**
 * DRIVER
 *
 * Examples:
 *
 * GET /stats/me?period=today
 * GET /stats/me?period=week
 * GET /stats/me?period=month
 */
router.get(
  "/me",
  getMyStats,
);

/**
 * DRIVER
 *
 * Today + week + month in one response.
 */
router.get(
  "/me/dashboard",
  getMyDashboardStats,
);

/**
 * SUPERVISOR
 *
 * Overall team dashboard.
 */
router.get(
  "/dashboard",
  getSupervisorDashboard,
);

/**
 * SUPERVISOR
 *
 * Custom date-range statistics.
 *
 * Whole team:
 *
 * GET /stats/range
 *   ?from=2026-09-01
 *   &to=2026-09-17
 *
 * One driver:
 *
 * GET /stats/range
 *   ?from=2026-09-01
 *   &to=2026-09-17
 *   &driverId=DRIVER_ID
 */
router.get(
  "/range",
  getSupervisorRangeStats,
);

/**
 * SUPERVISOR
 *
 * One driver's statistics.
 *
 * Examples:
 *
 * GET /stats/drivers/:driverId?period=today
 * GET /stats/drivers/:driverId?period=week
 * GET /stats/drivers/:driverId?period=month
 */
router.get(
  "/drivers/:driverId",
  getDriverStats,
);

export default router;