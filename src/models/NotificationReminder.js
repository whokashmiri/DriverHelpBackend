
import mongoose from "mongoose";

const notificationReminderSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "shift_not_started",
        "shift_overdue",
      ],
      required: true,
    },


    referenceKey: {
      type: String,
      required: true,
      trim: true,
    },

    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverShift",
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "submitted",
        "failed",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
    },

 
    submittedAt: {
      type: Date,
      default: null,
    },

    lastAttemptAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },

    
    pushTicketIds: {
      type: [String],
      default: [],
    },
    pushTickets: {
  type: [
    {
      _id: false,
      id: {
        type: String,
        required: true,
      },
      token: {
        type: String,
        required: true,
      },
    },
  ],
  default: [],
},

receiptsCheckedAt: {
  type: Date,
  default: null,
},
  },
  {
    timestamps: true,
  },
);


notificationReminderSchema.index(
  {
    driver: 1,
    type: 1,
    referenceKey: 1,
  },
  {
    unique: true,
    name: "unique_driver_notification_reminder",
  },
);

notificationReminderSchema.index({
  status: 1,
  lockedUntil: 1,
  createdAt: 1,
});

export const NotificationReminder =
  mongoose.models.NotificationReminder ||
  mongoose.model(
    "NotificationReminder",
    notificationReminderSchema,
    "notificationreminders",
  );
