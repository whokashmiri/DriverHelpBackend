import express from "express";

import {
  getDriverStats,
  getMyDashboardStats,
  getMyStats,
  getSupervisorDashboard,
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
  getMyStats
);

/**
 * DRIVER
 *
 * Today + week + month in one response.
 */
router.get(
  "/me/dashboard",
  getMyDashboardStats
);

/**
 * SUPERVISOR
 *
 * Overall team dashboard.
 */
router.get(
  "/dashboard",
  getSupervisorDashboard
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
  getDriverStats
);

export default router;