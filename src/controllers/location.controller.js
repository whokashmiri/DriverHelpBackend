
import { DriverLocation } from "../models/DriverLocation.js";
import { User } from "../models/User.js";

import { asyncHandler } from "../utils/asyncHandler.js";

import {
  updateDriverLocation,
} from "../services/location.service.js";

/*
 * Drivers can deliver.
 * Supervisors require delivery permission.
 */
function canPerformDriverWork(user) {
  if (!user || user.isActive === false) {
    return false;
  }

  if (user.role === "driver") {
    return true;
  }

  return (
    user.role === "supervisor" &&
    user.canDeliverOrders === true
  );
}

function getWorkingSupervisorId(user) {
  if (user?.role === "driver") {
    return user.supervisor ?? null;
  }

  if (user?.role === "supervisor") {
    return user._id;
  }

  return null;
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * DRIVER / DELIVERY SUPERVISOR
 *
 * POST /api/locations/me
 *
 * Used by Expo background tracking.
 */
export const updateMyLocation = asyncHandler(
  async (req, res) => {
    if (!canPerformDriverWork(req.user)) {
      throw httpError(
        "This user is not allowed to update delivery location",
        403,
      );
    }

    const supervisorId = getWorkingSupervisorId(req.user);

    if (!supervisorId) {
      throw httpError(
        "Unable to determine location supervisor",
        400,
      );
    }

    /*
     * Same service as foreground Socket.IO.
     */
    const result = await updateDriverLocation({
      driverId: req.user._id,
      supervisorId,
      payload: req.body,
    });

    /*
     * Background HTTP requests must broadcast
     * through the same supervisor socket room.
     *
     * Do not rebroadcast stale or duplicate points.
     */
    const io = req.app.get("io");

    if (result.accepted && io) {
      io.to(`supervisor:${supervisorId.toString()}`).emit(
        "driver:location:update",
        result.liveLocation,
      );
    }

    if (!io) {
      console.warn(
        "[Location] Socket.IO instance is unavailable",
      );
    }

    return res.json({
      success: true,
      accepted: result.accepted,

      // Retained for existing mobile API compatibility.
      location: result.location,

      recordedAt: result.liveLocation.recordedAt,

      locationId:
        result.location?._id?.toString() ?? null,

      shiftId: result.liveLocation.shiftId,

      isWorking: result.liveLocation.isWorking,
    });
  },
);

/**
 * DRIVER / DELIVERY SUPERVISOR
 *
 * GET /api/locations/me
 */
export const getMyLocation = asyncHandler(
  async (req, res) => {
    if (!canPerformDriverWork(req.user)) {
      throw httpError(
        "This user is not allowed to access delivery location",
        403,
      );
    }

    const location = await DriverLocation.findOne({
      driver: req.user._id,
    });

    return res.json({
      success: true,
      location,
    });
  },
);

/**
 * SUPERVISOR
 *
 * GET /api/locations/drivers
 *
 * Return latest known location for each
 * assigned driver.
 */
export const getMyDriversLocations = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      throw httpError(
        "Only supervisors can access driver locations",
        403,
      );
    }

    const locations = await DriverLocation.find({
      supervisor: req.user._id,
    })
      .populate(
        "driver",
        [
          "_id",
          "name",
          "shortName",
          "phone",
          "profilePicture",
          "vehicleType",
          "isActive",
        ].join(" "),
      )
      .sort({
        recordedAt: -1,
      });

    /*
     * Exclude orphaned locations and accounts
     * that no longer belong to the supervisor.
     *
     * This keeps the existing map response shape.
     */
    const validLocations = locations.filter((location) => {
      const driver = location.driver;

      if (!driver || typeof driver === "string") {
        return false;
      }

      return driver.isActive !== false;
    });

    return res.json({
      success: true,
      count: validLocations.length,
      locations: validLocations,
    });
  },
);

/**
 * SUPERVISOR
 *
 * GET /api/locations/drivers/:driverId
 */
export const getDriverLocation = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      throw httpError(
        "Only supervisors can access driver locations",
        403,
      );
    }

    const driver = await User.findOne({
      _id: req.params.driverId,
      role: "driver",
      supervisor: req.user._id,
    }).select("_id name iqamaId isActive");

    if (!driver) {
      throw httpError("Driver not found", 404);
    }

    const location = await DriverLocation.findOne({
      driver: driver._id,
      supervisor: req.user._id,
    });

    return res.json({
      success: true,
      driver,
      location,
    });
  },
);

/**
 * Temporary compatibility endpoint.
 *
 * Remove its route in location.routes.js
 * after updating that file.
 *
 * No location history is stored or returned.
 */
export const getDriverShiftLocationHistory = asyncHandler(
  async (_req, res) => {
    return res.status(410).json({
      success: false,
      message: "Location history is no longer available",
    });
  },
);
