//push.service.js
import { Expo } from "expo-server-sdk";
import { User } from "../models/User.js";

const expo = new Expo({
  accessToken:
    process.env.EXPO_ACCESS_TOKEN || undefined,
});

/**
 * Send push notifications to all registered
 * devices belonging to a driver.
 */
export async function sendPushToDriver({
  driver,
  title,
  body,
  data = {},
}) {
  const tokens = [
    ...new Set(
      (driver.pushTokens || [])
        .map((item) => item?.token)
        .filter(
          (token) =>
            typeof token === "string" &&
            Expo.isExpoPushToken(token),
        ),
    ),
  ];

  if (tokens.length === 0) {
    return {
      attempted: 0,
      pushTickets: [],
      pushTicketIds: [],
    };
  }

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: "default",
    priority: "high",
    channelId: "shift-reminders",
    data,
  }));

  const chunks =
    expo.chunkPushNotifications(messages);

  const pushTickets = [];

  for (const chunk of chunks) {
    const tickets =
      await expo.sendPushNotificationsAsync(chunk);

   tickets.forEach((ticket, index) => {
  const token = chunk[index]?.to;

  if (ticket.status === "ok") {
    if (ticket.id) {
      pushTickets.push({
        id: ticket.id,
        token,
      });

      console.log("[PUSH] Ticket accepted", {
        driverId: String(driver._id),
        ticketId: ticket.id,
      });
    } else {
      console.warn(
        "[PUSH] Accepted ticket has no ID",
        ticket,
      );
    }

    return;
  }

  console.warn("[PUSH] Ticket rejected", {
    driverId: String(driver._id),
    status: ticket.status,
    error:
      ticket.details?.error ||
      ticket.message ||
      "Unknown push error",
    rawTicket: ticket,
  });
});
  }

  return {
    attempted: messages.length,
    pushTickets,
    pushTicketIds:
      pushTickets.map((ticket) => ticket.id),
  };
}

/**
 * Check Expo push notification receipts.
 *
 * Returns the number of receipt IDs
 * for which Expo has not yet returned
 * a receipt.
 */
export async function checkPushReceipts(
  pushTickets = [],
) {
  if (!Array.isArray(pushTickets) ||
      pushTickets.length === 0) {
    return 0;
  }

  const validTickets = pushTickets.filter(
    (ticket) =>
      typeof ticket?.id === "string" &&
      typeof ticket?.token === "string",
  );

  if (validTickets.length === 0) {
    return 0;
  }

  // Reset for every function call.
  let missingReceipts = 0;

  const chunks =
    expo.chunkPushNotificationReceiptIds(
      validTickets.map((ticket) => ticket.id),
    );

  const tokensByTicket = new Map(
    validTickets.map((ticket) => [
      ticket.id,
      ticket.token,
    ]),
  );

  for (const chunk of chunks) {
    const receipts =
      await expo.getPushNotificationReceiptsAsync(
        chunk,
      );

    // Count receipts that are not yet available.
    missingReceipts += chunk.filter(
      (id) =>
        !Object.prototype.hasOwnProperty.call(
          receipts,
          id,
        ),
    ).length;

    for (const [id, receipt] of Object.entries(
      receipts,
    )) {
      if (receipt.status !== "error") {
        continue;
      }

      const token = tokensByTicket.get(id);

      console.warn("[PUSH] Receipt error", {
        id,
        error: receipt.details?.error,
        message: receipt.message,
      });

      // Remove tokens that Expo confirms
      // are no longer registered.
      if (
        token &&
        receipt.details?.error ===
          "DeviceNotRegistered"
      ) {
        try {
          await User.updateMany(
            {
              "pushTokens.token": token,
            },
            {
              $pull: {
                pushTokens: { token },
              },
            },
          );

          console.log(
            "[PUSH] Invalid device token removed",
          );
        } catch (error) {
          console.error(
            "[PUSH] Failed to remove invalid token:",
            error,
          );

          throw error;
        }
      }
    }
  }

  // Return only after all chunks
  // and all receipts are processed.
  return missingReceipts;
}
