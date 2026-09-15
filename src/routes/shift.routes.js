import express from "express";

import {
  startShift,
  endShift,
  getActiveShift,
  getMyShifts,
} from "../controllers/shift.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

/**
 * DRIVER
 * Start work shift.
 */
router.post(
  "/start",
  startShift
);

/**
 * DRIVER
 * Finish current shift.
 */
router.post(
  "/end",
  endShift
);

/**
 * DRIVER
 * Get current active shift.
 */
router.get(
  "/active",
  getActiveShift
);

/**
 * DRIVER
 * Shift history.
 */
router.get(
  "/my",
  getMyShifts
);

export default router;