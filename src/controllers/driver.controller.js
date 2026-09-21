// controllers/driver.controller.js

import { User } from "../models/User.js";
import { DriverShift } from "../models/DriverShift.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import {
  updateDriverBySupervisor,
} from "../services/driver.service.js";



function getRiyadhDayRange() {
  const now = new Date();

  
  const riyadhNow = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Riyadh",
    }),
  );

  const year = riyadhNow.getFullYear();
  const month = riyadhNow.getMonth();
  const day = riyadhNow.getDate();


  const start = new Date(
    Date.UTC(
      year,
      month,
      day,
      -3,
      0,
      0,
      0,
    ),
  );

  const end = new Date(
    Date.UTC(
      year,
      month,
      day + 1,
      -3,
      0,
      0,
      0,
    ),
  );

  return {
    start,
    end,
  };
}

/**
 * CREATE DRIVER
 */
export const createDriver = asyncHandler(
  async (req, res) => {
    const {
      iqamaId,
      name,
      phone,
      password,
    } = req.body;

    if (
      !iqamaId ||
      !name ||
      !password
    ) {
      res.status(400);

      throw new Error(
        "Iqama ID, name and password are required",
      );
    }

    const cleanIqamaId =
      String(iqamaId).trim();

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

    const driver =
      await User.create({
        iqamaId:
          cleanIqamaId,

        name: String(
          name,
        ).trim(),

        phone: phone
          ? String(
              phone,
            ).trim()
          : null,

        password,

        role: "driver",

        supervisor:
          req.user._id,

        createdBy:
          req.user._id,

        isActive: true,
      });

    res.status(201).json({
      success: true,

      message:
        "Driver created successfully",

      driver: {
        id: driver._id,
        _id: driver._id,

        iqamaId:
          driver.iqamaId,

        name:
          driver.name,

        phone:
          driver.phone,

        role:
          driver.role,

        isActive:
          driver.isActive,

    
        workStatus:
          "not_started",
      },
    });
  },
);


export const getMyDrivers = asyncHandler(
  async (req, res) => {
    const drivers = await User.find({
      supervisor: req.user._id,
      role: "driver",
    })
      .select(
        [
          "_id",
          "iqamaId",
          "name",
          "phone",
          "role",
          "isActive",
          "supervisor",
          "lastLoginAt",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .sort({
        createdAt: -1,
      })
      .lean();

    if (drivers.length === 0) {
      return res.json({
        success: true,
        count: 0,
        workingCount: 0,
        notWorkingCount: 0,
        drivers: [],
      });
    }

    const driverIds = drivers.map(
      (driver) => driver._id,
    );

    /*
     * CURRENTLY WORKING:
     * only drivers with an active shift.
     */
    const activeShifts =
      await DriverShift.find({
        driver: {
          $in: driverIds,
        },

        status: "active",
      })
        .select("driver")
        .lean();

    const workingDriverIds =
      new Set(
        activeShifts.map(
          (shift) =>
            String(shift.driver),
        ),
      );

    const driversWithStatus =
      drivers.map((driver) => {
        const isWorking =
          workingDriverIds.has(
            String(driver._id),
          );

        return {
          ...driver,

          id: driver._id,

          workStatus: isWorking
            ? "working"
            : "not_started",
        };
      });

    const workingCount =
      driversWithStatus.filter(
        (driver) =>
          driver.workStatus ===
          "working",
      ).length;

    const notWorkingCount =
      drivers.length -
      workingCount;

    res.json({
      success: true,

      count: drivers.length,

      workingCount,

      notWorkingCount,

      drivers:
        driversWithStatus,
    });
  },
);

/**
 * GET DRIVER BY ID
 */
export const getDriverById = asyncHandler(
  async (req, res) => {
    const driver = await User.findOne({
      _id: req.params.id,
      supervisor: req.user._id,
      role: "driver",
    })
      .select(
        [
          "_id",
          "iqamaId",
          "name",
          "phone",
          "role",
          "isActive",
          "supervisor",
          "lastLoginAt",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .lean();

    if (!driver) {
      res.status(404);
      throw new Error(
        "Driver not found",
      );
    }

    const activeShift =
      await DriverShift.exists({
        driver: driver._id,
        status: "active",
      });

    res.json({
      success: true,

      driver: {
        ...driver,

        id: driver._id,

        workStatus: activeShift
          ? "working"
          : "not_started",
      },
    });
  },
);

/**
 * ACTIVATE / DEACTIVATE DRIVER
 */
export const updateDriverStatus =
  asyncHandler(
    async (req, res) => {
      const {
        isActive,
      } = req.body;

      if (
        typeof isActive !==
        "boolean"
      ) {
        res.status(400);

        throw new Error(
          "isActive must be a boolean",
        );
      }

      const driver =
        await User.findOne({
          _id:
            req.params.id,

          supervisor:
            req.user._id,

          role: "driver",
        });

      if (!driver) {
        res.status(404);

        throw new Error(
          "Driver not found",
        );
      }

      driver.isActive =
        isActive;

      await driver.save();

      const {
        start,
        end,
      } =
        getRiyadhDayRange();

     const activeShift =
  await DriverShift.exists({
    driver: driver._id,
    status: "active",
  });

res.json({
  success: true,

  message: isActive
    ? "Driver activated"
    : "Driver deactivated",

  driver: {
    id: driver._id,
    _id: driver._id,

    iqamaId:
      driver.iqamaId,

    name:
      driver.name,

    phone:
      driver.phone,

    role:
      driver.role,

    isActive:
      driver.isActive,

    workStatus:
      activeShift
        ? "working"
        : "not_started",
  },
});
    },
  );


  export const updateDriver =
  asyncHandler(
    async (req, res) => {
      if (
        req.user.role !==
        "supervisor"
      ) {
        res.status(403);

        throw new Error(
          "Only supervisors can update drivers",
        );
      }

      const {
        name,
        iqamaId,
        phone,
        password,
      } = req.body;

      /*
       * Require at least one
       * editable field.
       */
      if (
        name === undefined &&
        iqamaId === undefined &&
        phone === undefined &&
        password === undefined
      ) {
        res.status(400);

        throw new Error(
          "No driver fields provided for update",
        );
      }

      const driver =
        await updateDriverBySupervisor(
          req.user._id,
          req.params.driverId,
          {
            name,
            iqamaId,
            phone,
            password,
          },
        );

      res.json({
        success: true,

        message:
          "Driver updated successfully",

        driver,
      });
    },
  );