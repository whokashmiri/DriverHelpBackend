//driver.service.js

import mongoose from "mongoose";

import { User } from "../models/User.js";

function createServiceError(
  message,
  statusCode = 400,
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  return error;
}

/**
 * Update a driver managed by
 * the logged-in supervisor.
 */
export async function updateDriverBySupervisor(
  supervisorId,
  driverId,
  payload,
) {
  if (
    !supervisorId
  ) {
    throw createServiceError(
      "Supervisor ID is required",
      400,
    );
  }

  if (
    !driverId
  ) {
    throw createServiceError(
      "Driver ID is required",
      400,
    );
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      driverId,
    )
  ) {
    throw createServiceError(
      "Invalid driver ID",
      400,
    );
  }

  const driver =
    await User.findOne({
      _id:
        driverId,

      role:
        "driver",

      supervisor:
        supervisorId,
    }).select(
      "+password",
    );

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
    vehiclePlateNumber,
    accommodation,
    profilePicture,
  } = payload;

  /*
   * ==========================================
   * NAME
   * ==========================================
   */
  if (
    name !== undefined
  ) {
    const normalizedName =
      String(
        name,
      ).trim();

    if (
      !normalizedName
    ) {
      throw createServiceError(
        "Driver name is required",
      );
    }

    driver.name =
      normalizedName;
  }

  /*
   * ==========================================
   * SHORT NAME
   * ==========================================
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
   * ==========================================
   * IQAMA ID
   * ==========================================
   */
  if (
    iqamaId !== undefined
  ) {
    const normalizedIqama =
      String(
        iqamaId,
      ).trim();

    if (
      !normalizedIqama
    ) {
      throw createServiceError(
        "Iqama ID is required",
      );
    }

    /*
     * Make sure another user
     * does not already use it.
     */
    const existingUser =
      await User.findOne({
        iqamaId:
          normalizedIqama,

        _id: {
          $ne:
            driver._id,
        },
      }).select(
        "_id",
      );

    if (
      existingUser
    ) {
      throw createServiceError(
        "Iqama ID is already in use",
        409,
      );
    }

    driver.iqamaId =
      normalizedIqama;
  }

  /*
   * ==========================================
   * PHONE
   * ==========================================
   */
  if (
    phone !== undefined
  ) {
    const normalizedPhone =
      typeof phone ===
      "string"
        ? phone.trim()
        : "";

    driver.phone =
      normalizedPhone ||
      null;
  }

  /*
   * ==========================================
   * VEHICLE TYPE
   * ==========================================
   *
   * null / empty:
   * driver is walking / no vehicle.
   */
  if (
    vehicleType !== undefined
  ) {
    if (
      vehicleType ===
        null ||
      String(
        vehicleType,
      ).trim() ===
        ""
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
   * ==========================================
   * VEHICLE PLATE NUMBER
   * ==========================================
   *
   * Optional field.
   *
   * null / empty string:
   * remove vehicle plate number.
   */
  if (vehiclePlateNumber !== undefined) {
    if (
      vehiclePlateNumber !== null &&
      typeof vehiclePlateNumber !== "string"
    ) {
      throw createServiceError(
        "Vehicle plate number must be a string",
        400,
      );
    }

    const normalizedPlate =
      vehiclePlateNumber?.trim().toUpperCase() || null;

    if (normalizedPlate && normalizedPlate.length > 20) {
      throw createServiceError(
        "Vehicle plate number must not exceed 20 characters",
        400,
      );
    }

    driver.vehiclePlateNumber = normalizedPlate;
  }

  /*
   * ==========================================
   * ACCOMMODATION
   * ==========================================
   *
   * Supports partial updates.
   *
   * Example:
   *
   * {
   *   address: "Al Malaz, Riyadh",
   *   location: {
   *     type: "Point",
   *     coordinates: [46.723, 24.668]
   *   }
   * }
   *
   * Coordinates order:
   * [longitude, latitude]
   *
   * null:
   * remove all accommodation information.
   */
  if (accommodation !== undefined) {
  if (accommodation === null) {
  driver.set("accommodation.address", null);
  driver.set("accommodation.location", undefined);
} else {
      if (
        typeof accommodation !== "object" ||
        Array.isArray(accommodation)
      ) {
        throw createServiceError(
          "Accommodation must be an object or null",
          400,
        );
      }

      /*
       * ACCOMMODATION ADDRESS
       */
      if (accommodation.address !== undefined) {
        if (
          accommodation.address !== null &&
          typeof accommodation.address !== "string"
        ) {
          throw createServiceError(
            "Accommodation address must be a string",
            400,
          );
        }

        const normalizedAddress =
          accommodation.address?.trim() || null;

        driver.set(
          "accommodation.address",
          normalizedAddress,
        );
      }

      /*
       * ACCOMMODATION GPS LOCATION
       */
      if (accommodation.location !== undefined) {
        const location = accommodation.location;

        if (location === null) {
          driver.set(
            "accommodation.location",
            {
              type: "Point",
              coordinates: undefined,
            },
          );
        } else {
          if (
            typeof location !== "object" ||
            Array.isArray(location)
          ) {
            throw createServiceError(
              "Accommodation location must be an object",
              400,
            );
          }

          if (
            location.type !== undefined &&
            location.type !== "Point"
          ) {
            throw createServiceError(
              "Accommodation location type must be Point",
              400,
            );
          }

          if (location.coordinates !== undefined) {
            const coordinates = location.coordinates;

            if (coordinates === null) {
              driver.set(
                "accommodation.location.coordinates",
                undefined,
              );
            } else {
              if (
                !Array.isArray(coordinates) ||
                coordinates.length !== 2
              ) {
                throw createServiceError(
                  "Accommodation coordinates must contain longitude and latitude",
                  400,
                );
              }

              const [longitude, latitude] = coordinates;

              if (
                typeof longitude !== "number" ||
                typeof latitude !== "number" ||
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude) ||
                longitude < -180 ||
                longitude > 180 ||
                latitude < -90 ||
                latitude > 90
              ) {
                throw createServiceError(
                  "Invalid accommodation coordinates",
                  400,
                );
              }

              driver.set(
                "accommodation.location.coordinates",
                [longitude, latitude],
              );

              driver.set(
                "accommodation.location.type",
                "Point",
              );
            }
          }
        }
      }
    }
  }


  /*
   * ==========================================
   * PROFILE PICTURE
   * ==========================================
   *
   * Controller uploads the image
   * to Cloudinary first.
   *
   * Expected:
   *
   * {
   *   url,
   *   publicId
   * }
   */
  if (
    profilePicture !==
    undefined
  ) {
    /*
     * Explicit null means:
     * remove profile picture.
     */
    if (
      profilePicture ===
      null
    ) {
      driver.profilePicture =
        {
          url: null,

          publicId:
            null,
        };
    } else {
      const url =
        profilePicture
          ?.url
          ? String(
              profilePicture.url,
            ).trim()
          : null;

      const publicId =
        profilePicture
          ?.publicId
          ? String(
              profilePicture.publicId,
            ).trim()
          : null;

      /*
       * Don't save an invalid
       * uploaded-picture object.
       */
      if (!url) {
        throw createServiceError(
          "Profile picture URL is required",
          400,
        );
      }

      driver.profilePicture =
        {
          url,

          publicId,
        };
    }
  }

  /*
   * ==========================================
   * PASSWORD
   * ==========================================
   */
  if (
    password !==
      undefined &&
    password !==
      null &&
    String(
      password,
    ).trim() !==
      ""
  ) {
    /*
     * Do NOT trim the actual password.
     *
     * Only trim above when deciding
     * whether it is empty.
     */
    const normalizedPassword =
      String(
        password,
      );

    if (
      normalizedPassword.length <
      6
    ) {
      throw createServiceError(
        "Password must be at least 6 characters",
      );
    }

    /*
     * User model pre-save hook
     * should hash this password.
     */
    driver.password =
      normalizedPassword;
  }

  /*
   * Drivers created/managed here
   * are delivery-capable users.
   */
  driver.canDeliverOrders =
    true;

  await driver.save();

  /*
   * Return safe driver object.
   */
  const safeDriver =
    driver.toObject();

  delete safeDriver.password;

  return safeDriver;
}