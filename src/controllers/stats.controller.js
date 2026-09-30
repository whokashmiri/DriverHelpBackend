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

 
    let driver = null;

    if (driverId) {
      driver =
        await User.findOne({
          _id: driverId,

          role: "driver",

          supervisor:
            req.user._id,
        }).select(
          "name iqamaId phone isActive lastLoginAt",
        );

      if (!driver) {
        res.status(404);

        throw new Error(
          "Driver not found",
        );
      }
    }

    /*
     * ORDER FILTER
     *
     * Whole team:
     * supervisor = logged-in supervisor
     *
     * Specific driver:
     * supervisor = logged-in supervisor
     * rider = selected driver
     */
    const orderMatch = {
      supervisor:
        req.user._id,

      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (driver) {
      orderMatch.rider =
        driver._id;
    }

    const orderStats =
      await Order.aggregate([
        {
          $match: orderMatch,
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
    let cancelled = 0;

    for (
      const item of orderStats
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

   
    const shiftMatch = {
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

    const now = new Date();

    let totalWorkedSeconds = 0;

    for (
      const shift of shifts
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
     * Driver summary.
     *
     * For team range we can show
     * total team drivers.
     *
     * For selected driver we return
     * only that driver.
     */
    let driverSummary;

    if (driver) {
      const activeShift =
        await DriverShift.findOne({
          driver: driver._id,

          status: "active",
        }).select(
          "_id startedAt",
        );

      driverSummary = {
        mode: "driver",

        driver,

        workingNow:
          !!activeShift,
      };
 } else {
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

  const workingNow =
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
      success: true,

      timezone:
        TIME_ZONE,

      range: {
        from,

        to,

        start,

        end,
      },

      scope: driver
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