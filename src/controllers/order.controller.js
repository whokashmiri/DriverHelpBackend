import { DateTime } from "luxon";
import { Order } from "../models/Order.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary.js";

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
  const now = DateTime.now().setZone("Asia/Riyadh");

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



/**
 * DRIVER
 * Step 1:
 * Driver takes pickup photo and creates the order.
 */
export const createPickupOrder = asyncHandler(async (req, res) => {
  if (req.user.role !== "driver") {
    res.status(403);
    throw new Error("Only drivers can create orders");
  }

  if (!req.user.supervisor) {
    res.status(400);
    throw new Error("Driver is not assigned to a supervisor");
  }

  const pickupFile = getFile(req.files, "pickupPhoto");

  const pickupTime = parseDate(
    req.body.pickupTime,
    "pickupTime"
  );

  const existingOrder =
  await Order.findOne({
    rider: req.user._id,
    status: "picked_up",
  }).select("_id");

if (existingOrder) {
  res.status(409);

  throw new Error(
    "Complete the current order before creating another pickup",
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
      pickupFile.buffer?.length,
  },
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
    "Pickup image upload failed",
  );
}
  const order = await Order.create({
    rider: req.user._id,

    supervisor: req.user.supervisor,

    pickupPhoto: {
      url: pickupUpload.secure_url,
      publicId: pickupUpload.public_id,
      takenAt: pickupTime,
    },

    pickupTime,

    status: "picked_up",

    notes: req.body.notes?.trim() || "",
  });

  res.status(201).json({
    success: true,
    message: "Pickup order created",
    order,
  });
});

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

      order.durationSeconds =
        Math.floor(
          (
            deliveryTime.getTime() -
            order.pickupTime.getTime()
          ) / 1000,
        );

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
 * Get driver's own orders.
 */
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

    const { start, end } = getRiyadhTodayRange();

    const orders = await Order.find({
      /*
       * The order belongs to a driver,
       * but this field identifies which
       * supervisor owns/manages that driver/order.
       */
      supervisor: req.user._id,

      /*
       * Active order.
       */
      status: "picked_up",

      /*
       * Current Riyadh day only.
       */
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .sort({
        pickupTime: -1,
      })
      .populate(
        "rider",
        "name iqamaId phone isActive",
      );

    res.json({
      success: true,

      count: orders.length,

      orders,
    });
  },
);