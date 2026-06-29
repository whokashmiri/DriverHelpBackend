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

router.post(
  "/pickup",
  upload.fields([{ name: "pickupPhoto", maxCount: 1 }]),
  createPickupOrder
);

router.patch(
  "/:id/delivery",
  upload.fields([{ name: "deliveryPhoto", maxCount: 1 }]),
  completeOrderDelivery
);

router.get("/active", getActiveOrder);
router.get("/my", getMyOrders);
router.get("/:id", getOrderById);
router.delete("/:id", deleteOrder);

export default router;