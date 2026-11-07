import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { sendPushToDriver } from "../src/services/push.service.js";

async function main() {
  await connectDB();

  const driver = await User.findOne({
    iqamaId: "111111",
    role: "driver",
  }).select("+pushTokens");

  if (!driver?.pushTokens?.length) {
    throw new Error("Driver has no registered push tokens");
  }

  const result = await sendPushToDriver({
    driver,
    title: "Spark Go - Backend Test",
    body: "Notification sent from your local Node.js backend.",
    data: {
      type: "test",
    },
  });

  console.log("[PUSH TEST]", result);
}

main()
  .catch(console.error)
  .finally(() => mongoose.disconnect());