import express from "express";

import {
  cancelOrder,
  completeOrderDelivery,
  createPickupOrder,
  deleteOrder,
  getActiveOrder,
  getMyOrders,
  getOrderById,
  getSupervisorActiveOrders,
  getSupervisorOrders,
} from "../controllers/order.controller.js";

import { protect } from "../middleware/auth.middleware.js";

import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

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
  createPickupOrder,
);

/**
 * DRIVER
 * Complete active order.
 */
router.patch(
  "/:id/delivery",
  upload.fields([
    {
      name: "deliveryPhoto",
      maxCount: 1,
    },
  ]),
  completeOrderDelivery,
);

/**
 * DRIVER
 * Cancel active order.
 *
 * Body:
 * cancellationReason
 * cancellationNotes
 * cancelledAt
 *
 * Files:
 * cancellationPhotos[]
 */
router.patch(
  "/:id/cancel",
  upload.fields([
    {
      name: "cancellationPhotos",
      maxCount: 5,
    },
  ]),
  cancelOrder,
);

/**
 * DRIVER
 * Get active order.
 */
router.get(
  "/active",
  getActiveOrder,
);

/**
 * DRIVER
 * Get driver's orders.
 */
router.get(
  "/my",
  getMyOrders,
);

/**
 * SUPERVISOR
 * Get active driver orders.
 */
router.get(
  "/supervisor/active",
  getSupervisorActiveOrders,
);


router.get(
  "/supervisor/history",
  getSupervisorOrders,
);

/**
 * DRIVER
 * Get single order.
 */
router.get(
  "/:id",
  getOrderById,
);

/**
 * DRIVER
 * Delete own order.
 */
router.delete(
  "/:id",
  deleteOrder,
);

export default router;