import { DateTime } from "luxon";
import { Order } from "../models/Order.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";
import {getNextOrderId} from "../services/orderSequence.service.js";

const TIME_ZONE = "Asia/Riyadh";

const CANCELLATION_REASONS = [
  "customer_unavailable",
  "wrong_address",
  "vehicle_issue",
  "order_issue",
  "emergency",
  "other",
];

function parseDate(value, fieldName) {
  if (!value) return new Date();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

function getRiyadhTodayRange() {
  const now =
    DateTime.now().setZone(
      TIME_ZONE
    );

  const start = now
    .startOf("day")
    .toUTC()
    .toJSDate();

  const end = now
    .endOf("day")
    .toUTC()
    .toJSDate();

  return {
    start,
    end,
  };
}
function getFile(
  files,
  fieldName,
) {
  const file =
    files?.[fieldName]?.[0];

  if (!file) {
    const error = new Error(
      `${fieldName} is required`,
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !file.buffer ||
    file.buffer.length === 0
  ) {
    const error = new Error(
      `${fieldName} is empty`,
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !file.mimetype?.startsWith(
      "image/",
    )
  ) {
    const error = new Error(
      `${fieldName} must be an image`,
    );

    error.statusCode = 400;

    throw error;
  }

  return file;
}

function getImageFiles(
  files,
  fieldName
) {
  const imageFiles =
    files?.[fieldName] ?? [];

  if (!Array.isArray(imageFiles)) {
    return [];
  }

  for (const file of imageFiles) {
    if (
      !file.buffer ||
      file.buffer.length === 0
    ) {
      const error =
        new Error(
          `${fieldName} contains an empty file`
        );

      error.statusCode = 400;

      throw error;
    }

    if (
      !file.mimetype?.startsWith(
        "image/"
      )
    ) {
      const error =
        new Error(
          `${fieldName} must contain images only`
        );

      error.statusCode = 400;

      throw error;
    }
  }

  return imageFiles;
}

function normalizeOvernightPickupTime(
  pickupTime,
  deliveryTime
) {
  const pickupRiyadh =
    DateTime.fromJSDate(
      new Date(pickupTime),
      {
        zone: "utc",
      }
    ).setZone(
      TIME_ZONE
    );

  const deliveryRiyadh =
    DateTime.fromJSDate(
      new Date(deliveryTime),
      {
        zone: "utc",
      }
    ).setZone(
      TIME_ZONE
    );

  /*
   * Same Riyadh calendar day:
   * keep the real pickup time.
   */
  if (
    pickupRiyadh.hasSame(
      deliveryRiyadh,
      "day"
    )
  ) {
    return new Date(
      pickupTime
    );
  }

  /*
   * Delivery happened on a later
   * Riyadh calendar day.
   *
   * Normalize pickup to:
   *
   * 00:01:00 of the delivery day.
   */
  const normalizedPickup =
    deliveryRiyadh
      .startOf("day")
      .set({
        hour: 0,
        minute: 1,
        second: 0,
        millisecond: 0,
      });

  /*
   * Safety for an unusual delivery
   * occurring before 00:01.
   *
   * Never create a pickup time after
   * the delivery time.
   */
  if (
    normalizedPickup.toMillis() >
    deliveryRiyadh.toMillis()
  ) {
    return deliveryRiyadh
      .startOf("day")
      .toUTC()
      .toJSDate();
  }

  return normalizedPickup
    .toUTC()
    .toJSDate();
}

/**
 * DRIVER
 * Step 1:
 * Driver takes pickup photo and creates the order.
 */
export const createPickupOrder =
  asyncHandler(
    async (req, res) => {
      if (
        req.user.role !==
        "driver"
      ) {
        res.status(403);

        throw new Error(
          "Only drivers can create orders"
        );
      }

      if (
        !req.user.supervisor
      ) {
        res.status(400);

        throw new Error(
          "Driver is not assigned to a supervisor"
        );
      }

      const pickupFile =
        getFile(
          req.files,
          "pickupPhoto"
        );

      const pickupTime =
        parseDate(
          req.body.pickupTime,
          "pickupTime"
        );

      const existingOrder =
        await Order.findOne({
          rider:
            req.user._id,

          status:
            "picked_up",
        }).select("_id");

      if (existingOrder) {
        res.status(409);

        throw new Error(
          "Complete the current order before creating another pickup"
        );
      }

      console.log(
        "[Pickup] file received",
        {
          fieldname:
            pickupFile.fieldname,

          mimetype:
            pickupFile.mimetype,

          size:
            pickupFile.size,

          bufferSize:
            pickupFile.buffer
              ?.length,
        }
      );

      const pickupUpload =
        await uploadBufferToCloudinary(
          pickupFile.buffer,
          "delivery-app/pickup"
        );

      if (
        !pickupUpload?.secure_url ||
        !pickupUpload?.public_id
      ) {
        throw new Error(
          "Pickup image upload failed"
        );
      }

      /*
       * Generate permanent unique order ID.
       *
       * Example:
       * 100001
       * 100002
       * 100003
       */
      const orderId =
        await getNextOrderId();

      const order =
        await Order.create({
          orderId,

          rider:
            req.user._id,

          supervisor:
            req.user.supervisor,

          pickupPhoto: {
            url:
              pickupUpload.secure_url,

            publicId:
              pickupUpload.public_id,

            takenAt:
              pickupTime,
          },

          pickupTime,

          status:
            "picked_up",

          notes:
            req.body.notes?.trim() ||
            "",
        });

      res.status(201).json({
        success: true,

        message:
          "Pickup order created",

        order,
      });
    }
  );

/**
 * DRIVER
 * Step 2:
 * Driver takes delivery photo and completes the order.
 */
export const completeOrderDelivery =
  asyncHandler(
    async (req, res) => {
      if (
        req.user.role !==
        "driver"
      ) {
        res.status(403);

        throw new Error(
          "Only drivers can complete orders",
        );
      }

      const deliveryFile =
        getFile(
          req.files,
          "deliveryPhoto",
        );

      const deliveryTime =
        parseDate(
          req.body.deliveryTime,
          "deliveryTime",
        );

      const order =
        await Order.findOne({
          _id: req.params.id,

          rider:
            req.user._id,

          status:
            "picked_up",
        });

      if (!order) {
        res.status(404);

        throw new Error(
          "Active order not found",
        );
      }

      if (
        deliveryTime.getTime() <
        order.pickupTime.getTime()
      ) {
        res.status(400);

        throw new Error(
          "deliveryTime cannot be before pickupTime",
        );
      }

      console.log(
        "[Delivery] file received",
        {
          fieldname:
            deliveryFile.fieldname,

          mimetype:
            deliveryFile.mimetype,

          size:
            deliveryFile.size,

          bufferSize:
            deliveryFile.buffer
              ?.length,
        },
      );

      const deliveryUpload =
        await uploadBufferToCloudinary(
          deliveryFile.buffer,
          "delivery-app/delivery",
        );

      if (
        !deliveryUpload
          ?.secure_url ||
        !deliveryUpload
          ?.public_id
      ) {
        throw new Error(
          "Delivery image upload failed",
        );
      }

      order.deliveryPhoto = {
        url:
          deliveryUpload
            .secure_url,

        publicId:
          deliveryUpload
            .public_id,

        takenAt:
          deliveryTime,
      };

      order.deliveryTime =
        deliveryTime;

     const effectivePickupTime =
  normalizeOvernightPickupTime(
    order.pickupTime,
    deliveryTime
  );

order.deliveryPhoto = {
  url:
    deliveryUpload
      .secure_url,

  publicId:
    deliveryUpload
      .public_id,

  takenAt:
    deliveryTime,
};

/*
 * If pickup and delivery crossed
 * midnight in Riyadh, this becomes
 * 00:01 of the delivery day.
 *
 * pickupPhoto.takenAt is intentionally
 * left unchanged as the real photo time.
 */
order.pickupTime =
  effectivePickupTime;

order.deliveryTime =
  deliveryTime;

order.durationSeconds =
  Math.max(
    0,
    Math.floor(
      (
        deliveryTime.getTime() -
        effectivePickupTime.getTime()
      ) / 1000
    )
  );

order.status =
  "delivered";

await order.save();

      order.status =
        "delivered";

      await order.save();

      res.json({
        success: true,

        message:
          "Order delivered successfully",

        order,
      });
    },
  );



  /**
 * DRIVER
 * Cancel current picked-up order.
 */
export const cancelOrder =
  asyncHandler(
    async (req, res) => {
      if (
        req.user.role !==
        "driver"
      ) {
        res.status(403);

        throw new Error(
          "Only drivers can cancel orders"
        );
      }

      const cancellationReason =
        req.body
          .cancellationReason
          ?.trim();

      const cancellationNotes =
        req.body
          .cancellationNotes
          ?.trim() || "";

      if (
        !cancellationReason
      ) {
        res.status(400);

        throw new Error(
          "Cancellation reason is required"
        );
      }

      if (
        !CANCELLATION_REASONS.includes(
          cancellationReason
        )
      ) {
        res.status(400);

        throw new Error(
          "Invalid cancellation reason"
        );
      }

      /*
       * If the driver selects "other",
       * require an explanation.
       */
      if (
        cancellationReason ===
          "other" &&
        !cancellationNotes
      ) {
        res.status(400);

        throw new Error(
          "Cancellation notes are required when reason is other"
        );
      }

      const order =
        await Order.findOne({
          _id:
            req.params.id,

          rider:
            req.user._id,

          status:
            "picked_up",
        });

      if (!order) {
        res.status(404);

        throw new Error(
          "Active order not found"
        );
      }

      const cancelledAt =
        parseDate(
          req.body.cancelledAt,
          "cancelledAt"
        );

      if (
        cancelledAt.getTime() <
        order.pickupTime.getTime()
      ) {
        res.status(400);

        throw new Error(
          "cancelledAt cannot be before pickupTime"
        );
      }

      const cancellationFiles =
        getImageFiles(
          req.files,
          "cancellationPhotos"
        );

      /*
       * Optional safety limit.
       */
      if (
        cancellationFiles.length >
        5
      ) {
        res.status(400);

        throw new Error(
          "Maximum 5 cancellation photos are allowed"
        );
      }

      const cancellationPhotos =
        [];

      for (
        const file of
        cancellationFiles
      ) {
        const upload =
          await uploadBufferToCloudinary(
            file.buffer,
            "delivery-app/cancellations"
          );

        if (
          !upload?.secure_url ||
          !upload?.public_id
        ) {
          throw new Error(
            "Cancellation image upload failed"
          );
        }

        cancellationPhotos.push({
          url:
            upload.secure_url,

          publicId:
            upload.public_id,

          takenAt:
            cancelledAt,
        });
      }

      order.status =
        "cancelled";

      order.cancelledAt =
        cancelledAt;

      order.cancellationReason =
        cancellationReason;

      order.cancellationNotes =
        cancellationNotes;

      order.cancellationPhotos =
        cancellationPhotos;

      /*
       * Do not set delivery information
       * for cancelled orders.
       */
      order.deliveryTime =
        null;

      order.deliveryPhoto =
        null;

      /*
       * Duration until cancellation.
       */
      order.durationSeconds =
        Math.max(
          0,
          Math.floor(
            (
              cancelledAt.getTime() -
              order.pickupTime.getTime()
            ) / 1000
          )
        );

      await order.save();

      res.json({
        success: true,

        message:
          "Order cancelled successfully",

        order,
      });
    }
  );
export const getMyOrders = asyncHandler(
  async (req, res) => {
    const orders = await Order.find({
      rider: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate(
        "rider",
        "name iqamaId"
      );

    res.json({
      success: true,
      count: orders.length,
      orders,
    });
  }
);


export const getSupervisorOrders =
  asyncHandler(
    async (req, res) => {
      if (
        req.user.role !==
        "supervisor"
      ) {
        res.status(403);

        throw new Error(
          "Only supervisors can view driver orders",
        );
      }

      const page =
        Math.max(
          1,
          Number(req.query.page) ||
            1,
        );

      const limit =
        Math.min(
          50,
          Math.max(
            1,
            Number(
              req.query.limit,
            ) || 10,
          ),
        );

      const skip =
        (page - 1) *
        limit;

      const {
        driverId,
        status,
        from,
        to,
      } = req.query;

      const filter = {
        supervisor:
          req.user._id,
      };

      /*
       * Filter by specific driver.
       */
      if (driverId) {
        filter.rider =
          driverId;
      }

      /*
       * Filter by order status.
       */
      if (
        status &&
        [
          "picked_up",
          "delivered",
          "cancelled",
        ].includes(status)
      ) {
        filter.status =
          status;
      }

      /*
       * Date filter.
       *
       * Dates are interpreted
       * in Asia/Riyadh.
       */
      if (from || to) {
        filter.createdAt =
          {};

        if (from) {
          const fromDate =
            DateTime.fromISO(
              from,
              {
                zone:
                  TIME_ZONE,
              },
            )
              .startOf("day")
              .toUTC()
              .toJSDate();

          if (
            Number.isNaN(
              fromDate.getTime(),
            )
          ) {
            res.status(400);

            throw new Error(
              "Invalid from date",
            );
          }

          filter.createdAt.$gte =
            fromDate;
        }

        if (to) {
          const toDate =
            DateTime.fromISO(
              to,
              {
                zone:
                  TIME_ZONE,
              },
            )
              .endOf("day")
              .toUTC()
              .toJSDate();

          if (
            Number.isNaN(
              toDate.getTime(),
            )
          ) {
            res.status(400);

            throw new Error(
              "Invalid to date",
            );
          }

          filter.createdAt.$lte =
            toDate;
        }
      }

      const [
        orders,
        total,
      ] =
        await Promise.all([
          Order.find(
            filter,
          )
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit)
            .populate(
              "rider",
              "name iqamaId phone isActive vehicleType",
            )
            .lean(),

          Order.countDocuments(
            filter,
          ),
        ]);

      const totalPages =
        Math.max(
          1,
          Math.ceil(
            total /
              limit,
          ),
        );

      res.json({
        success: true,

        pagination: {
          page,
          limit,
          total,
          totalPages,

          hasNextPage:
            page <
            totalPages,

          hasPreviousPage:
            page > 1,
        },

        filters: {
          driverId:
            driverId ||
            null,

          status:
            status ||
            null,

          from:
            from ||
            null,

          to:
            to ||
            null,
        },

        orders,
      });
    },
  );

/**
 * DRIVER
 * Get current active order.
 */
export const getActiveOrder = asyncHandler(
  async (req, res) => {
    const order = await Order.findOne({
      rider: req.user._id,
      status: "picked_up",
    })
      .sort({ createdAt: -1 })
      .populate(
        "rider",
        "name iqamaId"
      );

    res.json({
      success: true,
      order,
    });
  }
);

/**
 * DRIVER
 * Get one of driver's own orders.
 */
export const getOrderById = asyncHandler(
  async (req, res) => {
    const order = await Order.findOne({
      _id: req.params.id,
      rider: req.user._id,
    }).populate(
      "rider",
      "name iqamaId"
    );

    if (!order) {
      res.status(404);
      throw new Error("Order not found");
    }

    res.json({
      success: true,
      order,
    });
  }
);

/**
 * DRIVER
 * Delete driver's own order.
 *
 * You may later want to remove this entirely
 * and allow deletion only for supervisors/admins.
 */
export const deleteOrder = asyncHandler(
  async (req, res) => {
    const order = await Order.findOneAndDelete({
      _id: req.params.id,
      rider: req.user._id,
    });

    if (!order) {
      res.status(404);
      throw new Error("Order not found");
    }

    res.json({
      success: true,
      message: "Order deleted",
    });
  }
);


export const getSupervisorActiveOrders = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "supervisor") {
      res.status(403);

      throw new Error(
        "Only supervisors can view active driver orders",
      );
    }

  

const orders =
  await Order.find({
    supervisor:
      req.user._id,

    status:
      "picked_up",
  })
    .sort({
      pickupTime: -1,
    })
    .populate(
      "rider",
      "name iqamaId phone isActive  vehicleType",
    );;

    res.json({
      success: true,

      count: orders.length,

      orders,
    });
  },
);