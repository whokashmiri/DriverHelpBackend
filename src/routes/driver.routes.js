import express from "express";

import {
  createDriver,
  getDriverById,
  getMyDrivers,
  updateDriverStatus,
  updateDriver
} from "../controllers/driver.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);


router.post(
  "/",
  createDriver
);

router.get(
  "/",
  getMyDrivers
);


router.get(
  "/:id",
  getDriverById
);


router.patch(
  "/:id/status",
  updateDriverStatus
);

router.patch(
  "/:driverId",
  updateDriver,
);


export default router;