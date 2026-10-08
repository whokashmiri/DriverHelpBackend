import express from "express";

import {
  getDriverStats,
  getMyDashboardStats,
  getMyStats,
  getSupervisorDashboard,
  getSupervisorDriversDashboard,
  getSupervisorRangeStats,
} from "../controllers/stats.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get(
  "/me",
  getMyStats,
);


router.get(
  "/me/dashboard",
  getMyDashboardStats,
);


router.get(
  "/dashboard",
  getSupervisorDashboard,
);


router.get(
  "/drivers-dashboard",
  getSupervisorDriversDashboard,
);

router.get(
  "/range",
  getSupervisorRangeStats,
);

router.get(
  "/drivers/:driverId",
  getDriverStats,
);

export default router;