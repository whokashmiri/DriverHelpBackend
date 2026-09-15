import { DriverLocation } from "../models/DriverLocation.js";
import { DriverLocationHistory } from "../models/DriverLocationHistory.js";
import { DriverShift } from "../models/DriverShift.js";

const HISTORY_INTERVAL_MS = 60 * 1000;

const lastHistorySave = new Map();

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    throw createServiceError("Invalid latitude");
  }

  if (
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    throw createServiceError("Invalid longitude");
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function optionalNumber(
  value,
  fieldName,
  {
    min,
    max,
  } = {}
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw createServiceError(
      `${fieldName} must be a valid number`
    );
  }

  if (
    min !== undefined &&
    number < min
  ) {
    throw createServiceError(
      `${fieldName} must be at least ${min}`
    );
  }

  if (
    max !== undefined &&
    number > max
  ) {
    throw createServiceError(
      `${fieldName} must not exceed ${max}`
    );
  }

  return number;
}

function normalizeLocationPayload(data) {
  const {
    latitude,
    longitude,
  } = validateCoordinates(
    data?.latitude,
    data?.longitude
  );

  return {
    latitude,
    longitude,

    accuracy: optionalNumber(
      data?.accuracy,
      "accuracy",
      {
        min: 0,
      }
    ),

    speed: optionalNumber(
      data?.speed,
      "speed",
      {
        min: 0,
      }
    ),

    heading: optionalNumber(
      data?.heading,
      "heading",
      {
        min: 0,
        max: 360,
      }
    ),
  };
}

function shouldSaveHistory(driverId) {
  const now = Date.now();

  const lastSaved =
    lastHistorySave.get(driverId);

  if (
    !lastSaved ||
    now - lastSaved >= HISTORY_INTERVAL_MS
  ) {
    lastHistorySave.set(
      driverId,
      now
    );

    return true;
  }

  return false;
}

/**
 * Save/update driver's latest location.
 *
 * Also periodically saves history while
 * the driver has an active shift.
 */
export async function updateDriverLocation({
  driverId,
  supervisorId,
  payload,
  saveHistory = true,
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

  const {
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
  } = normalizeLocationPayload(payload);

  const recordedAt = new Date();

  const activeShift =
    await DriverShift.findOne({
      driver: driverId,
      status: "active",
    }).select("_id");

  const location =
    await DriverLocation.findOneAndUpdate(
      {
        driver: driverId,
      },
      {
        $set: {
          supervisor: supervisorId,

          latitude,
          longitude,

          accuracy,
          speed,
          heading,

          recordedAt,
        },

        $setOnInsert: {
          driver: driverId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

  let historySaved = false;

  if (
    saveHistory &&
    activeShift &&
    shouldSaveHistory(
      driverId.toString()
    )
  ) {
    await DriverLocationHistory.create({
      driver: driverId,
      supervisor: supervisorId,
      shift: activeShift._id,

      latitude,
      longitude,

      accuracy,
      speed,
      heading,

      recordedAt,
    });

    historySaved = true;
  }

  return {
    location,
    activeShift,
    historySaved,

    liveLocation: {
      driverId:
        driverId.toString(),

      latitude,
      longitude,

      accuracy,
      speed,
      heading,

      recordedAt,

      shiftId:
        activeShift?._id?.toString() ||
        null,

      isWorking:
        Boolean(activeShift),
    },
  };
}