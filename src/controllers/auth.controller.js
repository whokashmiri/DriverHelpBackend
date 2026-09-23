import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken } from "../utils/generateToken.js";

export const register = asyncHandler(async (req, res) => {
  const {
    iqamaId,
    password,
    name,
    role,
  } = req.body;

  if (!iqamaId || !password || !name || !role) {
    res.status(400);
    throw new Error(
      "Name, Iqama ID, password and role are required",
    );
  }

  const cleanIqamaId =
    String(iqamaId).trim();

  const cleanName =
    String(name).trim();

  const cleanRole =
    String(role)
      .trim()
      .toLowerCase();

  if (!cleanIqamaId) {
    res.status(400);
    throw new Error(
      "Iqama ID is required",
    );
  }

  if (!cleanName) {
    res.status(400);
    throw new Error(
      "Name is required",
    );
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error(
      "Password must be at least 6 characters",
    );
  }

  /*
   * Web registration is only
   * for management accounts.
   */
  if (
    ![
      "admin",
      "supervisor",
    ].includes(cleanRole)
  ) {
    res.status(400);

    throw new Error(
      "Role must be admin or supervisor",
    );
  }

  const existingUser =
    await User.findOne({
      iqamaId:
        cleanIqamaId,
    });

  if (existingUser) {
    res.status(409);

    throw new Error(
      "Iqama ID already registered",
    );
  }

  const user =
    await User.create({
      iqamaId:
        cleanIqamaId,

      name:
        cleanName,

      password,

      role:
        cleanRole,
    });

  res.status(201).json({
    success: true,

    token:
      generateToken(
        user._id,
      ),

    user: {
      id:
        user._id,

      iqamaId:
        user.iqamaId,

      name:
        user.name,

      role:
        user.role,

      isActive:
        user.isActive,
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