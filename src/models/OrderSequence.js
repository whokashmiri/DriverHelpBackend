import mongoose from "mongoose";

const orderSequenceSchema =
  new mongoose.Schema(
    {
      _id: {
        type: String,
        required: true,
      },

      value: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
    },
    {
      versionKey: false,
      timestamps: false,
    },
  );

export const OrderSequence =
  mongoose.models.OrderSequence ||
  mongoose.model(
    "OrderSequence",
    orderSequenceSchema,
    "order_sequences",
  );