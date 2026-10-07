import {
  updateDriverLocation,
} from "../services/location.service.js";

function canPerformDriverWork(
  user,
) {
  return (
    user?.canDeliverOrders ===
      true &&
    (
      user?.role ===
        "driver" ||
      user?.role ===
        "supervisor"
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

export function registerLocationSocket(
  io,
  socket,
) {
  socket.on(
    "driver:location",

    async (
      data,
      callback,
    ) => {
      try {
        const user =
          socket.user;

        if (
          !canPerformDriverWork(
            user,
          )
        ) {
          throw new Error(
            "This user is not allowed to send location updates",
          );
        }

        const supervisorId =
          getWorkingSupervisorId(
            user,
          );

        if (
          !supervisorId
        ) {
          throw new Error(
            "Unable to determine location supervisor",
          );
        }

        /*
         * Shared service.
         */
        const result =
          await updateDriverLocation({
            driverId:
              user._id,

            supervisorId,

            payload:
              data,

            saveHistory:
              true,
          });

        /*
         * Send same normalized
         * payload to supervisor.
         */
        io.to(
          `supervisor:${supervisorId.toString()}`,
        ).emit(
          "driver:location:update",

          result.liveLocation,
        );

        /*
         * ACK driver.
         */
        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success:
              true,

            recordedAt:
              result.liveLocation
                .recordedAt,

            locationId:
              result.location?._id?.toString() ??
              null,
          });
        }
      } catch (error) {
        console.error(
          "[Socket][Location] Error:",
          {
            socketId:
              socket.id,

            driverId:
              socket.user?._id?.toString() ??
              null,

            message:
              error.message,

            rawPayload:
              data,
          },
        );

        if (
          typeof callback ===
          "function"
        ) {
          callback({
            success:
              false,

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
          },
        );
      }
    },
  );
}