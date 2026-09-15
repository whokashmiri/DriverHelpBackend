import mongoose from "mongoose";

const driverShiftSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      required: true,
      index: true,
    },

    supervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      required: true,
      index: true,
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    durationSeconds: {
      type: Number,
      default: null,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

driverShiftSchema.index({
  driver: 1,
  startedAt: -1,
});

driverShiftSchema.index({
  supervisor: 1,
  startedAt: -1,
});

driverShiftSchema.index({
  driver: 1,
  status: 1,
});

export const DriverShift =
  mongoose.models.DriverShift ||
  mongoose.model("DriverShift", driverShiftSchema);