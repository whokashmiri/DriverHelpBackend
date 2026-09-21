import { User } from "../models/User.js";

function createServiceError(
  message,
  statusCode = 400,
) {
  const error = new Error(message);

  error.statusCode =
    statusCode;

  return error;
}

export async function updateDriverBySupervisor(
  supervisorId,
  driverId,
  payload,
) {
  const driver =
    await User.findOne({
      _id: driverId,

      role: "driver",

      supervisor:
        supervisorId,
    }).select("+password");

  if (!driver) {
    throw createServiceError(
      "Driver not found",
      404,
    );
  }

  const {
    name,
    iqamaId,
    phone,
    password,
  } = payload;

  
  if (
    name !== undefined
  ) {
    const normalizedName =
      String(name).trim();

    if (!normalizedName) {
      throw createServiceError(
        "Driver name is required",
      );
    }

    driver.name =
      normalizedName;
  }

 
  if (
    iqamaId !== undefined
  ) {
    const normalizedIqama =
      String(iqamaId).trim();

    if (!normalizedIqama) {
      throw createServiceError(
        "Iqama ID is required",
      );
    }

  
    const existingUser =
      await User.findOne({
        iqamaId:
          normalizedIqama,

        _id: {
          $ne:
            driver._id,
        },
      }).select("_id");

    if (existingUser) {
      throw createServiceError(
        "Iqama ID is already in use",
        409,
      );
    }

    driver.iqamaId =
      normalizedIqama;
  }

  if (
    phone !== undefined
  ) {
    const normalizedPhone =
      typeof phone === "string"
        ? phone.trim()
        : "";

    driver.phone =
      normalizedPhone ||
      null;
  }


  if (
    password !== undefined &&
    password !== null &&
    String(password).trim() !== ""
  ) {
    const normalizedPassword =
      String(password);

    if (
      normalizedPassword.length <
      6
    ) {
      throw createServiceError(
        "Password must be at least 6 characters",
      );
    }

  
    driver.password =
      normalizedPassword;
  }

  await driver.save();


  const safeDriver =
    driver.toObject();

  delete safeDriver.password;

  return safeDriver;
}