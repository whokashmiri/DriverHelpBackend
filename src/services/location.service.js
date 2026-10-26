
import { DriverLocation } from "../models/DriverLocation.js";
import { DriverShift } from "../models/DriverShift.js";

const MAX_LOCATION_AGE_MS = 2 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateCoordinates(latitude, longitude) {
  if (
    latitude === undefined ||
    latitude === null ||
    latitude === "" ||
    longitude === undefined ||
    longitude === null ||
    longitude === ""
  ) {
    throw createServiceError(
      "Latitude and longitude are required",
    );
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw createServiceError("Invalid latitude");
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw createServiceError("Invalid longitude");
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function optionalNumber(value, { min, max } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  // Unavailable sensor measurements should not reject
  // an otherwise valid GPS coordinate.
  if (!Number.isFinite(number)) {
    return null;
  }

  if (min !== undefined && number < min) {
    return null;
  }

  if (max !== undefined && number > max) {
    return null;
  }

  return number;
}

function normalizeLocationPayload(payload) {
  const { latitude, longitude } = validateCoordinates(
    payload?.latitude,
    payload?.longitude,
  );

  const now = Date.now();

  // Compatibility with older mobile builds:
  // use server receipt time when recordedAt is absent.
  // Updated mobile clients should ALWAYS send recordedAt.
  let recordedAtMs = now;

  if (
    payload?.recordedAt !== undefined &&
    payload?.recordedAt !== null
  ) {
    recordedAtMs = new Date(payload.recordedAt).getTime();
  }

  if (!Number.isFinite(recordedAtMs)) {
    throw createServiceError("Invalid location timestamp");
  }

  if (recordedAtMs > now + MAX_FUTURE_SKEW_MS) {
    throw createServiceError(
      "Location timestamp is in the future",
    );
  }

  if (recordedAtMs < now - MAX_LOCATION_AGE_MS) {
    throw createServiceError(
      "Location is too old for live tracking",
    );
  }

  return {
    latitude,
    longitude,
    accuracy: optionalNumber(payload?.accuracy, { min: 0 }),
    speed: optionalNumber(payload?.speed, { min: 0 }),
    heading: optionalNumber(payload?.heading, {
      min: 0,
      max: 360,
    }),
    recordedAt: new Date(recordedAtMs),
  };
}

function buildLiveLocation(location, activeShift) {
  return {
    driverId: location.driver.toString(),
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    speed: location.speed ?? null,
    heading: location.heading ?? null,
    recordedAt: location.recordedAt.toISOString(),
    shiftId: activeShift._id.toString(),
    isWorking: true,
  };
}

/**
 * Shared service used by:
 * - Foreground Socket.IO tracking
 * - Background HTTP tracking
 *
 * Only DriverLocation is updated.
 * DriverLocationHistory is not used.
 */
export async function updateDriverLocation({
  driverId,
  supervisorId,
  payload,
}) {
  if (!driverId) {
    throw createServiceError("Driver ID is required");
  }

  if (!supervisorId) {
    throw createServiceError("Supervisor ID is required");
  }

  const data = normalizeLocationPayload(payload);

  /*
   * Only drivers with a currently active shift
   * are allowed to submit live GPS updates.
   */
  const activeShift = await DriverShift.findOne({
    driver: driverId,
    supervisor: supervisorId,
    status: "active",
  })
    .select("_id startedAt")
    .lean();

  if (!activeShift) {
    throw createServiceError(
      "Location tracking requires an active shift",
      403,
    );
  }

  /*
   * Reject points recorded before the current shift.
   * This also prevents old queued points from a
   * previous shift being stored in a new shift.
   */
  if (data.recordedAt < activeShift.startedAt) {
    throw createServiceError(
      "Location was recorded before the active shift",
      409,
    );
  }

  /*
   * Update only if this GPS timestamp is newer.
   * The timestamp comparison is atomic in MongoDB.
   *
   * Do not use upsert with the timestamp filter:
   * concurrent requests could cause duplicate-key
   * errors against the unique driver index.
   */
  let location = await DriverLocation.findOneAndUpdate(
    {
      driver: driverId,
      recordedAt: { $lt: data.recordedAt },
    },
    {
      $set: {
        supervisor: supervisorId,
        ...data,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  let accepted = Boolean(location);

  /*
   * If no document was updated, there are
   * two possibilities:
   *
   * 1. No location exists yet.
   * 2. A same-age or newer location exists.
   */
  if (!location) {
    const existing = await DriverLocation.findOne({
      driver: driverId,
    });

    if (!existing) {
      try {
        location = await DriverLocation.create({
          driver: driverId,
          supervisor: supervisorId,
          ...data,
        });

        accepted = true;
      } catch (error) {
        /*
         * Another request may have created the
         * first document concurrently.
         *
         * Retry the conditional update rather
         * than treating this as a fatal error.
         */
        if (error.code !== 11000) {
          throw error;
        }

        location = await DriverLocation.findOneAndUpdate(
          {
            driver: driverId,
            recordedAt: { $lt: data.recordedAt },
          },
          {
            $set: {
              supervisor: supervisorId,
              ...data,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        );

        accepted = Boolean(location);
      }
    }
  }

  /*
   * The incoming coordinate was not newer.
   * Return the stored location without broadcasting
   * this old update.
   */
  if (!location) {
    location = await DriverLocation.findOne({
      driver: driverId,
    });
  }

  if (!location) {
    throw createServiceError(
      "Unable to retrieve driver location",
      500,
    );
  }

  return {
    location,
    activeShift,
    accepted,
    liveLocation: buildLiveLocation(location, activeShift),
  };
}
