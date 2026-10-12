import bcrypt from "bcryptjs";
import mongoose from "mongoose";


const accommodationLocationSchema =
  new mongoose.Schema(
    {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator(value) {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value.every(Number.isFinite) &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message: "Invalid accommodation coordinates",
        },
      },
    },
    { _id: false },
  );


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

    shortName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    profilePicture: {
      url: {
        type: String,
        default: null,
        trim: true,
      },

      publicId: {
        type: String,
        default: null,
        trim: true,
      },
    },

    vehicleType: {
      type: String,
      enum: ["car", "bike"],
      required: false,
    },

    
vehiclePlateNumber: {
  type: String,
  default: null,
  trim: true,
  uppercase: true,
  maxlength: 20,
},


accommodation: {
  address: {
    type: String,
    default: null,
    trim: true,
  },
  location: {
    type: accommodationLocationSchema,
    default: undefined,
  },
},


    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

   role: {
  type: String,

  enum: [
    "driver",
    "supervisor",
    "admin",
  ],

  default: "driver",

  required: true,

  index: true,
},

canDeliverOrders: {
  type: Boolean,

  default: function () {
    return (
      this.role === "driver"
    );
  },

  index: true,
},

supervisor: {
  type:
    mongoose.Schema.Types
      .ObjectId,

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
  },
);




userSchema.index(
  { "accommodation.location": "2dsphere" },
  {
    name: "accommodation_location_2dsphere",
  },
);



/**
 * Hash password before save
 */
userSchema.pre(
  "save",
  async function hashPassword(next) {
    if (
      !this.isModified(
        "password",
      )
    ) {
      return next();
    }

    const salt =
      await bcrypt.genSalt(
        10,
      );

    this.password =
      await bcrypt.hash(
        this.password,
        salt,
      );

    next();
  },
);

/**
 * Compare login password
 */
userSchema.methods.matchPassword =
  async function matchPassword(
    enteredPassword,
  ) {
    return bcrypt.compare(
      enteredPassword,
      this.password,
    );
  };

export const User =
  mongoose.models
    .LogisticsUser ||
  mongoose.model(
    "LogisticsUser",
    userSchema,
    "logisticsusers",
  );