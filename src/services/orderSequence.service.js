import { OrderSequence } from "../models/OrderSequence.js";

const ORDER_SEQUENCE_ID =
  "order_id";

export async function getNextOrderId() {
  const sequence =
    await OrderSequence.findOneAndUpdate(
      {
        _id:
          ORDER_SEQUENCE_ID,
      },

      {
        $inc: {
          value: 1,
        },
      },

      {
        upsert: true,
        new: true,

        setDefaultsOnInsert:
          true,
      },
    );

  return sequence.value;
}