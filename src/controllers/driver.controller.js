// controllers/driver.controller.js

import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createDriver = asyncHandler(async (req, res) => {
  const { iqamaId, name, phone, password } = req.body;

  if (!iqamaId || !name || !password) {
    res.status(400);
    throw new Error("Iqama ID, name and password are required");
  }

  const cleanIqamaId = String(iqamaId).trim();

  const existingUser = await User.findOne({
    iqamaId: cleanIqamaId,
  });

  if (existingUser) {
    res.status(409);
    throw new Error("Iqama ID already registered");
  }

  const driver = await User.create({
    iqamaId: cleanIqamaId,
    name: String(name).trim(),
    phone: phone ? String(phone).trim() : null,
    password,

    role: "driver",

    supervisor: req.user._id,
    createdBy: req.user._id,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "Driver created successfully",

    driver: {
      id: driver._id,
      iqamaId: driver.iqamaId,
      name: driver.name,
      phone: driver.phone,
      role: driver.role,
      isActive: driver.isActive,
    },
  });
});


export const getMyDrivers = asyncHandler(async (req, res) => {
  const drivers = await User.find({
    supervisor: req.user._id,
    role: "driver",
  })
    .select(
      "iqamaId name phone role isActive lastLoginAt createdAt"
    )
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: drivers.length,
    drivers,
  });
});


export const getDriverById = asyncHandler(async (req, res) => {
  const driver = await User.findOne({
    _id: req.params.id,
    supervisor: req.user._id,
    role: "driver",
  }).select(
    "iqamaId name phone role isActive lastLoginAt createdAt"
  );

  if (!driver) {
    res.status(404);
    throw new Error("Driver not found");
  }

  res.json({
    success: true,
    driver,
  });
});


export const updateDriverStatus = asyncHandler(
  async (req, res) => {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      res.status(400);
      throw new Error("isActive must be a boolean");
    }

    const driver = await User.findOne({
      _id: req.params.id,
      supervisor: req.user._id,
      role: "driver",
    });

    if (!driver) {
      res.status(404);
      throw new Error("Driver not found");
    }

    driver.isActive = isActive;

    await driver.save();

    res.json({
      success: true,
      message: isActive
        ? "Driver activated"
        : "Driver deactivated",

      driver: {
        id: driver._id,
        iqamaId: driver.iqamaId,
        name: driver.name,
        isActive: driver.isActive,
      },
    });
  }
);