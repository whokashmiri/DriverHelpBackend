import express from "express";

import {
  getDriverLocation,
  getDriverShiftLocationHistory,
  getMyDriversLocations,
  getMyLocation,
  updateMyLocation,
} from "../controllers/location.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

/**
 * DRIVER
 * Update latest location.
 */
router.post(
  "/me",
  updateMyLocation
);

/**
 * DRIVER
 * Get own latest location.
 */
router.get(
  "/me",
  getMyLocation
);

/**
 * SUPERVISOR
 * Get latest locations of all own drivers.
 */
router.get(
  "/drivers",
  getMyDriversLocations
);

/**
 * SUPERVISOR
 * Get one driver's latest location.
 */
router.get(
  "/drivers/:driverId",
  getDriverLocation
);

/**
 * SUPERVISOR
 * Get one driver's route/history for one shift.
 */
router.get(
  "/drivers/:driverId/shifts/:shiftId/history",
  getDriverShiftLocationHistory
);

export default router;