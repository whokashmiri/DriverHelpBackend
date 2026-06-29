import { v2 as cloudinary } from "cloudinary";

// console.log("ENV CHECK FROM cloudinary.js");
// console.log("Cloud name in config:", process.env.CLOUDINARY_CLOUD_NAME);
// console.log("API key in config loaded:", Boolean(process.env.CLOUDINARY_API_KEY));
// console.log(
//   "API secret in config loaded:",
//   Boolean(process.env.CLOUDINARY_API_SECRET)
// );

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;