import { DriverLocation } from "../models/DriverLocation.js";
import { DriverLocationHistory } from "../models/DriverLocationHistory.js";
import { DriverShift } from "../models/DriverShift.js";


const HISTORY_INTERVAL_MS = 60 * 1000;


const lastHistorySave = new Map();

function validateLocationPayload(data) {
  const latitude = Number(data?.latitude);
  const longitude = Number(data?.longitude);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error("Invalid latitude");
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Invalid longitude");
  }

  let accuracy = null;
  let speed = null;
  let heading = null;

  if (
    data?.accuracy !== undefined &&
    data?.accuracy !== null
  ) {
    accuracy = Number(data.accuracy);

    if (
      !Number.isFinite(accuracy) ||
      accuracy < 0
    ) {
      throw new Error("Invalid accuracy");
    }
  }

  if (
    data?.speed !== undefined &&
    data?.speed !== null
  ) {
    speed = Number(data.speed);

    if (
      !Number.isFinite(speed) ||
      speed < 0
    ) {
      throw new Error("Invalid speed");
    }
  }

  if (
    data?.heading !== undefined &&
    data?.heading !== null
  ) {
    heading = Number(data.heading);

    if (
      !Number.isFinite(heading) ||
      heading < 0 ||
      heading > 360
    ) {
      throw new Error("Invalid heading");
    }
  }

  return {
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
  };
}

/**
 * Determines whether this driver should get
 * another location-history entry.
 */
function shouldSaveHistory(driverId) {
  const now = Date.now();

  const lastSaved =
    lastHistorySave.get(driverId);

  if (
    !lastSaved ||
    now - lastSaved >=
      HISTORY_INTERVAL_MS
  ) {
    lastHistorySave.set(
      driverId,
      now
    );

    return true;
  }

  return false;
}

export function registerLocationSocket(
  io,
  socket
) {

  socket.on(
    "driver:location",
    async (data, callback) => {
      try {
        const user = socket.user;

        if (user.role !== "driver") {
          throw new Error(
            "Only drivers can send location updates"
          );
        }

        if (!user.supervisor) {
          throw new Error(
            "Driver is not assigned to a supervisor"
          );
        }

        const {
          latitude,
          longitude,
          accuracy,
          speed,
          heading,
        } = validateLocationPayload(
          data
        );

        const recordedAt =
          new Date();

        const activeShift =
          await DriverShift.findOne({
            driver: user._id,
            status: "active",
          }).select("_id");

        const location =
          await DriverLocation.findOneAndUpdate(
            {
              driver: user._id,
            },

            {
              $set: {
                supervisor:
                  user.supervisor,

                latitude,
                longitude,

                accuracy,
                speed,
                heading,

                recordedAt,
              },

              $setOnInsert: {
                driver: user._id,
              },
            },

            {
              new: true,
              upsert: true,
              runValidators: true,
            }
          );

        const driverId =
          user._id.toString();

        if (
          activeShift &&
          shouldSaveHistory(driverId)
        ) {
          await DriverLocationHistory.create(
            {
              driver: user._id,

              supervisor:
                user.supervisor,

              shift:
                activeShift._id,

              latitude,
              longitude,

              accuracy,
              speed,
              heading,

              recordedAt,
            }
          );
        }

 
        io.to(
          `supervisor:${user.supervisor.toString()}`
        ).emit(
          "driver:location:update",
          {
            driverId:
              user._id.toString(),

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
          }
        );

  
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: true,

            recordedAt,

            locationId:
              location._id,
          });
        }
      } catch (error) {
        console.error(
          "[Socket] Location error:",
          error.message
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success: false,
            message:
              error.message ||
              "Unable to update location",
          });
        }

    
        socket.emit(
          "driver:location:error",
          {
            message:
              error.message ||
              "Unable to update location",
          }
        );
      }
    }
  );
}