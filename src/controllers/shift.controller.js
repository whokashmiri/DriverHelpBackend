import { DriverShift } from "../models/DriverShift.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * DRIVER
 * Start a new shift.
 */
export const startShift = asyncHandler(async (req, res) => {
  if (req.user.role !== "driver") {
    res.status(403);
    throw new Error("Only drivers can start a shift");
  }

  if (!req.user.supervisor) {
    res.status(400);
    throw new Error("Driver is not assigned to a supervisor");
  }

  // A driver cannot have two active shifts at the same time.
  const activeShift = await DriverShift.findOne({
    driver: req.user._id,
    status: "active",
  });

  if (activeShift) {
    res.status(409);
    throw new Error("You already have an active shift");
  }

  const shift = await DriverShift.create({
    driver: req.user._id,
    supervisor: req.user.supervisor,

    // Always use server time.
    startedAt: new Date(),

    status: "active",
  });

  res.status(201).json({
    success: true,
    message: "Shift started successfully",
    shift,
  });
});


/**
 * DRIVER
 * Finish currently active shift.
 */
export const endShift = asyncHandler(async (req, res) => {
  if (req.user.role !== "driver") {
    res.status(403);
    throw new Error("Only drivers can end a shift");
  }

  const shift = await DriverShift.findOne({
    driver: req.user._id,
    status: "active",
  });

  if (!shift) {
    res.status(404);
    throw new Error("No active shift found");
  }

  const endedAt = new Date();

  const durationSeconds = Math.max(
    0,
    Math.floor(
      (endedAt.getTime() - shift.startedAt.getTime()) / 1000
    )
  );

  shift.endedAt = endedAt;
  shift.durationSeconds = durationSeconds;
  shift.status = "completed";

  await shift.save();

  res.json({
    success: true,
    message: "Shift ended successfully",

    shift: {
      id: shift._id,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      durationSeconds: shift.durationSeconds,
      durationHours: Number(
        (shift.durationSeconds / 3600).toFixed(2)
      ),
      status: shift.status,
    },
  });
});


/**
 * DRIVER
 * Get currently active shift.
 *
 * Useful when app is reopened/restarted.
 */
export const getActiveShift = asyncHandler(async (req, res) => {
  const shift = await DriverShift.findOne({
    driver: req.user._id,
    status: "active",
  }).sort({
    startedAt: -1,
  });

  res.json({
    success: true,
    shift,
  });
});


/**
 * DRIVER
 * Get driver's shift history.
 */
export const getMyShifts = asyncHandler(async (req, res) => {
  const shifts = await DriverShift.find({
    driver: req.user._id,
  }).sort({
    startedAt: -1,
  });

  res.json({
    success: true,
    count: shifts.length,
    shifts,
  });
});