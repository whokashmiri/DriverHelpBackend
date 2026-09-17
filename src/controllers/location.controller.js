import { DriverLocation } from "../models/DriverLocation.js";
import { DriverLocationHistory } from "../models/DriverLocationHistory.js";
import { DriverShift } from "../models/DriverShift.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    const error = new Error("Invalid latitude");
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    const error = new Error("Invalid longitude");
    error.statusCode = 400;
    throw error;
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function optionalNumber(value, fieldName, options = {}) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    const error = new Error(`${fieldName} must be a valid number`);
    error.statusCode = 400;
    throw error;
  }

  if (
    options.min !== undefined &&
    number < options.min
  ) {
    const error = new Error(
      `${fieldName} must be at least ${options.min}`
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    options.max !== undefined &&
    number > options.max
  ) {
    const error = new Error(
      `${fieldName} must not exceed ${options.max}`
    );
    error.statusCode = 400;
    throw error;
  }

  return number;
}

/**
 * DRIVER
 *
 * Update current location.
 *
 * REST endpoint can initially be used by the mobile app.
 * Later Socket.IO can call the same location-update logic.
 */
export const updateMyLocation = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "driver") {
      res.status(403);
      throw new Error(
        "Only drivers can update driver location"
      );
    }

    if (!req.user.supervisor) {
      res.status(400);
      throw new Error(
        "Driver is not assigned to a supervisor"
      );
    }

    const {
      latitude,
      longitude,
    } = validateCoordinates(
      req.body.latitude,
      req.body.longitude
    );

    const accuracy = optionalNumber(
      req.body.accuracy,
      "accuracy",
      {
        min: 0,
      }
    );

    const speed = optionalNumber(
      req.body.speed,
      "speed",
      {
        min: 0,
      }
    );

    const heading = optionalNumber(
      req.body.heading,
      "heading",
      {
        min: 0,
        max: 360,
      }
    );

    const recordedAt = new Date();

    const activeShift = await DriverShift.findOne({
      driver: req.user._id,
      status: "active",
    }).select("_id");

    const location =
      await DriverLocation.findOneAndUpdate(
        {
          driver: req.user._id,
        },
        {
          $set: {
            supervisor: req.user.supervisor,

            latitude,
            longitude,

            accuracy,
            speed,
            heading,

            recordedAt,
          },

          $setOnInsert: {
            driver: req.user._id,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

    /**
     * History:
     *
     * Initially save a point only while driver
     * has an active shift.
     *
     * We can later throttle this to every
     * 30-60 seconds.
     */
    if (activeShift) {
      await DriverLocationHistory.create({
        driver: req.user._id,
        supervisor: req.user.supervisor,

        shift: activeShift._id,

        latitude,
        longitude,

        accuracy,
        speed,
        heading,

        recordedAt,
      });
    }

    res.json({
      success: true,
      location,
    });
  }
);


/**
 * DRIVER
 *
 * Get own latest location.
 */
export const getMyLocation = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "driver") {
      res.status(403);
      throw new Error(
        "Only drivers can access this endpoint"
      );
    }

    const location = await DriverLocation.findOne({
      driver: req.user._id,
    });

    res.json({
      success: true,
      location,
    });
  }
);


/**
 * SUPERVISOR
 *
 * Get latest locations of all drivers
 * assigned to this supervisor.
 */
export const getMyDriversLocations = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      res.status(403);
      throw new Error(
        "Only supervisors can access driver locations"
      );
    }

    const locations = await DriverLocation.find({
      supervisor: req.user._id,
    })
      .populate(
        "driver",
        "name iqamaId phone isActive"
      )
      .sort({
        recordedAt: -1,
      });

    res.json({
      success: true,
      count: locations.length,
      locations,
    });
  }
);


/**
 * SUPERVISOR
 *
 * Get latest location of one driver.
 */
export const getDriverLocation = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      res.status(403);
      throw new Error(
        "Only supervisors can access driver locations"
      );
    }

    const driver = await User.findOne({
      _id: req.params.driverId,
      role: "driver",
      supervisor: req.user._id,
    }).select("_id name iqamaId isActive");

    if (!driver) {
      res.status(404);
      throw new Error("Driver not found");
    }

    const location = await DriverLocation.findOne({
      driver: driver._id,
      supervisor: req.user._id,
    });

    res.json({
      success: true,

      driver,

      location,
    });
  }
);


export const getDriverShiftLocationHistory = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      res.status(403);
      throw new Error(
        "Only supervisors can access location history"
      );
    }

    const driver = await User.findOne({
      _id: req.params.driverId,
      role: "driver",
      supervisor: req.user._id,
    }).select("_id");

    if (!driver) {
      res.status(404);
      throw new Error("Driver not found");
    }

    const shift = await DriverShift.findOne({
      _id: req.params.shiftId,
      driver: driver._id,
      supervisor: req.user._id,
    });

    if (!shift) {
      res.status(404);
      throw new Error("Shift not found");
    }

    const locations =
      await DriverLocationHistory.find({
        driver: driver._id,
        supervisor: req.user._id,
        shift: shift._id,
      })
        .sort({
          recordedAt: 1,
        })
        .select(
          "latitude longitude accuracy speed heading recordedAt"
        );

    res.json({
      success: true,

      shift: {
        id: shift._id,
        startedAt: shift.startedAt,
        endedAt: shift.endedAt,
        status: shift.status,
      },

      count: locations.length,

      locations,
    });
  }
);