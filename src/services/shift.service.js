import { DriverShift } from "../models/DriverShift.js";

function createServiceError(
  message,
  statusCode = 400
) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Get driver's active shift.
 */
export async function getActiveDriverShift(
  driverId
) {
  return DriverShift.findOne({
    driver: driverId,
    status: "active",
  }).sort({
    startedAt: -1,
  });
}

/**
 * Start new driver shift.
 */
export async function startDriverShift({
  driverId,
  supervisorId,
}) {
  if (!driverId) {
    throw createServiceError(
      "Driver ID is required"
    );
  }

  if (!supervisorId) {
    throw createServiceError(
      "Driver is not assigned to a supervisor"
    );
  }

  const activeShift =
    await getActiveDriverShift(
      driverId
    );

  if (activeShift) {
    throw createServiceError(
      "You already have an active shift",
      409
    );
  }

  return DriverShift.create({
    driver: driverId,
    supervisor: supervisorId,

    startedAt: new Date(),

    status: "active",
  });
}

/**
 * End current shift.
 */
export async function endDriverShift(
  driverId
) {
  const shift =
    await getActiveDriverShift(
      driverId
    );

  if (!shift) {
    throw createServiceError(
      "No active shift found",
      404
    );
  }

  const endedAt = new Date();

  const durationSeconds =
    Math.max(
      0,
      Math.floor(
        (
          endedAt.getTime() -
          shift.startedAt.getTime()
        ) / 1000
      )
    );

  shift.endedAt = endedAt;
  shift.durationSeconds =
    durationSeconds;

  shift.status = "completed";

  await shift.save();

  return shift;
}

/**
 * Get driver's shift history.
 */
export async function getDriverShifts(
  driverId
) {
  return DriverShift.find({
    driver: driverId,
  }).sort({
    startedAt: -1,
  });
}