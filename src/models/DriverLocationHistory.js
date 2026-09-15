import mongoose from "mongoose";

const driverLocationHistorySchema = new mongoose.Schema(
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

    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverShift",
      default: null,
      index: true,
    },

    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    accuracy: {
      type: Number,
      default: null,
      min: 0,
    },

    speed: {
      type: Number,
      default: null,
      min: 0,
    },

    heading: {
      type: Number,
      default: null,
      min: 0,
      max: 360,
    },

    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

driverLocationHistorySchema.index({
  driver: 1,
  recordedAt: -1,
});

driverLocationHistorySchema.index({
  supervisor: 1,
  recordedAt: -1,
});

driverLocationHistorySchema.index({
  shift: 1,
  recordedAt: 1,
});

export const DriverLocationHistory =
  mongoose.models.DriverLocationHistory ||
  mongoose.model(
    "DriverLocationHistory",
    driverLocationHistorySchema
  );