
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function isValidExpoPushToken(token) {
  return (
    typeof token === "string" &&
    token.length <= 255 &&
    /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(
      token,
    )
  );
}

/**
 * POST /api/notifications/token
 *
 * Register the authenticated driver's
 * Expo push token.
 */
export const registerPushToken = asyncHandler(
  async (req, res) => {
    const { token } = req.body;

    if (req.user.role !== "driver") {
      res.status(403);
      throw new Error("Only drivers can register push tokens");
    }

    if (!req.user.isActive) {
      res.status(403);
      throw new Error("Driver account is inactive");
    }

    if (!isValidExpoPushToken(token)) {
      res.status(400);
      throw new Error("Invalid Expo push token");
    }

    const now = new Date();

    // Refresh an existing token without creating duplicates.
    const existing = await User.updateOne(
      {
        _id: req.user._id,
        "pushTokens.token": token,
      },
      {
        $set: {
          "pushTokens.$.updatedAt": now,
        },
      },
    );

    if (existing.matchedCount === 0) {
      await User.updateOne(
        {
          _id: req.user._id,
          "pushTokens.token": { $ne: token },
        },
        {
          $push: {
            pushTokens: {
              token,
              updatedAt: now,
            },
          },
        },
      );
    }

    res.json({
      success: true,
      message: "Push token registered successfully",
    });
  },
);

/**
 * DELETE /api/notifications/token
 *
 * Unregister the token belonging
 * to the current app installation.
 */
export const unregisterPushToken = asyncHandler(
  async (req, res) => {
    const { token } = req.body;

    if (!isValidExpoPushToken(token)) {
      res.status(400);
      throw new Error("Invalid Expo push token");
    }

    await User.updateOne(
      { _id: req.user._id },
      {
        $pull: {
          pushTokens: { token },
        },
      },
    );

    res.json({
      success: true,
      message: "Push token unregistered successfully",
    });
  },
);
