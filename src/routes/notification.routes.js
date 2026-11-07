
import express from "express";

import {
  registerPushToken,
  unregisterPushToken,
} from "../controllers/notification.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();


router.use(protect);


router.post("/token", registerPushToken);


router.delete("/token", unregisterPushToken);

export default router;
