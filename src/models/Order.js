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
 orderId: {
  type: Number,
  default: null,
  immutable: true,
},
    rider: {
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
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "picked_up",
        "delivered",
        "cancelled",
      ],
      default: "picked_up",
      index: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    /*
     * Cancellation information.
     *
     * Only populated when:
     * status === "cancelled"
     */
    cancellationReason: {
      type: String,
      enum: [
        "customer_unavailable",
        "wrong_address",
        "vehicle_issue",
        "order_issue",
        "emergency",
        "other",
      ],
      default: null,
    },

    cancellationNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    cancellationPhotos: {
      type: [photoSchema],
      default: [],
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({
  supervisor: 1,
  createdAt: -1,
});

orderSchema.index({
  rider: 1,
  createdAt: -1,
});

orderSchema.index({
  supervisor: 1,
  status: 1,
  createdAt: -1,
});

orderSchema.index(
  {
    orderId: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      orderId: {
        $type: "number",
      },
    },
  },
);

export const Order =
  mongoose.models.Order ||
  mongoose.model("Order", orderSchema);