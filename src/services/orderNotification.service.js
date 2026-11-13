
import { User } from "../models/User.js";

import {
  sendPushToDriver,
} from "./push.service.js";

function isEnabled(name) {
  return (
    String(process.env[name] || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function getId(value) {
  if (!value) return null;

  return String(value._id ?? value);
}

function getNotificationContent(status, driverName, orderNumber) {
  const orderLabel = orderNumber
    ? ` رقم ${orderNumber}`
    : "";

  if (status === "delivered") {
    return {
      driver: {
        title: "اكتمل التوصيل",
        body: `تم إكمال توصيل الطلب${orderLabel} بنجاح.`,
      },

      supervisor: {
        title: "اكتمل التوصيل",
        body: `أكمل ${driverName} توصيل الطلب${orderLabel}.`,
      },
    };
  }

  if (status === "cancelled") {
    return {
      driver: {
        title: "تم إلغاء التوصيل",
        body: `تم إلغاء توصيل الطلب${orderLabel}.`,
      },

      supervisor: {
        title: "تم إلغاء التوصيل",
        body: `قام ${driverName} بإلغاء توصيل الطلب${orderLabel}.`,
      },
    };
  }

  return null;
}


export async function notifyOrderStatusChange(order) {
  if (
    !order?._id ||
    !["delivered", "cancelled"].includes(
      order.status,
    )
  ) {
    return;
  }

  const notifyDriver =
    isEnabled("NOTIFICATION_DRIVER");

  const notifySupervisor =
    isEnabled("NOTIFICATION_SUPERVISOR");

  if (!notifyDriver && !notifySupervisor) {
    return;
  }

 
  const driverId = getId(order.rider);

  if (!driverId) {
    console.warn(
      "[ORDER PUSH] Order has no driver:",
      String(order._id),
    );
    return;
  }

  const driver = await User.findOne({
    _id: driverId,
    role: "driver",
  }).select(
    "name shortName supervisor isActive +pushTokens",
  );

  if (!driver) {
    console.warn(
      "[ORDER PUSH] Driver not found:",
      driverId,
    );
    return;
  }

  const driverName =
    driver.shortName ||
    driver.name ||
    "A driver";

  const content = getNotificationContent(
    order.status,
    driverName,
    order.orderId,
  );

  if (!content) return;

  const data = {
    type: "order_status_changed",
    orderId: String(order._id),
    status: order.status,
  };

  const jobs = [];

  if (notifyDriver && driver.isActive) {
    jobs.push({
      role: "driver",
      user: driver,
      content: content.driver,
    });
  }

  if (notifySupervisor && driver.supervisor) {
    const supervisor = await User.findOne({
      _id: driver.supervisor,
      role: "supervisor",
      isActive: true,
    }).select(
      "name isActive +pushTokens",
    );

    if (supervisor) {
      jobs.push({
        role: "supervisor",
        user: supervisor,
        content: content.supervisor,
      });
    }
  }

  // Each recipient is processed independently.
  // One failure must not block the other.
  await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        const result = await sendPushToDriver({
          driver: job.user,
          title: job.content.title,
          body: job.content.body,
          data,
        });

        console.log(
          "[ORDER PUSH] Result:",
          {
            orderId: String(order._id),
            status: order.status,
            recipientRole: job.role,
            recipientId: String(job.user._id),
            attempted: result.attempted,
            accepted:
              result.pushTicketIds.length,
          },
        );
      } catch (error) {
        console.error(
          "[ORDER PUSH] Failed:",
          {
            orderId: String(order._id),
            recipientRole: job.role,
            error,
          },
        );
      }
    }),
  );
}
