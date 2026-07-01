import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    takenAt: {
      type: Date,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const orderSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      required: true,
      index: true,
    },

    pickupPhoto: {
      type: photoSchema,
      required: true,
    },

    deliveryPhoto: {
      type: photoSchema,
      default: null,
    },

    pickupTime: {
      type: Date,
      required: true,
    },

    deliveryTime: {
      type: Date,
      default: null,
    },

    durationSeconds: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["picked_up", "delivered"],
      default: "picked_up",
      index: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);