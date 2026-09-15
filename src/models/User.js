import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    iqamaId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: ["driver", "supervisor", "admin"],
      default: "driver",
      required: true,
      index: true,
    },

    supervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      default: null,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogisticsUser",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Hash password before save
 */
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

/**
 * Compare login password
 */
userSchema.methods.matchPassword = async function matchPassword(
  enteredPassword
) {
  return bcrypt.compare(enteredPassword, this.password);
};

export const User =
  mongoose.models.LogisticsUser ||
  mongoose.model(
    "LogisticsUser",
    userSchema,
    "logisticsusers"
  );