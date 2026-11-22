//services/locationWake.service.js

/*
 * Keeps supervisor live maps fresh.
 *
 * Every few seconds, find drivers with an ACTIVE shift
 * whose last GPS point is stale, and ask their phone
 * for a fresh fix:
 *
 * 1. Socket request (app open / foreground) - cheap,
 *    retried often.
 * 2. Silent (data-only) push (app in background or
 *    closed) - wakes the app's background task, which
 *    reads GPS and POSTs /locations/me. Throttled.
 */

import { Expo } from "expo-server-sdk";

import { DriverLocation } from "../models/DriverLocation.js";
import { DriverShift } from "../models/DriverShift.js";
import { User } from "../models/User.js";

import { requestDriverLocation } from "./liveEvents.service.js";

const CHECK_INTERVAL_MS = 20 * 1000;

// A point older than this is considered stale.
const STALE_AFTER_MS = 45 * 1000;

// Give a newly started shift time to send its first point.
const SHIFT_GRACE_MS = 30 * 1000;

const SOCKET_RETRY_MS = 20 * 1000;
const PUSH_RETRY_MS = 2 * 60 * 1000;

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
});

// driverId -> last request time
const lastSocketRequest = new Map();
const lastPushRequest = new Map();

let intervalId = null;
let running = false;

async function sendSilentLocationPush(driverIds) {
  if (driverIds.length === 0) {
    return;
  }

  const users = await User.find({
    _id: { $in: driverIds },
    isActive: true,
  })
    .select("_id pushTokens")
    .lean();

  const messages = [];

  for (const user of users) {
    const tokens = [
      ...new Set(
        (user.pushTokens || [])
          .map((item) => item?.token)
          .filter(
            (token) =>
              typeof token === "string" &&
              Expo.isExpoPushToken(token),
          ),
      ),
    ];

    for (const token of tokens) {
      /*
       * No title/body => data-only (headless) message.
       * The app handles it in a background task and
       * does not show anything to the driver.
       */
      messages.push({
        to: token,
        priority: "high",
        contentAvailable: true,
        data: {
          type: "location_request",
          driverId: String(user._id),
        },
      });
    }
  }

  if (messages.length === 0) {
    return;
  }

  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.warn(
        "[LocationWake] Silent push failed:",
        error?.message ?? error,
      );
    }
  }
}

async function checkStaleDrivers() {
  if (running) {
    return;
  }

  running = true;

  try {
    const now = Date.now();

    const activeShifts = await DriverShift.find({
      status: "active",
      startedAt: { $lte: new Date(now - SHIFT_GRACE_MS) },
    })
      .select("driver")
      .lean();

    const activeDriverIds = new Set(
      activeShifts.map((shift) => String(shift.driver)),
    );

    // Forget drivers who are no longer working.
    for (const map of [lastSocketRequest, lastPushRequest]) {
      for (const id of map.keys()) {
        if (!activeDriverIds.has(id)) {
          map.delete(id);
        }
      }
    }

    if (activeDriverIds.size === 0) {
      return;
    }

    const locations = await DriverLocation.find({
      driver: { $in: [...activeDriverIds] },
    })
      .select("driver recordedAt")
      .lean();

    const lastSeen = new Map(
      locations.map((location) => [
        String(location.driver),
        new Date(location.recordedAt).getTime(),
      ]),
    );

    const pushTargets = [];

    for (const driverId of activeDriverIds) {
      const recordedAt = lastSeen.get(driverId) ?? 0;

      if (now - recordedAt < STALE_AFTER_MS) {
        continue;
      }

      let hasSocket = false;

      if (now - (lastSocketRequest.get(driverId) ?? 0) >= SOCKET_RETRY_MS) {
        lastSocketRequest.set(driverId, now);
        hasSocket = await requestDriverLocation(driverId, "stale");
      }

      if (
        !hasSocket &&
        now - (lastPushRequest.get(driverId) ?? 0) >= PUSH_RETRY_MS
      ) {
        lastPushRequest.set(driverId, now);
        pushTargets.push(driverId);
      }
    }

    await sendSilentLocationPush(pushTargets);
  } catch (error) {
    console.error("[LocationWake] Check failed:", error);
  } finally {
    running = false;
  }
}

export function startLocationWakeService() {
  if (intervalId) {
    return;
  }

  intervalId = setInterval(() => {
    void checkStaleDrivers();
  }, CHECK_INTERVAL_MS);

  console.log("[LocationWake] Started");
}

export function stopLocationWakeService() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
