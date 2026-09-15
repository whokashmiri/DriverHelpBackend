// controllers/stats.controller.js

import { DateTime } from "luxon";

import { Order } from "../models/Order.js";
import { DriverShift } from "../models/DriverShift.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const TIME_ZONE = "Asia/Riyadh";

/**
 * Build today/week/month boundaries in Riyadh,
 * then convert them to UTC Dates for MongoDB.
 */
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


/**
 * Calculates how many seconds of a shift overlap
 * a requested time range.
 *
 * Important for overnight shifts.
 */
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


/**
 * Get total worked seconds for one driver
 * inside a particular date range.
 */
async function getDriverWorkedSeconds(
  driverId,
  start,
  end
) {
  /**
   * Find any shift that overlaps the reporting range.
   *
   * Shift:
   *
   * startedAt < rangeEnd
   * AND
   * endedAt > rangeStart
   */
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

  /**
   * Include active shift as well.
   */
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


/**
 * Count orders for one driver.
 */
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

  for (const item of result) {
    total += item.count;

    if (item._id === "picked_up") {
      pickedUp = item.count;
    }

    if (item._id === "delivered") {
      delivered = item.count;
    }
  }

  return {
    total,
    pickedUp,
    delivered,
  };
}


/**
 * DRIVER
 *
 * Get own statistics.
 *
 * GET /stats/me?period=today
 * GET /stats/me?period=week
 * GET /stats/me?period=month
 */
export const getMyStats = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "driver") {
      res.status(403);
      throw new Error(
        "Only drivers can access this endpoint"
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
    if (req.user.role !== "driver") {
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


/**
 * SUPERVISOR
 *
 * Overall supervisor/team dashboard.
 */
export const getSupervisorDashboard =
  asyncHandler(async (req, res) => {
    if (
      req.user.role !== "supervisor"
    ) {
      res.status(403);
      throw new Error(
        "Only supervisors can access this endpoint"
      );
    }

    const [
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      activeShifts,
    ] = await Promise.all([
      User.countDocuments({
        role: "driver",
        supervisor: req.user._id,
      }),

      User.countDocuments({
        role: "driver",
        supervisor: req.user._id,
        isActive: true,
      }),

      User.countDocuments({
        role: "driver",
        supervisor: req.user._id,
        isActive: false,
      }),

      DriverShift.countDocuments({
        supervisor: req.user._id,
        status: "active",
      }),
    ]);

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

      /**
       * Order statistics for supervisor.
       */
      const orderStats =
        await Order.aggregate([
          {
            $match: {
              supervisor:
                req.user._id,

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

      let totalOrders = 0;
      let pickedUp = 0;
      let delivered = 0;

      for (const item of orderStats) {
        totalOrders += item.count;

        if (
          item._id === "picked_up"
        ) {
          pickedUp = item.count;
        }

        if (
          item._id === "delivered"
        ) {
          delivered = item.count;
        }
      }

      /**
       * Fetch shifts that overlap this
       * reporting period.
       */
      const shifts =
        await DriverShift.find({
          supervisor:
            req.user._id,

          startedAt: {
            $lt: end,
          },

          $or: [
            {
              endedAt: {
                $gt: start,
              },
            },

            {
              status: "active",
              endedAt: null,
            },
          ],
        }).select(
          "startedAt endedAt status"
        );

      const now = new Date();

      let totalWorkedSeconds = 0;

      for (const shift of shifts) {
        const effectiveEnd =
          shift.status === "active"
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
            end
          );
      }

      stats[period] = {
        orders: {
          total: totalOrders,
          pickedUp,
          delivered,
        },

        work: {
          totalSeconds:
            totalWorkedSeconds,

          totalHours: Number(
            (
              totalWorkedSeconds /
              3600
            ).toFixed(2)
          ),
        },
      };
    }

    res.json({
      success: true,

      timezone: TIME_ZONE,

      drivers: {
        total: totalDrivers,
        active: activeDrivers,
        inactive: inactiveDrivers,

        /**
         * Number currently working,
         * not Socket.IO online status.
         */
        workingNow:
          activeShifts,
      },

      stats,
    });
  });


/**
 * SUPERVISOR
 *
 * Get one driver's statistics.
 *
 * GET /stats/drivers/:driverId?period=today
 */
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