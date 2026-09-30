import {
  DriverLocation,
} from "../models/DriverLocation.js";

import {
  DriverLocationHistory,
} from "../models/DriverLocationHistory.js";

import {
  DriverShift,
} from "../models/DriverShift.js";

const HISTORY_INTERVAL_MS =
  60 * 1000;

const lastHistorySave =
  new Map();

function canPerformDriverWork(
  user,
) {
  return (
    user?.canDeliverOrders === true &&
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
  /*
   * Normal driver belongs to
   * their assigned supervisor.
   */
  if (
    user?.role ===
    "driver"
  ) {
    return (
      user.supervisor ??
      null
    );
  }

  /*
   * Supervisor working in
   * driver mode belongs to
   * themselves.
   */
  if (
    user?.role ===
    "supervisor"
  ) {
    return user._id;
  }

  return null;
}

  

function validateLocationPayload(
  data,
) {
  const latitude =
    Number(
      data?.latitude,
    );

  const longitude =
    Number(
      data?.longitude,
    );

  if (
    !Number.isFinite(
      latitude,
    ) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(
      "Invalid latitude",
    );
  }

  if (
    !Number.isFinite(
      longitude,
    ) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      "Invalid longitude",
    );
  }

  let accuracy =
    null;

  let speed =
    null;

  let heading =
    null;

  if (
    data?.accuracy !==
      undefined &&
    data?.accuracy !==
      null
  ) {
    accuracy =
      Number(
        data.accuracy,
      );

    if (
      !Number.isFinite(
        accuracy,
      ) ||
      accuracy < 0
    ) {
      throw new Error(
        "Invalid accuracy",
      );
    }
  }

  if (
    data?.speed !==
      undefined &&
    data?.speed !==
      null
  ) {
    speed =
      Number(
        data.speed,
      );

    if (
      !Number.isFinite(
        speed,
      ) ||
      speed < 0
    ) {
      throw new Error(
        "Invalid speed",
      );
    }
  }

  if (
    data?.heading !==
      undefined &&
    data?.heading !==
      null
  ) {
    heading =
      Number(
        data.heading,
      );

    if (
      !Number.isFinite(
        heading,
      ) ||
      heading < 0 ||
      heading > 360
    ) {
      throw new Error(
        "Invalid heading",
      );
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

function shouldSaveHistory(
  driverId,
) {
  const now =
    Date.now();

  const lastSaved =
    lastHistorySave.get(
      driverId,
    );

  if (
    !lastSaved ||
    now - lastSaved >=
      HISTORY_INTERVAL_MS
  ) {
    lastHistorySave.set(
      driverId,
      now,
    );

    return true;
  }

  return false;
}

async function persistLocation({
  user,
  supervisorId,
  activeShift,
  latitude,
  longitude,
  accuracy,
  speed,
  heading,
  recordedAt,
}) {
  const location =
    await DriverLocation.findOneAndUpdate(
      {
        driver:
          user._id,
      },

      {
        $set: {
          supervisor:
            supervisorId,

          latitude,
          longitude,

          accuracy,
          speed,
          heading,

          recordedAt,
        },

        $setOnInsert: {
          driver:
            user._id,
        },
      },

      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

  const driverId =
    user._id.toString();

  if (
    activeShift &&
    shouldSaveHistory(
      driverId,
    )
  ) {
    await DriverLocationHistory.create({
      driver:
        user._id,

      supervisor:
        supervisorId,

      shift:
        activeShift._id,

      latitude,
      longitude,

      accuracy,
      speed,
      heading,

      recordedAt,
    });
  }

  return location;
}

// export function registerLocationSocket(
//   io,
//   socket,
// ) {
//   socket.on(
//     "driver:location",

//     async (
//       data,
//       callback,
//     ) => {
//       try {
//         const user =
//           socket.user;

//         if (
//            !canPerformDriverWork(
    //      user,
  //        )
//         ) {
//           throw new Error(
//             "Only drivers can send location updates",
//           );
//         }

//        const supervisorObjectId =
//           getWorkingSupervisorId(
//         getWorkingSupervisorId(
//           );
//          if (!supervisorObjectId) {
//           throw new Error(
//             "Unable to determine location supervisor",
//           );
//         }

//         const {
//           latitude,
//           longitude,
//           accuracy,
//           speed,
//           heading,
//         } =
//           validateLocationPayload(
//             data,
//           );

//         const recordedAt =
//           new Date();

//         /*
//          * Check whether driver
//          * currently has active shift.
//          */
//         const activeShift =
//           await DriverShift.findOne(
//             {
//               driver:
//                 user._id,

//               status:
//                 "active",
//             },
//           )
//             .select(
//               "_id",
//             )
//             .lean();

//         const driverId =
//           user._id.toString();

//         const supervisorId =
//           user.supervisor.toString();

//         /*
//          * LIVE PAYLOAD
//          *
//          * This is the important
//          * real-time event.
//          */
//         const livePayload = {
//           driverId,

//           latitude,
//           longitude,

//           accuracy,
//           speed,
//           heading,

//           recordedAt:
//             recordedAt.toISOString(),

//           shiftId:
//             activeShift?._id?.toString() ??
//             null,

//           isWorking:
//             Boolean(
//               activeShift,
//             ),
//         };

//         /*
//          * 1. SEND TO SUPERVISOR
//          * IMMEDIATELY.
//          *
//          * Do not wait for MongoDB.
//          */
//         io.to(
//           `supervisor:${supervisorId}`,
//         ).emit(
//           "driver:location:update",
//           livePayload,
//         );

//         /*
//          * 2. ACK DRIVER
//          * IMMEDIATELY.
//          *
//          * Driver should not wait
//          * for MongoDB either.
//          */
//         if (
//           typeof callback ===
//           "function"
//         ) {
//           callback({
//             success: true,

//             recordedAt:
//               livePayload.recordedAt,
//           });
//         }

//         /*
//          * 3. SAVE LATEST LOCATION
//          * AND HISTORY.
//          *
//          * This does NOT control
//          * live map updates anymore.
//          */
//         try {
//           await persistLocation({
//             user,
//             activeShift,

//             latitude,
//             longitude,

//             accuracy,
//             speed,
//             heading,

//             recordedAt,
//           });
//         } catch (
//           persistenceError
//         ) {
//           console.error(
//             "[Socket] Location persistence error:",
//             persistenceError.message,
//           );
//         }
//       } catch (error) {
//         console.error(
//           "[Socket] Location error:",
//           error.message,
//         );

//         if (
//           typeof callback ===
//           "function"
//         ) {
//           callback({
//             success: false,

//             message:
//               error.message ||
//               "Unable to update location",
//           });
//         }

//         socket.emit(
//           "driver:location:error",
//           {
//             message:
//               error.message ||
//               "Unable to update location",
//           },
//         );
//       }
//     },
//   );
// }



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

        // console.log(
        //   "[Socket][Location] Received from driver:",
        //   {
        //     socketId:
        //       socket.id,

        //     driverId:
        //       user?._id?.toString(),

        //     supervisorId:
        //       user?.supervisor?.toString() ??
        //       null,

        //     rawPayload:
        //       data,

        //     receivedAt:
        //       new Date().toISOString(),
        //   },
        // );

        if (
           !canPerformDriverWork(
    user,
  )
        ) {
          throw new Error(
            "Only drivers can send location updates",
          );
        }

       const supervisorObjectId =
  getWorkingSupervisorId(
    user,
  );

if (!supervisorObjectId) {
  throw new Error(
    "Unable to determine location supervisor",
  );
}

        const {
          latitude,
          longitude,
          accuracy,
          speed,
          heading,
        } =
          validateLocationPayload(
            data,
          );

        // console.log(
        //   "[Socket][Location] Validated location:",
        //   {
        //     driverId:
        //       user._id.toString(),

        //     latitude,

        //     longitude,

        //     accuracy,

        //     speed,

        //     heading,
        //   },
        // );

        const recordedAt =
          new Date();

        /*
         * Check whether driver
         * currently has active shift.
         */
        const activeShift =
          await DriverShift.findOne(
            {
              driver:
                user._id,

              status:
                "active",
            },
          )
            .select(
              "_id",
            )
            .lean();

        const driverId =
          user._id.toString();

        const supervisorId =
          supervisorObjectId.toString();

        // console.log(
        //   "[Socket][Location] Shift resolved:",
        //   {
        //     driverId,

        //     shiftId:
        //       activeShift?._id?.toString() ??
        //       null,

        //     isWorking:
        //       Boolean(
        //         activeShift,
        //       ),
        //   },
        // );

        /*
         * LIVE PAYLOAD
         *
         * This is exactly what
         * supervisor will receive.
         */
        const livePayload = {
          driverId,

          latitude,
          longitude,

          accuracy,
          speed,
          heading,

          recordedAt:
            recordedAt.toISOString(),

          shiftId:
            activeShift?._id?.toString() ??
            null,

          isWorking:
            Boolean(
              activeShift,
            ),
        };

        // console.log(
        //   "[Socket][Location] Sending to supervisor:",
        //   {
        //     room:
        //       `supervisor:${supervisorId}`,

        //     event:
        //       "driver:location:update",

        //     payload:
        //       livePayload,
        //   },
        // );

        /*
         * 1. SEND TO SUPERVISOR
         * IMMEDIATELY.
         */
        io.to(
          `supervisor:${supervisorId}`,
        ).emit(
          "driver:location:update",
          livePayload,
        );

        // console.log(
        //   "[Socket][Location] Emitted to supervisor successfully:",
        //   {
        //     supervisorId,

        //     driverId,

        //     latitude,

        //     longitude,

        //     recordedAt:
        //       livePayload.recordedAt,
        //   },
        // );

        /*
         * 2. ACK DRIVER
         * IMMEDIATELY.
         */
        if (
          typeof callback ===
          "function"
        ) {
          const acknowledgement = {
            success: true,

            recordedAt:
              livePayload.recordedAt,
          };

          // console.log(
          //   "[Socket][Location] Sending ACK to driver:",
          //   {
          //     driverId,

          //     acknowledgement,
          //   },
          // );

          callback(
            acknowledgement,
          );
        }

        /*
         * 3. SAVE LATEST LOCATION
         * AND HISTORY.
         */
        try {
          const savedLocation =
            await persistLocation({
              user,
              activeShift,

               supervisorId:
                  supervisorObjectId,

              latitude,
              longitude,

              accuracy,
              speed,
              heading,

              recordedAt,
            });

          // console.log(
          //   "[Socket][Location] Persistence complete:",
          //   {
          //     driverId,

          //     locationId:
          //       savedLocation?._id?.toString() ??
          //       null,

          //     historyEligible:
          //       Boolean(
          //         activeShift,
          //       ),

          //     recordedAt:
          //       recordedAt.toISOString(),
          //   },
          // );
        } catch (
          persistenceError
        ) {
          console.error(
            "[Socket][Location] Persistence error:",
            {
              driverId,

              message:
                persistenceError.message,

              latitude,

              longitude,
            },
          );
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
          },
        );
      }
    },
  );
}