import { Router } from "express";

import {
  getAppVersion,
} from "../controllers/appVersion.controller.js";

const router = Router();

router.get("/version", getAppVersion);

export default router;