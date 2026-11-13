
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { sendPushToDriver } from "./push.service.js";

const TIME_ZONE = "Asia/Riyadh";

function isEnabled() {
  return (
    String(
      process.env.NOTIFICATION_SUPERVISOR_SHIFT ?? "false"
    ).toLowerCase() === "true"
  );
}

function getId(value) {
  if (!value) return null;
  return String(value._id ?? value);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor(
    Math.max(0, seconds) / 60
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

async function getRecipients(shift) {
  const driverId = getId(shift.driver);

  if (!driverId) return null;

  const driver = await User.findById(driverId).select(
    "name shortName role supervisor"
  );

  if (!driver) return null;

  const supervisorId =
    getId(shift.supervisor) ||
    getId(driver.supervisor);

  if (!supervisorId) return null;

  // Do not send a supervisor notification to themselves.
  if (supervisorId === getId(driver._id)) {
    return null;
  }

  const supervisor = await User.findOne({
    _id: supervisorId,
    role: "supervisor",
    isActive: true,
  }).select("name +pushTokens");

  if (!supervisor) return null;

  return {
    driver,
    supervisor,
    driverName:
      driver.shortName || driver.name || "Driver",
  };
}

async function sendSupervisorNotification({
  supervisor,
  title,
  body,
  data,
}) {
  const result = await sendPushToDriver({
    driver: supervisor,
    title,
    body,
    data,
  });

  console.log("[SHIFT PUSH] Result:", {
    supervisorId: String(supervisor._id),
    attempted: result.attempted,
    accepted: result.pushTicketIds.length,
    type: data.type,
  });
}

/**
 * Called only after the shift is successfully created.
 */
export async function notifySupervisorShiftStarted(shift) {
  if (!isEnabled()) return;
  if (!shift?._id || shift.status !== "active") return;

  const recipients = await getRecipients(shift);

  if (!recipients) return;

  const { supervisor, driverName } = recipients;

  const startTime = formatTime(shift.startedAt);

  await sendSupervisorNotification({
    supervisor,
     title: "بدأ السائق مناوبته",
  body:
    `بدأ ${driverName} مناوبته.\n` +
    `وقت البدء: ${startTime}`,
    data: {
      type: "shift_started",
      shiftId: String(shift._id),
      driverId: getId(shift.driver),
    },
  });
}

/**
 * Called only after the shift is successfully completed.
 */
export async function notifySupervisorShiftEnded(shift) {
  if (!isEnabled()) return;

  if (
    !shift?._id ||
    shift.status !== "completed" ||
    !shift.startedAt ||
    !shift.endedAt
  ) {
    return;
  }

  const recipients = await getRecipients(shift);

  if (!recipients) return;

  const { supervisor, driverName } = recipients;

  const startTime = formatTime(shift.startedAt);
  const endTime = formatTime(shift.endedAt);

  const calculatedSeconds = Math.max(
    0,
    Math.floor(
      (new Date(shift.endedAt).getTime() -
        new Date(shift.startedAt).getTime()) / 1000
    )
  );

  const duration = formatDuration(
    Number.isFinite(shift.durationSeconds)
      ? shift.durationSeconds
      : calculatedSeconds
  );

  // Count successfully delivered orders
  // completed during this specific shift.
  const totalOrders = await Order.countDocuments({
    rider: getId(shift.driver),
    status: "delivered",
    deliveryTime: {
      $gte: new Date(shift.startedAt),
      $lte: new Date(shift.endedAt),
    },
  });

 await sendSupervisorNotification({
  supervisor,
  title: "انتهت مناوبة السائق",
  body:
    `أنهى ${driverName} مناوبته.\n` +
    `وقت البدء: ${startTime}\n` +
    `وقت الانتهاء: ${endTime}\n` +
    `الطلبات المكتملة: ${totalOrders}\n` +
    `مدة المناوبة: ${duration}`,
  data: {
    type: "shift_ended",
    shiftId: String(shift._id),
    driverId: getId(shift.driver),
    totalOrders,
    durationSeconds: calculatedSeconds,
  },
});
}
