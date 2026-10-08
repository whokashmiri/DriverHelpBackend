// controllers/stats.controller.js

import { DateTime } from "luxon";

import { Order } from "../models/Order.js";
import { DriverShift } from "../models/DriverShift.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const TIME_ZONE = "Asia/Riyadh";

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

function getPeriodRange(period) {
  const now = DateTime.now().setZone(TIME_ZONE);

  let start;
  let end;

  switch (period) {
    case "today":
      start = now.startOf("day");
      end = now.endOf("day");
      break;

    case "week":
      start = now.startOf("week");
      end = now.endOf("week");
      break;

    case "month":
      start = now.startOf("month");
      end = now.endOf("month");
      break;

    default: {
      const error = new Error(
        "period must be today, week or month"
      );

      error.statusCode = 400;
      throw error;
    }
  }

  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
  };
}

function getCustomRange(from, to) {
  if (!from || !to) {
    const error = new Error(
      "from and to dates are required",
    );

    error.statusCode = 400;

    throw error;
  }

  const start = DateTime.fromISO(from, {
    zone: TIME_ZONE,
  }).startOf("day");

  const end = DateTime.fromISO(to, {
    zone: TIME_ZONE,
  }).endOf("day");

  if (!start.isValid || !end.isValid) {
    const error = new Error(
      "from and to must be valid ISO dates",
    );

    error.statusCode = 400;

    throw error;
  }

  if (end < start) {
    const error = new Error(
      "to date cannot be before from date",
    );

    error.statusCode = 400;

    throw error;
  }

  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
  };
}



function getShiftOverlapSeconds(
  shiftStart,
  shiftEnd,
  rangeStart,
  rangeEnd
) {
  const start = Math.max(
    new Date(shiftStart).getTime(),
    rangeStart.getTime()
  );

  const end = Math.min(
    new Date(shiftEnd).getTime(),
    rangeEnd.getTime()
  );

  if (end <= start) {
    return 0;
  }

  return Math.floor((end - start) / 1000);
}



async function getDriverWorkedSeconds(
  driverId,
  start,
  end
) {

  const shifts = await DriverShift.find({
    driver: driverId,

    startedAt: {
      $lt: end,
    },

    endedAt: {
      $ne: null,
      $gt: start,
    },

    status: "completed",
  }).select(
    "startedAt endedAt"
  );

  let totalSeconds = 0;

  for (const shift of shifts) {
    totalSeconds += getShiftOverlapSeconds(
      shift.startedAt,
      shift.endedAt,
      start,
      end
    );
  }


  const activeShift = await DriverShift.findOne({
    driver: driverId,
    status: "active",
  }).select(
    "startedAt"
  );

  if (activeShift) {
    const now = new Date();

    totalSeconds += getShiftOverlapSeconds(
      activeShift.startedAt,
      now,
      start,
      end
    );
  }

  return totalSeconds;
}



async function getDriverOrderStats(
  driverId,
  start,
  end
) {
  const result = await Order.aggregate([
    {
      $match: {
        rider: driverId,

        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: "$status",

        count: {
          $sum: 1,
        },
      },
    },
  ]);

  let total = 0;
  let pickedUp = 0;
  let delivered = 0;
  let cancelled = 0;

  for (const item of result) {
    total += item.count;

    if (
      item._id ===
      "picked_up"
    ) {
      pickedUp =
        item.count;
    }

    if (
      item._id ===
      "delivered"
    ) {
      delivered =
        item.count;
    }

    if (
      item._id ===
      "cancelled"
    ) {
      cancelled =
        item.count;
    }
  }

  return {
    total,
    pickedUp,
    delivered,
    cancelled,
  };
}


export const getMyStats = asyncHandler(
  async (req, res) => {
    if ( !canPerformDriverWork(
    req.user,
  )) {
      res.status(403);
      throw new Error(
        "This user is not allowed to access delivery statistics",
      );
    }

    const period =
      req.query.period || "today";

    const {
      start,
      end,
    } = getPeriodRange(period);

    const [
      orders,
      workedSeconds,
      activeShift,
    ] = await Promise.all([
      getDriverOrderStats(
        req.user._id,
        start,
        end
      ),

      getDriverWorkedSeconds(
        req.user._id,
        start,
        end
      ),

      DriverShift.findOne({
        driver: req.user._id,
        status: "active",
      }).select(
        "_id startedAt"
      ),
    ]);

    res.json({
      success: true,

      period,

      range: {
        start,
        end,
        timezone: TIME_ZONE,
      },

      orders,

      work: {
        totalSeconds: workedSeconds,

        totalHours: Number(
          (workedSeconds / 3600).toFixed(2)
        ),

        activeShift: activeShift
          ? {
              id: activeShift._id,
              startedAt:
                activeShift.startedAt,
            }
          : null,
      },
    });
  }
);


/**
 * DRIVER
 *
 * Get dashboard summary:
 * today + week + month at once.
 */
export const getMyDashboardStats = asyncHandler(
  async (req, res) => {
    if ( !canPerformDriverWork(
    req.user,
  )) {
      res.status(403);
      throw new Error(
        "Only drivers can access this endpoint"
      );
    }

    const periods = [
      "today",
      "week",
      "month",
    ];

    const stats = {};

    for (const period of periods) {
      const {
        start,
        end,
      } = getPeriodRange(period);

      const [
        orders,
        workedSeconds,
      ] = await Promise.all([
        getDriverOrderStats(
          req.user._id,
          start,
          end
        ),

        getDriverWorkedSeconds(
          req.user._id,
          start,
          end
        ),
      ]);

      stats[period] = {
        orders,

        work: {
          totalSeconds:
            workedSeconds,

          totalHours: Number(
            (
              workedSeconds / 3600
            ).toFixed(2)
          ),
        },
      };
    }

    const activeShift =
      await DriverShift.findOne({
        driver: req.user._id,
        status: "active",
      }).select(
        "_id startedAt"
      );

    res.json({
      success: true,

      timezone: TIME_ZONE,

      activeShift: activeShift
        ? {
            id: activeShift._id,
            startedAt:
              activeShift.startedAt,
          }
        : null,

      stats,
    });
  }
);


export const getSupervisorDashboard =
  asyncHandler(async (req, res) => {
    if (
      req.user.role !==
      "supervisor"
    ) {
      res.status(403);

      throw new Error(
        "Only supervisors can access this endpoint",
      );
    }

    /*
     * Load actual managed drivers only.
     *
     * Supervisor's own driver-mode shift
     * must NOT increase driver counts.
     */
    const managedDrivers =
      await User.find({
        role: "driver",

        supervisor:
          req.user._id,
      })
        .select(
          "_id isActive",
        )
        .lean();

    const managedDriverIds =
      managedDrivers.map(
        (driver) =>
          driver._id,
      );

    const totalDrivers =
      managedDrivers.length;

    const activeDrivers =
      managedDrivers.filter(
        (driver) =>
          driver.isActive ===
          true,
      ).length;

    const inactiveDrivers =
      totalDrivers -
      activeDrivers;

    /*
     * Working-now count should include
     * only actual managed drivers.
     *
     * Supervisor's own driver-mode
     * shift is intentionally excluded
     * from this count.
     */
    const activeShifts =
      managedDriverIds.length > 0
        ? await DriverShift.countDocuments({
            driver: {
              $in:
                managedDriverIds,
            },

            status:
              "active",
          })
        : 0;

    const periods = [
      "today",
      "week",
      "month",
    ];

    const stats = {};

    for (
      const period of
      periods
    ) {
      const {
        start,
        end,
      } =
        getPeriodRange(
          period,
        );

      /*
       * Team order statistics.
       *
       * This includes:
       * - orders from managed drivers
       * - supervisor's own orders when
       *   using driver mode
       *
       * because both use:
       * supervisor = req.user._id
       */
      const orderStats =
        await Order.aggregate([
          {
            $match: {
              supervisor:
                req.user._id,

              createdAt: {
                $gte:
                  start,

                $lte:
                  end,
              },
            },
          },

          {
            $group: {
              _id:
                "$status",

              count: {
                $sum: 1,
              },
            },
          },
        ]);

      let totalOrders = 0;

      let pickedUp = 0;

      let delivered = 0;

      let cancelled = 0;

      for (
        const item of
        orderStats
      ) {
        totalOrders +=
          item.count;

        if (
          item._id ===
          "picked_up"
        ) {
          pickedUp =
            item.count;
        }

        if (
          item._id ===
          "delivered"
        ) {
          delivered =
            item.count;
        }

        if (
          item._id ===
          "cancelled"
        ) {
          cancelled =
            item.count;
        }
      }

      /*
       * Team work statistics.
       *
       * This intentionally includes:
       * - managed drivers
       * - supervisor's own driver-mode
       *   shifts
       *
       * because both have:
       * supervisor = req.user._id
       */
      const shifts =
        await DriverShift.find({
          supervisor:
            req.user._id,

          startedAt: {
            $lt:
              end,
          },

          $or: [
            {
              endedAt: {
                $gt:
                  start,
              },
            },

            {
              status:
                "active",

              endedAt:
                null,
            },
          ],
        }).select(
          "startedAt endedAt status",
        );

      const now =
        new Date();

      let totalWorkedSeconds =
        0;

      for (
        const shift of
        shifts
      ) {
        const effectiveEnd =
          shift.status ===
          "active"
            ? now
            : shift.endedAt;

        if (
          !effectiveEnd
        ) {
          continue;
        }

        totalWorkedSeconds +=
          getShiftOverlapSeconds(
            shift.startedAt,
            effectiveEnd,
            start,
            end,
          );
      }

      stats[period] = {
        orders: {
          total:
            totalOrders,

          pickedUp,

          delivered,

          cancelled,
        },

        work: {
          totalSeconds:
            totalWorkedSeconds,

          totalHours:
            Number(
              (
                totalWorkedSeconds /
                3600
              ).toFixed(
                2,
              ),
            ),
        },
      };
    }

    res.json({
      success: true,

      timezone:
        TIME_ZONE,

      drivers: {
        total:
          totalDrivers,

        active:
          activeDrivers,

        inactive:
          inactiveDrivers,

        workingNow:
          activeShifts,
      },

      stats,
    });
  });

export const getDriverStats =
  asyncHandler(async (req, res) => {
    if (
      req.user.role !== "supervisor"
    ) {
      res.status(403);
      throw new Error(
        "Only supervisors can access driver statistics"
      );
    }

    /**
     * Ownership check.
     *
     * Supervisor can only access
     * their own driver.
     */
    const driver =
      await User.findOne({
        _id: req.params.driverId,
        role: "driver",
        supervisor:
          req.user._id,
      }).select(
        "name iqamaId phone isActive lastLoginAt"
      );

    if (!driver) {
      res.status(404);
      throw new Error(
        "Driver not found"
      );
    }

    const period =
      req.query.period || "today";

    const {
      start,
      end,
    } = getPeriodRange(period);

    const [
      orders,
      workedSeconds,
      activeShift,
    ] = await Promise.all([
      getDriverOrderStats(
        driver._id,
        start,
        end
      ),

      getDriverWorkedSeconds(
        driver._id,
        start,
        end
      ),

      DriverShift.findOne({
        driver: driver._id,
        status: "active",
      }).select(
        "_id startedAt"
      ),
    ]);

    res.json({
      success: true,

      period,

      timezone: TIME_ZONE,

      driver,

      orders,

      work: {
        totalSeconds:
          workedSeconds,

        totalHours: Number(
          (
            workedSeconds / 3600
          ).toFixed(2)
        ),

        activeShift: activeShift
          ? {
              id: activeShift._id,
              startedAt:
                activeShift.startedAt,
            }
          : null,
      },
    });
  });



export const getSupervisorRangeStats =
  asyncHandler(async (req, res) => {
    if (
      req.user.role !==
      "supervisor"
    ) {
      res.status(403);

      throw new Error(
        "Only supervisors can access this endpoint",
      );
    }

    const {
      from,
      to,
      driverId,
    } = req.query;

    const {
      start,
      end,
    } = getCustomRange(
      from,
      to,
    );

    /*
     * SELECTED DELIVERY USER
     *
     * Can be:
     * 1. A managed driver
     * 2. The supervisor themselves
     *    when canDeliverOrders === true
     */
    let driver = null;

    if (driverId) {
      const requestedDriverId =
        String(driverId);

      const supervisorId =
        req.user._id.toString();

      const isSupervisorSelf =
        requestedDriverId ===
        supervisorId;

      if (isSupervisorSelf) {
        if (
          req.user
            .canDeliverOrders !==
          true
        ) {
          res.status(403);

          throw new Error(
            "Supervisor is not allowed to perform driver work",
          );
        }

        /*
         * Fetch the supervisor so the
         * returned object has the same
         * shape as a selected driver.
         */
        driver =
          await User.findById(
            req.user._id,
          ).select(
            "name iqamaId phone isActive lastLoginAt role canDeliverOrders",
          );

        if (!driver) {
          res.status(404);

          throw new Error(
            "User not found",
          );
        }
      } else {
        /*
         * Normal managed driver.
         */
        driver =
          await User.findOne({
            _id:
              requestedDriverId,

            role:
              "driver",

            supervisor:
              req.user._id,
          }).select(
            "name iqamaId phone isActive lastLoginAt role",
          );

        if (!driver) {
          res.status(404);

          throw new Error(
            "Driver not found",
          );
        }
      }
    }

    /*
     * ORDER FILTER
     *
     * Whole team:
     * supervisor = logged-in supervisor
     *
     * This intentionally includes
     * supervisor's own delivery work,
     * because supervisor-as-driver
     * orders also use:
     *
     * supervisor = supervisor._id
     *
     * Specific delivery user:
     * rider = selected user _id
     */
    const orderMatch = {
      supervisor:
        req.user._id,

      createdAt: {
        $gte:
          start,

        $lte:
          end,
      },
    };

    if (driver) {
      orderMatch.rider =
        driver._id;
    }

    const orderStats =
      await Order.aggregate([
        {
          $match:
            orderMatch,
        },

        {
          $group: {
            _id:
              "$status",

            count: {
              $sum:
                1,
            },
          },
        },
      ]);

    let totalOrders =
      0;

    let pickedUp =
      0;

    let delivered =
      0;

    let cancelled =
      0;

    for (
      const item of
      orderStats
    ) {
      totalOrders +=
        item.count;

      if (
        item._id ===
        "picked_up"
      ) {
        pickedUp =
          item.count;
      }

      if (
        item._id ===
        "delivered"
      ) {
        delivered =
          item.count;
      }

      if (
        item._id ===
        "cancelled"
      ) {
        cancelled =
          item.count;
      }
    }

    /*
     * SHIFT FILTER
     *
     * Whole team:
     * all shifts owned by this
     * supervisor, including their
     * own delivery shifts.
     *
     * Selected delivery user:
     * filter by driver _id.
     */
    const shiftMatch = {
      supervisor:
        req.user._id,

      startedAt: {
        $lt:
          end,
      },

      $or: [
        {
          endedAt: {
            $gt:
              start,
          },
        },

        {
          status:
            "active",

          endedAt:
            null,
        },
      ],
    };

    if (driver) {
      shiftMatch.driver =
        driver._id;
    }

    const shifts =
      await DriverShift.find(
        shiftMatch,
      ).select(
        "driver startedAt endedAt status",
      );

    const now =
      new Date();

    let totalWorkedSeconds =
      0;

    for (
      const shift of
      shifts
    ) {
      const effectiveEnd =
        shift.status ===
        "active"
          ? now
          : shift.endedAt;

      if (!effectiveEnd) {
        continue;
      }

      totalWorkedSeconds +=
        getShiftOverlapSeconds(
          shift.startedAt,
          effectiveEnd,
          start,
          end,
        );
    }

    /*
     * DRIVER SUMMARY
     */
    let driverSummary;

    if (driver) {
      const activeShift =
        await DriverShift.findOne({
          driver:
            driver._id,

          status:
            "active",
        }).select(
          "_id startedAt",
        );

      const isSupervisorSelf =
        driver._id.toString() ===
        req.user._id.toString();

      driverSummary = {
        mode:
          "driver",

        driver,

        isSupervisorSelf,

        workingNow:
          !!activeShift,
      };
    } else {
      /*
       * Managed driver count should NOT
       * include the supervisor themselves.
       */
      const managedDrivers =
        await User.find({
          role:
            "driver",

          supervisor:
            req.user._id,
        })
          .select(
            "_id isActive",
          )
          .lean();

      const managedDriverIds =
        managedDrivers.map(
          (driver) =>
            driver._id,
        );

      const totalDrivers =
        managedDrivers.length;

      const activeDrivers =
        managedDrivers.filter(
          (driver) =>
            driver.isActive ===
            true,
        ).length;

      const inactiveDrivers =
        totalDrivers -
        activeDrivers;

      /*
       * Working Now here represents
       * managed drivers only.
       *
       * Supervisor working as driver
       * is intentionally not counted
       * as one of their own drivers.
       */
      const workingNow =
        managedDriverIds.length >
        0
          ? await DriverShift.countDocuments(
              {
                driver: {
                  $in:
                    managedDriverIds,
                },

                status:
                  "active",
              },
            )
          : 0;

      driverSummary = {
        mode:
          "team",

        total:
          totalDrivers,

        active:
          activeDrivers,

        inactive:
          inactiveDrivers,

        workingNow,
      };
    }

    res.json({
      success:
        true,

      timezone:
        TIME_ZONE,

      range: {
        from,
        to,
        start,
        end,
      },

      scope:
        driver
          ? "driver"
          : "team",

      drivers:
        driverSummary,

      orders: {
        total:
          totalOrders,

        pickedUp,

        delivered,

        cancelled,
      },

      work: {
        totalSeconds:
          totalWorkedSeconds,

        totalHours:
          Number(
            (
              totalWorkedSeconds /
              3600
            ).toFixed(2),
          ),
      },
    });
  });


  /**
 * SUPERVISOR
 *
 * Get per-driver dashboard stats.
 *
 * Returns for every managed driver:
 * - delivered today
 * - delivered current month
 * - first shift start today
 * - last completed shift finish today
 * - total working seconds today
 * - working now
 */
export const getSupervisorDriversDashboard =
  asyncHandler(async (req, res) => {
    if (
      req.user.role !==
      "supervisor"
    ) {
      res.status(403);

      throw new Error(
        "Only supervisors can access this endpoint"
      );
    }

    /*
     * Load ALL managed drivers.
     *
     * Important:
     * Even a driver with:
     * - zero orders
     * - zero shifts
     *
     * must still appear in the response.
     */
    const drivers =
      await User.find({
        role:
          "driver",

        supervisor:
          req.user._id,
      })
        .select(
          "_id name shortName iqamaId phone isActive lastLoginAt canDeliverOrders profilePicture vehicleType",
        )
        .lean();

    if (
      drivers.length === 0
    ) {
      return res.json({
        success: true,

        timezone:
          TIME_ZONE,

        drivers: [],
      });
    }

    const driverIds =
      drivers.map(
        (driver) =>
          driver._id
      );

    /*
     * Riyadh ranges.
     */
    const today =
      getPeriodRange(
        "today"
      );

    const month =
      getPeriodRange(
        "month"
      );

    const now =
      new Date();

    /*
     * =====================================================
     * ORDERS
     * =====================================================
     *
     * IMPORTANT:
     *
     * We use deliveryTime here,
     * NOT createdAt.
     *
     * The dashboard specifically asks:
     * "How many orders were DELIVERED today/month?"
     */
    const orderStats =
      await Order.aggregate([
        {
          $match: {
            supervisor:
              req.user._id,

            rider: {
              $in:
                driverIds,
            },

            status:
              "delivered",

            deliveryTime: {
              $ne: null,

              $gte:
                month.start,

              $lte:
                month.end,
            },
          },
        },

        {
          $group: {
            _id:
              "$rider",

            deliveredThisMonth: {
              $sum: 1,
            },

            deliveredToday: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $gte: [
                          "$deliveryTime",
                          today.start,
                        ],
                      },

                      {
                        $lte: [
                          "$deliveryTime",
                          today.end,
                        ],
                      },
                    ],
                  },

                  1,

                  0,
                ],
              },
            },
          },
        },
      ]);

    /*
     * Make order stats lookup map.
     */
    const orderStatsMap =
      new Map();

    for (
      const item of
      orderStats
    ) {
      orderStatsMap.set(
        item._id.toString(),

        {
          deliveredToday:
            item.deliveredToday ??
            0,

          deliveredThisMonth:
            item.deliveredThisMonth ??
            0,
        }
      );
    }

    /*
     * =====================================================
     * SHIFTS
     * =====================================================
     *
     * Include:
     * - completed shifts overlapping today
     * - active shifts overlapping today
     *
     * This also supports overnight shifts.
     */
    const shifts =
      await DriverShift.find({
        driver: {
          $in:
            driverIds,
        },

        startedAt: {
          $lt:
            today.end,
        },

        $or: [
          {
            endedAt: {
              $gt:
                today.start,
            },
          },

          {
            status:
              "active",

            endedAt:
              null,
          },
        ],
      })
        .select(
          "driver startedAt endedAt status"
        )
        .sort({
          startedAt:
            1,
        })
        .lean();

    const shiftStatsMap =
      new Map();

    for (
      const shift of
      shifts
    ) {
      const driverId =
        shift.driver.toString();

      if (
        !shiftStatsMap.has(
          driverId
        )
      ) {
        shiftStatsMap.set(
          driverId,
          {
            firstShiftStartedAt:
              null,

            lastShiftEndedAt:
              null,

            totalSeconds:
              0,

            workingNow:
              false,
          }
        );
      }

      const stats =
        shiftStatsMap.get(
          driverId
        );

      /*
       * For overnight shifts:
       *
       * Started yesterday 23:00
       * Still working today 01:00
       *
       * dashboard start should effectively
       * be today's midnight for today's stats.
       */
      const effectiveStart =
        new Date(
          Math.max(
            new Date(
              shift.startedAt
            ).getTime(),

            today.start.getTime()
          )
        );

      if (
        !stats.firstShiftStartedAt ||
        effectiveStart.getTime() <
          new Date(
            stats.firstShiftStartedAt
          ).getTime()
      ) {
        stats.firstShiftStartedAt =
          effectiveStart;
      }

      /*
       * Active shift continues until now.
       */
      const effectiveEnd =
        shift.status ===
        "active"
          ? now
          : shift.endedAt;

      if (
        effectiveEnd
      ) {
        stats.totalSeconds +=
          getShiftOverlapSeconds(
            shift.startedAt,

            effectiveEnd,

            today.start,

            today.end
          );
      }

      /*
       * Only completed shift has
       * an actual finish time.
       */
      if (
        shift.endedAt
      ) {
        const endedAt =
          new Date(
            shift.endedAt
          );

        if (
          endedAt >=
            today.start &&
          endedAt <=
            today.end
        ) {
          if (
            !stats.lastShiftEndedAt ||
            endedAt.getTime() >
              new Date(
                stats.lastShiftEndedAt
              ).getTime()
          ) {
            stats.lastShiftEndedAt =
              endedAt;
          }
        }
      }

      if (
        shift.status ===
        "active"
      ) {
        stats.workingNow =
          true;
      }
    }

    /*
     * =====================================================
     * MERGE DRIVER + ORDERS + SHIFTS
     * =====================================================
     */
    const dashboardDrivers =
      drivers.map(
        (driver) => {
          const driverId =
            driver._id.toString();

          const orders =
            orderStatsMap.get(
              driverId
            ) ?? {
              deliveredToday:
                0,

              deliveredThisMonth:
                0,
            };

          const work =
            shiftStatsMap.get(
              driverId
            ) ?? {
              firstShiftStartedAt:
                null,

              lastShiftEndedAt:
                null,

              totalSeconds:
                0,

              workingNow:
                false,
            };

          return {
            driver: {
              _id:
                driver._id,

              name:
                driver.name,

              shortName:
                driver.shortName,

              iqamaId:
                driver.iqamaId,

              phone:
                driver.phone ??
                null,

               profilePicture:
                  driver.profilePicture ?? null,

              isActive:
                driver.isActive,

              lastLoginAt:
                driver.lastLoginAt ??
                null,

              canDeliverOrders:
                driver.canDeliverOrders ===
                true,
            },

            orders: {
              deliveredToday:
                orders.deliveredToday,

              deliveredThisMonth:
                orders.deliveredThisMonth,
            },

            todayWork: {
              firstShiftStartedAt:
                work.firstShiftStartedAt,

              lastShiftEndedAt:
                work.lastShiftEndedAt,

              totalSeconds:
                work.totalSeconds,

              totalHours:
                Number(
                  (
                    work.totalSeconds /
                    3600
                  ).toFixed(
                    2
                  )
                ),

              workingNow:
                work.workingNow,
            },
          };
        }
      );

    res.json({
      success:
        true,

      timezone:
        TIME_ZONE,

      range: {
        today: {
          start:
            today.start,

          end:
            today.end,
        },

        month: {
          start:
            month.start,

          end:
            month.end,
        },
      },

      count:
        dashboardDrivers.length,

      drivers:
        dashboardDrivers,
    });
  });