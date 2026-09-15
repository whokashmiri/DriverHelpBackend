import express from "express";
import multer from "multer";

import {
  completeOrderDelivery,
  createPickupOrder,
  deleteOrder,
  getActiveOrder,
  getMyOrders,
  getOrderById,
} from "../controllers/order.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

router.use(protect);

/**
 * DRIVER
 * Create pickup order.
 */
router.post(
  "/pickup",
  upload.fields([
    {
      name: "pickupPhoto",
      maxCount: 1,
    },
  ]),
  createPickupOrder
);

/**
 * DRIVER
 * Complete delivery.
 */
router.patch(
  "/:id/delivery",
  upload.fields([
    {
      name: "deliveryPhoto",
      maxCount: 1,
    },
  ]),
  completeOrderDelivery
);

/**
 * DRIVER
 * Current active/picked-up order.
 */
router.get(
  "/active",
  getActiveOrder
);

/**
 * DRIVER
 * Driver's own orders.
 */
router.get(
  "/my",
  getMyOrders
);

/**
 * DRIVER
 * One own order.
 */
router.get(
  "/:id",
  getOrderById
);

/**
 * DRIVER
 * Delete own order.
 *
 * Consider removing this later.
 */
router.delete(
  "/:id",
  deleteOrder
);

export default router;