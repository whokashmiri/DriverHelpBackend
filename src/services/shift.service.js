
import { DriverShift } from "../models/DriverShift.js";

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Get the driver's currently active shift.
 */
export async function getActiveDriverShift(driverId) {
  if (!driverId) {
    throw createServiceError("Driver ID is required");
  }

  return DriverShift.findOne({
    driver: driverId,
    status: "active",
  }).sort({
    startedAt: -1,
  });
}

/**
 * Start a new driver shift.
 *
 * A partial unique index on DriverShift
 * prevents multiple active shifts for
 * the same driver.
 */
export async function startDriverShift({
  driverId,
  supervisorId,
}) {
  if (!driverId) {
    throw createServiceError("Driver ID is required");
  }

  if (!supervisorId) {
    throw createServiceError("Supervisor ID is required");
  }

  const activeShift = await getActiveDriverShift(driverId);

  if (activeShift) {
    throw createServiceError(
      "You already have an active shift",
      409,
    );
  }

  try {
    return await DriverShift.create({
      driver: driverId,
      supervisor: supervisorId,
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: null,
      status: "active",
    });
  } catch (error) {
    /*
     * MongoDB unique partial index rejects
     * concurrent active shift creation.
     */
    if (error.code === 11000) {
      throw createServiceError(
        "You already have an active shift",
        409,
      );
    }

    throw error;
  }
}

/**
 * End the driver's active shift.
 *
 * Atomic conditional update ensures that
 * only one request can complete a given shift.
 */
export async function endDriverShift(driverId) {
  if (!driverId) {
    throw createServiceError("Driver ID is required");
  }

  const shift = await getActiveDriverShift(driverId);

  if (!shift) {
    throw createServiceError(
      "No active shift found",
      404,
    );
  }

  const endedAt = new Date();

  const durationSeconds = Math.max(
    0,
    Math.floor(
      (endedAt.getTime() - shift.startedAt.getTime()) / 1000,
    ),
  );

  /*
   * Update only if this shift is still active.
   *
   * If another request already ended it,
   * this operation will not overwrite it.
   */
  const completedShift = await DriverShift.findOneAndUpdate(
    {
      _id: shift._id,
      driver: driverId,
      status: "active",
    },
    {
      $set: {
        endedAt,
        durationSeconds,
        status: "completed",
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!completedShift) {
    throw createServiceError(
      "Shift has already ended",
      409,
    );
  }

  console.log("[Shift] Ended:", {
    shiftId: completedShift._id.toString(),
    durationSeconds: completedShift.durationSeconds,
  });

  return completedShift;
}

/**
 * Get driver's shift history.
 *
 * Shift history is retained for work hours,
 * even though GPS route history is removed.
 */
export async function getDriverShifts(driverId) {
  if (!driverId) {
    throw createServiceError("Driver ID is required");
  }

  return DriverShift.find({
    driver: driverId,
  }).sort({
    startedAt: -1,
  });
}
