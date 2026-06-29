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

function getFile(files, fieldName) {
  const file = files?.[fieldName]?.[0];

  if (!file) {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  return file;
}

/**
 * STEP 1:
 * Rider takes pickup photo.
 * Create order immediately.
 */
export const createPickupOrder = asyncHandler(async (req, res) => {
  // console.log("CREATE PICKUP ORDER");
  // console.log("User:", req.user?._id?.toString());
  // console.log("Body:", req.body);
  // console.log("Files keys:", Object.keys(req.files || {}));
  // console.log("Pickup file exists:", Boolean(req.files?.pickupPhoto?.[0]));
  // console.log("Pickup file size:", req.files?.pickupPhoto?.[0]?.size);

  const pickupFile = getFile(req.files, "pickupPhoto");
  const pickupTime = parseDate(req.body.pickupTime, "pickupTime");

  const pickupUpload = await uploadBufferToCloudinary(
    pickupFile.buffer,
    "delivery-app/pickup"
  );

  const order = await Order.create({
    rider: req.user._id,
    pickupPhoto: {
      url: pickupUpload.secure_url,
      publicId: pickupUpload.public_id,
      takenAt: pickupTime,
    },
    pickupTime,
    status: "picked_up",
    notes: req.body.notes || "",
  });

  res.status(201).json({
    success: true,
    message: "Pickup order created",
    order,
  });
});
/**
 * STEP 2:
 * Rider later takes delivery photo.
 * Update existing order.
 */
export const completeOrderDelivery = asyncHandler(async (req, res) => {
  const deliveryFile = getFile(req.files, "deliveryPhoto");
  const deliveryTime = parseDate(req.body.deliveryTime, "deliveryTime");

  const order = await Order.findOne({
    _id: req.params.id,
    rider: req.user._id,
  });

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.status === "delivered") {
    res.status(400);
    throw new Error("Order already delivered");
  }

  if (deliveryTime.getTime() < order.pickupTime.getTime()) {
    res.status(400);
    throw new Error("deliveryTime cannot be before pickupTime");
  }

 const deliveryUpload = await uploadBufferToCloudinary(
  deliveryFile.buffer,
  "delivery-app/delivery"
);

  const durationSeconds = Math.floor(
    (deliveryTime.getTime() - order.pickupTime.getTime()) / 1000
  );

  order.deliveryPhoto = {
    url: deliveryUpload.secure_url,
    publicId: deliveryUpload.public_id,
    takenAt: deliveryTime,
  };

  order.deliveryTime = deliveryTime;
  order.durationSeconds = durationSeconds;
  order.status = "delivered";

  await order.save();

  res.json({
    success: true,
    message: "Order delivered successfully",
    order,
  });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ rider: req.user._id })
    .sort({ createdAt: -1 })
    .populate("rider", "iqamaId");

  res.json({
    success: true,
    count: orders.length,
    orders,
  });
});

export const getActiveOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    rider: req.user._id,
    status: "picked_up",
  })
    .sort({ createdAt: -1 })
    .populate("rider", "iqamaId");

  res.json({
    success: true,
    order,
  });
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    rider: req.user._id,
  }).populate("rider", "iqamaId");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  res.json({
    success: true,
    order,
  });
});

export const deleteOrder = asyncHandler(async (req, res) => {
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
});