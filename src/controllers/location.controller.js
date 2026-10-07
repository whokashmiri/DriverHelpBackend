import { DriverLocation } from "../models/DriverLocation.js";
import { DriverLocationHistory } from "../models/DriverLocationHistory.js";
import { DriverShift } from "../models/DriverShift.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  updateDriverLocation,
} from "../services/location.service.js";



function canPerformDriverWork(
  user,
) {
  return (
    user?.canDeliverOrders === true &&
    (
      user?.role === "driver" ||
      user?.role === "supervisor"
    )
  );
}

function getWorkingSupervisorId(
  user,
) {
  if (
    user?.role ===
    "driver"
  ) {
    return (
      user.supervisor ??
      null
    );
  }

  if (
    user?.role ===
    "supervisor"
  ) {
    return user._id;
  }

  return null;
}


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
export const updateMyLocation =
  asyncHandler(
    async (
      req,
      res,
    ) => {
      /*
       * Driver or delivery-enabled
       * supervisor only.
       */
      if (
        !canPerformDriverWork(
          req.user,
        )
      ) {
        res.status(403);

        throw new Error(
          "This user is not allowed to update delivery location",
        );
      }

      /*
       * Normal driver:
       * supervisor = assigned supervisor
       *
       * Supervisor Driver Mode:
       * supervisor = themselves
       */
      const supervisorId =
        getWorkingSupervisorId(
          req.user,
        );

      if (
        !supervisorId
      ) {
        res.status(400);

        throw new Error(
          "Unable to determine location supervisor",
        );
      }

      /*
       * Shared persistence logic.
       */
      const result =
        await updateDriverLocation({
          driverId:
            req.user._id,

          supervisorId,

          payload:
            req.body,

          saveHistory:
            true,
        });

      /*
       * IMPORTANT:
       *
       * Background location enters
       * through REST, but supervisor
       * still receives exactly the
       * same live socket event.
       */
      const io =
        req.app.get(
          "io",
        );

      if (io) {
        io.to(
          `supervisor:${supervisorId.toString()}`,
        ).emit(
          "driver:location:update",

          result.liveLocation,
        );
      }

      return res.json({
        success:
          true,

        location:
          result.location,

        recordedAt:
          result.liveLocation
            .recordedAt,

        locationId:
          result.location?._id?.toString() ??
          null,

        shiftId:
          result.liveLocation
            .shiftId,

        isWorking:
          result.liveLocation
            .isWorking,
      });
    },
  );

/**
 * DRIVER
 *
 * Get own latest location.
 */
export const getMyLocation = asyncHandler(
  async (req, res) => {
    if (!canPerformDriverWork(
    req.user,
  )) {
      res.status(403);
      throw new Error(
        "This user is not allowed to access delivery location",
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