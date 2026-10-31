import jwt from "jsonwebtoken";

import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
  checkAppVersion,
} from "../services/appVersion.service.js";

export const protect = asyncHandler(
  async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    const token = authHeader.slice(7);

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({
        success: false,
        message: "Not authorized, invalid token",
      });
    }

    const user = await User.findById(
      decoded.id
    ).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, user not found",
      });
    }

    req.user = user;

    const result = await checkAppVersion({
      role: user.role,
      platform: req.headers["x-app-platform"],
      versionCode: req.headers["x-app-version-code"],
    });

    if (!result.allowed) {
      return res.status(426).json({
        success: false,
        ...result,
      });
    }

    return next();
  }
);