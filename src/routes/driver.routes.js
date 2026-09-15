import express from "express";

import {
  createDriver,
  getDriverById,
  getMyDrivers,
  updateDriverStatus,
} from "../controllers/driver.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

/**
 * SUPERVISOR
 * Create driver.
 */
router.post(
  "/",
  createDriver
);

/**
 * SUPERVISOR
 * Get all drivers belonging to supervisor.
 */
router.get(
  "/",
  getMyDrivers
);

/**
 * SUPERVISOR
 * Get one driver.
 */
router.get(
  "/:id",
  getDriverById
);

/**
 * SUPERVISOR
 * Activate/deactivate driver.
 */
router.patch(
  "/:id/status",
  updateDriverStatus
);

export default router;