
import {
  NotificationReminder,
} from "../models/NotificationReminder.js";

import {
  processMorningReminders,
  processOverdueReminders,
} from "./shiftReminder.service.js";

import {
  checkPushReceipts,
} from "./push.service.js";

const CHECK_INTERVAL_MS = 60 * 1000;

let intervalId = null;
let running = false;
let stopped = true;

async function processReceipts() {
  const now = new Date();

  // Expo recommends checking about
  // 15 minutes after submission.
  const cutoff = new Date(
    now.getTime() - 15 * 60 * 1000,
  );

  const earliest = new Date(
    now.getTime() - 23 * 60 * 60 * 1000,
  );

  const reminders =
    await NotificationReminder.find({
      status: "submitted",
      receiptsCheckedAt: null,
      submittedAt: {
        $lte: cutoff,
        $gte: earliest,
      },
      "pushTickets.0": {
        $exists: true,
      },
    }).limit(100);

  for (const reminder of reminders) {
    try {
     const missingReceipts =
  await checkPushReceipts(reminder.pushTickets);

if (missingReceipts > 0) {
  continue;
}

      await NotificationReminder.updateOne(
        {
          _id: reminder._id,
          receiptsCheckedAt: null,
        },
        {
          $set: {
            receiptsCheckedAt: new Date(),
          },
        },
      );
    } catch (error) {
      console.error(
        "[REMINDER] Receipt check failed:",
        reminder._id,
        error,
      );
    }
  }
}

async function runSchedulerCycle() {
  if (running || stopped) {
    return;
  }

  running = true;

  try {
    await processMorningReminders();
    await processOverdueReminders();
    await processReceipts();
  } catch (error) {
    console.error(
      "[REMINDER] Scheduler cycle failed:",
      error,
    );
  } finally {
    running = false;
  }
}

export function startNotificationScheduler() {
  if (intervalId) {
    return;
  }

  stopped = false;

  console.log(
    "[REMINDER] Notification scheduler started",
  );

  // Check immediately after startup.
  void runSchedulerCycle();

  intervalId = setInterval(() => {
    void runSchedulerCycle();
  }, CHECK_INTERVAL_MS);
}

export function stopNotificationScheduler() {
  stopped = true;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log(
    "[REMINDER] Notification scheduler stopped",
  );
}
