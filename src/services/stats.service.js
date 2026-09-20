import { DateTime } from "luxon";

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
      start =
        now.startOf("day");

      end =
        now.endOf("day");

      break;

    case "week":
      start =
        now.startOf("week");

      end =
        now.endOf("week");

      break;

    case "month":
      start =
        now.startOf("month");

      end =
        now.endOf("month");

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
      item._id === "picked_up"
    ) {
      pickedUp =
        item.count;
    }
    if (
  item._id === "cancelled"
) {
  cancelled =
    item.count;
}

    if (
      item._id === "delivered"
    ) {
      delivered =
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
            supervisorId,

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