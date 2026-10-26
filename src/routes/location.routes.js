
import express from "express";

import {
  getDriverLocation,
  getMyDriversLocations,
  getMyLocation,
  updateMyLocation,
} from "../controllers/location.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/*
 * All location endpoints require authentication.
 */
router.use(protect);

/*
 * DRIVER / DELIVERY SUPERVISOR
 *
 * Update latest location.
 *
 * Used by Expo background location tracking.
 */
router.post("/me", updateMyLocation);

/*
 * DRIVER / DELIVERY SUPERVISOR
 *
 * Get own latest location.
 */
router.get("/me", getMyLocation);

/*
 * SUPERVISOR
 *
 * Get latest locations of assigned drivers.
 */
router.get("/drivers", getMyDriversLocations);

/*
 * SUPERVISOR
 *
 * Get latest location of one assigned driver.
 */
router.get("/drivers/:driverId", getDriverLocation);

export default router;
