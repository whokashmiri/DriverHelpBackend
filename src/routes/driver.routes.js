import express from "express";

import {
  createDriver,
  getDriverById,
  getMyDrivers,
  updateDriverStatus,
  updateDriver,
} from "../controllers/driver.controller.js";

import {
  protect,
} from "../middleware/auth.middleware.js";

import {
  upload,
} from "../middleware/upload.middleware.js";

const router =
  express.Router();

router.use(protect);

/*
 * CREATE DRIVER
 *
 * Accepts multipart/form-data
 * profilePicture is optional.
 */
router.post(
  "/",
  upload.single(
    "profilePicture",
  ),
  createDriver,
);

/*
 * GET MY DRIVERS
 */
router.get(
  "/",
  getMyDrivers,
);

/*
 * GET DRIVER BY ID
 */
router.get(
  "/:id",
  getDriverById,
);

/*
 * ACTIVATE / DEACTIVATE DRIVER
 */
router.patch(
  "/:id/status",
  updateDriverStatus,
);

/*
 * UPDATE DRIVER
 *
 * Accepts optional profilePicture.
 */
router.patch(
  "/:driverId",
  upload.single(
    "profilePicture",
  ),
  updateDriver,
);

export default router;