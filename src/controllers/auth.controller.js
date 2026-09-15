import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken } from "../utils/generateToken.js";

/**
 * Temporary/general registration.
 * Later:
 * - Admin creates supervisors
 * - Supervisor creates drivers
 * - Public registration can be removed
 */
export const register = asyncHandler(async (req, res) => {
  const {
    iqamaId,
    password,
    name,
  } = req.body;

  if (!iqamaId || !password || !name) {
    res.status(400);
    throw new Error("Name, Iqama ID and password are required");
  }

  const cleanIqamaId = String(iqamaId).trim();
  const cleanName = String(name).trim();

  if (!cleanIqamaId) {
    res.status(400);
    throw new Error("Iqama ID is required");
  }

  if (!cleanName) {
    res.status(400);
    throw new Error("Name is required");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  const existingUser = await User.findOne({
    iqamaId: cleanIqamaId,
  });

  if (existingUser) {
    res.status(409);
    throw new Error("Iqama ID already registered");
  }

  const user = await User.create({
    iqamaId: cleanIqamaId,
    name: cleanName,
    password,

    // Never trust a public client to assign its own role.
    role: "driver",
  });

  res.status(201).json({
    success: true,

    token: generateToken(user._id),

    user: {
      id: user._id,
      iqamaId: user.iqamaId,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
});


export const login = asyncHandler(async (req, res) => {
  const {
    iqamaId,
    password,
  } = req.body;

  if (!iqamaId || !password) {
    res.status(400);
    throw new Error("Iqama ID and password are required");
  }

  const cleanIqamaId = String(iqamaId).trim();

  const user = await User.findOne({
    iqamaId: cleanIqamaId,
  }).select("+password");

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Invalid Iqama ID or password");
  }

  if (!user.isActive) {
    res.status(403);
    throw new Error("Your account is inactive");
  }

  user.lastLoginAt = new Date();

  await user.save();

  res.json({
    success: true,

    token: generateToken(user._id),

    user: {
      id: user._id,
      iqamaId: user.iqamaId,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      supervisor: user.supervisor,
    },
  });
});


export const me = asyncHandler(async (req, res) => {
  const user = req.user;

  res.json({
    success: true,

    user: {
      id: user._id,
      iqamaId: user.iqamaId,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      supervisor: user.supervisor,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
  });
});