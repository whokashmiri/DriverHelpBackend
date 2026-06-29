import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken } from "../utils/generateToken.js";

export const register = asyncHandler(async (req, res) => {
  const { iqamaId, password } = req.body;

  if (!iqamaId || !password) {
    res.status(400);
    throw new Error("Iqama ID and password are required");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  const cleanIqamaId = iqamaId.trim();

  const existingUser = await User.findOne({ iqamaId: cleanIqamaId });

  if (existingUser) {
    res.status(409);
    throw new Error("Iqama ID already registered");
  }

  const user = await User.create({
    iqamaId: cleanIqamaId,
    password,
  });

  res.status(201).json({
    success: true,
    token: generateToken(user._id),
    user: {
      id: user._id,
      iqamaId: user.iqamaId,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { iqamaId, password } = req.body;

  if (!iqamaId || !password) {
    res.status(400);
    throw new Error("Iqama ID and password are required");
  }

  const cleanIqamaId = iqamaId.trim();

  const user = await User.findOne({ iqamaId: cleanIqamaId }).select(
    "+password"
  );

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Invalid Iqama ID or password");
  }

  res.json({
    success: true,
    token: generateToken(user._id),
    user: {
      id: user._id,
      iqamaId: user.iqamaId,
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      iqamaId: req.user.iqamaId,
    },
  });
});