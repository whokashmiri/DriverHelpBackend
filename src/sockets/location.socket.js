
import { User } from "../models/User.js";
import { updateDriverLocation } from "../services/location.service.js";

/*
 * Drivers are permitted to deliver.
 * Supervisors must explicitly have
 * delivery permission.
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

function publicErrorMessage(error) {
  const status = error?.statusCode;

  if (
    status === 400 ||
    status === 403 ||
    status === 409
  ) {
    return error.message;
  }

  return "Unable to update location";
}

export function registerLocationSocket(io, socket) {
  socket.on("driver:location", async (data, callback) => {
    try {
      const authenticatedUserId = socket.user?._id;

      if (!authenticatedUserId) {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        throw error;
      }

      /*
       * Refresh the driver's account on each update.
       * Avoid relying on supervisor assignment or
       * permissions cached when the socket connected.
       */
      const user = await User.findById(authenticatedUserId)
        .select(
          "_id role supervisor canDeliverOrders isActive",
        )
        .lean();

      if (!canPerformDriverWork(user)) {
        const error = new Error(
          "This user is not allowed to send location updates",
        );
        error.statusCode = 403;
        throw error;
      }

      const supervisorId = getWorkingSupervisorId(user);

      if (!supervisorId) {
        const error = new Error(
          "Unable to determine location supervisor",
        );
        error.statusCode = 400;
        throw error;
      }

      /*
       * Shared service used by both:
       * - Socket.IO foreground updates
       * - HTTP background updates
       */
      const result = await updateDriverLocation({
        driverId: user._id,
        supervisorId,
        payload: data,
      });

      /*
       * Only notify the supervisor when MongoDB
       * accepted this location as newer.
       *
       * Duplicate or delayed points must not
       * replace a newer marker on the live map.
       */
      if (result.accepted) {
        io.to(
          `supervisor:${supervisorId.toString()}`,
        ).emit(
          "driver:location:update",
          result.liveLocation,
        );
      }

      /*
       * ACK the driver even when a point was ignored
       * for being older or duplicate.
       *
       * This helps avoid retrying stale points.
       */
      if (typeof callback === "function") {
        callback({
          success: true,
          accepted: result.accepted,
          recordedAt: result.liveLocation.recordedAt,
          locationId:
            result.location?._id?.toString() ?? null,
        });
      }
    } catch (error) {
      /*
       * Never log raw GPS payloads or tokens.
       */
      console.error("[Socket][Location] Error:", {
        socketId: socket.id,
        driverId: socket.user?._id?.toString() ?? null,
        statusCode: error?.statusCode ?? 500,
        message: error?.message ?? "Unknown error",
      });

      const message = publicErrorMessage(error);

      if (typeof callback === "function") {
        callback({
          success: false,
          message,
        });
      }

      socket.emit("driver:location:error", {
        message,
      });
    }
  });
}
