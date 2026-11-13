
import { User } from "../models/User.js";
import { DriverShift } from "../models/DriverShift.js";
import {
  NotificationReminder,
} from "../models/NotificationReminder.js";

import {
  sendPushToDriver,
} from "./push.service.js";

const RIYADH_TIME_ZONE = "Asia/Riyadh";
const RIYADH_OFFSET = "+03:00";

const FOURTEEN_HOURS_MS =
  14 * 60 * 60 * 1000;

// const FOURTEEN_HOURS_MS =
//   5 * 60 * 1000;

function getRiyadhDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: RIYADH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  ).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  return {
    date:
      `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function getRiyadhDayBounds(dateKey) {
  const start = new Date(
    `${dateKey}T00:00:00${RIYADH_OFFSET}`,
  );

  const end = new Date(
    start.getTime() + 24 * 60 * 60 * 1000,
  );

  return { start, end };
}

function hasPushTokens(driver) {
  return (
    Array.isArray(driver?.pushTokens) &&
    driver.pushTokens.length > 0
  );
}

/*
 * Create one reminder record.
 *
 * The unique MongoDB index makes this
 * safe across multiple server processes.
 */
async function createReminderOnce({
  driverId,
  type,
  referenceKey,
  shiftId = null,
}) {
  try {
    return await NotificationReminder.create({
      driver: driverId,
      type,
      referenceKey,
      shift: shiftId,
      status: "processing",
      attempts: 1,
      lastAttemptAt: new Date(),
      lockedUntil: new Date(
        Date.now() + 5 * 60 * 1000,
      ),
    });
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }

    throw error;
  }
}

async function finishReminder(
  reminder,
  result,
) {
  const submitted =
    result.pushTickets.length > 0;

  await NotificationReminder.updateOne(
    { _id: reminder._id },
    {
      $set: {
        status:
          submitted ? "submitted" : "failed",

        submittedAt:
          submitted ? new Date() : null,

        pushTickets: result.pushTickets,
        pushTicketIds: result.pushTicketIds,

        lockedUntil: null,

        lastError: submitted
          ? null
          : "No push tickets were accepted",
      },
    },
  );

  return submitted;
}

async function failReminder(reminder, error) {
  await NotificationReminder.updateOne(
    { _id: reminder._id },
    {
      $set: {
        status: "failed",
        lockedUntil: null,
        lastError:
          String(error?.message || error)
            .slice(0, 500),
      },
    },
  );
}

/*
 * 7:00 AM reminder.
 *
 * The job can run during the 7 AM hour.
 * The unique reminder key prevents
 * sending a second notification.
 */
export async function processMorningReminders(
  now = new Date(),
) {
  const riyadh = getRiyadhDateTime(now);

  if (riyadh.hour !== 7) {
    return;
  }

  const { start, end } =
    getRiyadhDayBounds(riyadh.date);

  const drivers = User.find({
    role: "driver",
    isActive: true,
    "pushTokens.0": { $exists: true },
  }).select("+pushTokens");

  for await (const driver of drivers.cursor()) {
    try {
      if (!hasPushTokens(driver)) {
        continue;
      }

      // A shift that began yesterday may
      // still be active today.
      const activeShift =
        await DriverShift.exists({
          driver: driver._id,
          status: "active",
        });

      if (activeShift) {
        continue;
      }

      // No reminder if the driver has
      // already started a shift today,
      // even if that shift is completed.
      const startedToday =
        await DriverShift.exists({
          driver: driver._id,
          startedAt: {
            $gte: start,
            $lt: end,
          },
        });

      if (startedToday) {
        continue;
      }

     
 const reminder =
  await createReminderOnce({
    driverId: driver._id,
    type: "shift_not_started",
    referenceKey: riyadh.date,
  });

      if (!reminder) {
        continue;
      }

      try {
        // Recheck immediately before send.
        const shiftExists =
          await DriverShift.exists({
            driver: driver._id,
            $or: [
              { status: "active" },
              {
                startedAt: {
                  $gte: start,
                  $lt: end,
                },
              },
            ],
          });

        if (shiftExists) {
          await failReminder(
            reminder,
            new Error(
              "Skipped: driver has started a shift",
            ),
          );
          continue;
        }

        const result =
          await sendPushToDriver({
            driver,
            title: "ابدأ مناوبتك",
            body:
            "صباح الخير! لم تبدأ مناوبتك بعد. يرجى بدء المناوبة.",
            data: {
              type: "shift_not_started",
              date: riyadh.date,
            },
          });

        await finishReminder(reminder, result);
      } catch (error) {
        await failReminder(reminder, error);
        console.error(
          "[REMINDER] Morning send failed:",
          error,
        );
      }
    } catch (error) {
      console.error(
        "[REMINDER] Morning driver error:",
        String(driver._id),
        error,
      );
    }
  }
}

/*
 * 14-hour reminder.
 *
 * Each active shift is independently
 * eligible once it reaches 14 hours.
 */
export async function processOverdueReminders(
  now = new Date(),
) {
  const cutoff = new Date(
    now.getTime() - FOURTEEN_HOURS_MS,
  );

  const shifts = DriverShift.find({
    status: "active",
    startedAt: { $lte: cutoff },
  });

  for await (const shift of shifts.cursor()) {
    try {
      const driver = await User.findOne({
        _id: shift.driver,
        role: "driver",
        isActive: true,
      }).select("+pushTokens");

      if (!driver || !hasPushTokens(driver)) {
        continue;
      }

      const reminder =
        await createReminderOnce({
          driverId: driver._id,
          type: "shift_overdue",
          referenceKey: String(shift._id),
          shiftId: shift._id,
        });

      if (!reminder) {
        continue;
      }

      try {
        // Recheck the exact shift.
        const stillActive =
          await DriverShift.exists({
            _id: shift._id,
            driver: driver._id,
            status: "active",
            startedAt: {
              $lte: cutoff,
            },
          });

        if (!stillActive) {
          await failReminder(
            reminder,
            new Error(
              "Skipped: shift already ended",
            ),
          );
          continue;
        }

        const result =
          await sendPushToDriver({
            driver,
            title: "Shift Reminder",
            body:
              "Your shift has been active for 14 hours. Please end your shift when you've finished working.",
            data: {
              type: "shift_overdue",
              shiftId: String(shift._id),
            },
          });

        const submitted =
          await finishReminder(reminder, result);

        if (submitted) {
          await DriverShift.updateOne(
            { _id: shift._id },
            {
              $set: {
                fourteenHourReminderSentAt:
                  new Date(),
              },
            },
          );
        }
      } catch (error) {
        await failReminder(reminder, error);
        console.error(
          "[REMINDER] Overdue send failed:",
          error,
        );
      }
    } catch (error) {
      console.error(
        "[REMINDER] Overdue shift error:",
        String(shift._id),
        error,
      );
    }
  }
}
