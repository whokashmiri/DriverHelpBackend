// src/services/stats.service.js

import { DateTime } from "luxon";
import mongoose from "mongoose";

import { Order } from "../models/Order.js";
import { DriverShift } from "../models/DriverShift.js";

export const TIME_ZONE =
  "Asia/Riyadh";

function createServiceError(
  message,
  statusCode = 400
) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Returns UTC range representing
 * Riyadh today/week/month.
 */
export function getPeriodRange(
  period
) {
  const now =
    DateTime.now().setZone(
      TIME_ZONE
    );

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

    default:
      throw createServiceError(
        "period must be today, week or month"
      );
  }

  return {
    start:
      start.toUTC().toJSDate(),

    end:
      end.toUTC().toJSDate(),
  };
}

/**
 * Calculate portion of a shift that overlaps
 * the requested reporting range.
 */
export function getShiftOverlapSeconds(
  shiftStart,
  shiftEnd,
  rangeStart,
  rangeEnd
) {
  const start = Math.max(
    new Date(
      shiftStart
    ).getTime(),

    new Date(
      rangeStart
    ).getTime()
  );

  const end = Math.min(
    new Date(
      shiftEnd
    ).getTime(),

    new Date(
      rangeEnd
    ).getTime()
  );

  if (end <= start) {
    return 0;
  }

  return Math.floor(
    (end - start) / 1000
  );
}

/**
 * Get driver worked seconds.
 *
 * Handles:
 * - multiple shifts
 * - overnight shifts
 * - active shift
 */
export async function getDriverWorkedSeconds(
  driverId,
  start,
  end
) {
  const shifts =
    await DriverShift.find({
      driver: driverId,

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

  let totalSeconds = 0;

  for (const shift of shifts) {
    const effectiveEnd =
      shift.status === "active"
        ? now
        : shift.endedAt;

    if (!effectiveEnd) {
      continue;
    }

    totalSeconds +=
      getShiftOverlapSeconds(
        shift.startedAt,
        effectiveEnd,
        start,
        end
      );
  }

  return totalSeconds;
}

/**
 * Driver order statistics.
 *
 * Existing period statistics are based
 * on order creation time.
 */
export async function getDriverOrderStats(
  driverId,
  start,
  end
) {
  const result =
    await Order.aggregate([
      {
        $match: {
          rider:
            new mongoose.Types.ObjectId(
              driverId
            ),

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
      item._id === "picked_up"
    ) {
      pickedUp =
        item.count;
    }

    if (
      item._id === "delivered"
    ) {
      delivered =
        item.count;
    }

    if (
      item._id === "cancelled"
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

/**
 * Supervisor/team order stats.
 */
export async function getSupervisorOrderStats(
  supervisorId,
  start,
  end
) {
  const result =
    await Order.aggregate([
      {
        $match: {
          supervisor:
            new mongoose.Types.ObjectId(
              supervisorId
            ),

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
      item._id === "picked_up"
    ) {
      pickedUp =
        item.count;
    }

    if (
      item._id === "delivered"
    ) {
      delivered =
        item.count;
    }

    if (
      item._id === "cancelled"
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

/**
 * Supervisor/team total working seconds.
 */
export async function getSupervisorWorkedSeconds(
  supervisorId,
  start,
  end
) {
  const shifts =
    await DriverShift.find({
      supervisor:
        supervisorId,

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

  let totalSeconds = 0;

  for (const shift of shifts) {
    const effectiveEnd =
      shift.status === "active"
        ? now
        : shift.endedAt;

    if (!effectiveEnd) {
      continue;
    }

    totalSeconds +=
      getShiftOverlapSeconds(
        shift.startedAt,
        effectiveEnd,
        start,
        end
      );
  }

  return totalSeconds;
}

/**
 * Driver period summary.
 */
export async function getDriverPeriodStats(
  driverId,
  period
) {
  const {
    start,
    end,
  } = getPeriodRange(
    period
  );

  const [
    orders,
    workedSeconds,
  ] = await Promise.all([
    getDriverOrderStats(
      driverId,
      start,
      end
    ),

    getDriverWorkedSeconds(
      driverId,
      start,
      end
    ),
  ]);

  return {
    period,

    range: {
      start,
      end,
      timezone:
        TIME_ZONE,
    },

    orders,

    work: {
      totalSeconds:
        workedSeconds,

      totalHours:
        Number(
          (
            workedSeconds /
            3600
          ).toFixed(2)
        ),
    },
  };
}

/**
 * Supervisor period summary.
 */
export async function getSupervisorPeriodStats(
  supervisorId,
  period
) {
  const {
    start,
    end,
  } = getPeriodRange(
    period
  );

  const [
    orders,
    workedSeconds,
  ] = await Promise.all([
    getSupervisorOrderStats(
      supervisorId,
      start,
      end
    ),

    getSupervisorWorkedSeconds(
      supervisorId,
      start,
      end
    ),
  ]);

  return {
    period,

    range: {
      start,
      end,
      timezone:
        TIME_ZONE,
    },

    orders,

    work: {
      totalSeconds:
        workedSeconds,

      totalHours:
        Number(
          (
            workedSeconds /
            3600
          ).toFixed(2)
        ),
    },
  };
}

/* =========================================================
 * SUPERVISOR DRIVER DASHBOARD
 * ========================================================= */

/**
 * Get dashboard delivery counts for
 * every driver belonging to a supervisor.
 *
 * IMPORTANT:
 * Delivery statistics use deliveryTime,
 * not createdAt.
 */
async function getDashboardOrderStats(
  supervisorId,
  todayStart,
  todayEnd,
  monthStart,
  monthEnd
) {
  const supervisorObjectId =
    new mongoose.Types.ObjectId(
      supervisorId
    );

  const results =
    await Order.aggregate([
      {
        $match: {
          supervisor:
            supervisorObjectId,

          status:
            "delivered",

          deliveryTime: {
            $ne: null,
            $gte: monthStart,
            $lte: monthEnd,
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
                        todayStart,
                      ],
                    },

                    {
                      $lte: [
                        "$deliveryTime",
                        todayEnd,
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

  const map = new Map();

  for (const item of results) {
    map.set(
      String(item._id),
      {
        deliveredToday:
          item.deliveredToday ?? 0,

        deliveredThisMonth:
          item.deliveredThisMonth ?? 0,
      }
    );
  }

  return map;
}

/**
 * Get today's shift information for
 * every driver belonging to supervisor.
 *
 * Handles:
 * - multiple shifts
 * - overnight shifts
 * - active shift
 * - first shift start
 * - last completed shift finish
 * - total actual working time
 */
async function getDashboardShiftStats(
  supervisorId,
  todayStart,
  todayEnd
) {
  const now =
    new Date();

  /**
   * Don't calculate an active shift
   * beyond the end of today's range.
   */
  const effectiveNow =
    now.getTime() <
    todayEnd.getTime()
      ? now
      : todayEnd;

  const shifts =
    await DriverShift.find({
      supervisor:
        supervisorId,

      startedAt: {
        $lt:
          todayEnd,
      },

      $or: [
        {
          endedAt: {
            $gt:
              todayStart,
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
        startedAt: 1,
      })
      .lean();

  const map =
    new Map();

  for (
    const shift
    of shifts
  ) {
    const driverId =
      String(
        shift.driver
      );

    if (
      !map.has(
        driverId
      )
    ) {
      map.set(
        driverId,
        {
          firstShiftStartedAt:
            null,

          lastShiftEndedAt:
            null,

          totalSeconds:
            0,

          isWorking:
            false,
        }
      );
    }

    const stats =
      map.get(
        driverId
      );

    /**
     * First shift start shown for today's
     * work.
     *
     * If an overnight shift began yesterday,
     * today's effective work begins at
     * todayStart.
     */
    const effectiveStart =
      new Date(
        Math.max(
          new Date(
            shift.startedAt
          ).getTime(),

          todayStart.getTime()
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

    /**
     * Active shift uses current time.
     */
    const effectiveEnd =
      shift.status ===
      "active"
        ? effectiveNow
        : shift.endedAt;

    if (
      effectiveEnd
    ) {
      stats.totalSeconds +=
        getShiftOverlapSeconds(
          shift.startedAt,
          effectiveEnd,
          todayStart,
          todayEnd
        );
    }

    /**
     * Last finish should represent
     * the last completed shift.
     *
     * Active shift has no finished time yet.
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
          todayStart &&
        endedAt <=
          todayEnd
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
      stats.isWorking =
        true;
    }
  }

  return map;
}

/**
 * Get dashboard statistics for all drivers
 * under the logged-in supervisor.
 *
 * One service call supports all dashboard rows.
 */
export async function getSupervisorDriversDashboardStats(
  supervisorId
) {
  if (
    !supervisorId
  ) {
    throw createServiceError(
      "Supervisor ID is required"
    );
  }

  const todayRange =
    getPeriodRange(
      "today"
    );

  const monthRange =
    getPeriodRange(
      "month"
    );

  const [
    orderStats,
    shiftStats,
  ] =
    await Promise.all([
      getDashboardOrderStats(
        supervisorId,

        todayRange.start,
        todayRange.end,

        monthRange.start,
        monthRange.end
      ),

      getDashboardShiftStats(
        supervisorId,

        todayRange.start,
        todayRange.end
      ),
    ]);

  /**
   * Create a combined set of driver IDs
   * appearing in either orders or shifts.
   */
  const driverIds =
    new Set([
      ...orderStats.keys(),
      ...shiftStats.keys(),
    ]);

  const drivers =
    Array.from(
      driverIds
    ).map(
      (
        driverId
      ) => {
        const orders =
          orderStats.get(
            driverId
          ) ?? {
            deliveredToday:
              0,

            deliveredThisMonth:
              0,
          };

        const work =
          shiftStats.get(
            driverId
          ) ?? {
            firstShiftStartedAt:
              null,

            lastShiftEndedAt:
              null,

            totalSeconds:
              0,

            isWorking:
              false,
          };

        return {
          driverId,

          orders,

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
                ).toFixed(2)
              ),

            isWorking:
              work.isWorking,
          },
        };
      }
    );

  return {
    timezone:
      TIME_ZONE,

    ranges: {
      today: {
        start:
          todayRange.start,

        end:
          todayRange.end,
      },

      month: {
        start:
          monthRange.start,

        end:
          monthRange.end,
      },
    },

    drivers,
  };
}