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
    shortName,
    iqamaId,
    phone,
    password,
    vehicleType,
    profilePicture,
  } = payload;

  /*
   * NAME
   */
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

  /*
   * SHORT NAME
   */
  if (
    shortName !== undefined
  ) {
    const normalizedShortName =
      typeof shortName ===
      "string"
        ? shortName.trim()
        : "";

    if (
      normalizedShortName.length >
      30
    ) {
      throw createServiceError(
        "Short name must not exceed 30 characters",
      );
    }

    driver.shortName =
      normalizedShortName ||
      null;
  }

  /*
   * IQAMA
   */
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

  /*
   * PHONE
   */
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

  /*
   * VEHICLE TYPE
   */
  if (
    vehicleType !== undefined
  ) {
    /*
     * Allow null/empty value so older
     * or walking drivers can have no
     * vehicle type.
     */
    if (
      vehicleType === null ||
      String(
        vehicleType,
      ).trim() === ""
    ) {
      driver.vehicleType =
        undefined;
    } else {
      const normalizedVehicleType =
        String(
          vehicleType,
        )
          .trim()
          .toLowerCase();

      if (
        ![
          "car",
          "bike",
        ].includes(
          normalizedVehicleType,
        )
      ) {
        throw createServiceError(
          "Vehicle type must be car or bike",
        );
      }

      driver.vehicleType =
        normalizedVehicleType;
    }
  }

  /*
   * PROFILE PICTURE
   *
   * Controller should upload the
   * image first and pass:
   *
   * {
   *   url,
   *   publicId
   * }
   */
  if (
    profilePicture !== undefined
  ) {
    if (
      profilePicture === null
    ) {
      driver.profilePicture = {
        url: null,
        publicId: null,
      };
    } else {
      driver.profilePicture = {
        url:
          profilePicture.url ??
          null,

        publicId:
          profilePicture.publicId ??
          null,
      };
    }
  }

  /*
   * PASSWORD
   */
  if (
    password !== undefined &&
    password !== null &&
    String(
      password,
    ).trim() !== ""
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