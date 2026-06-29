import dotenv from "dotenv";
dotenv.config();

// console.log("ENV CHECK FROM server.js");
// console.log("PORT:", process.env.PORT);
// console.log("Mongo loaded:", Boolean(process.env.MONGO_URI));
// console.log("JWT loaded:", Boolean(process.env.JWT_SECRET));
// console.log("Cloud name:", process.env.CLOUDINARY_CLOUD_NAME);
// console.log("Cloudinary key loaded:", Boolean(process.env.CLOUDINARY_API_KEY));
// console.log(
//   "Cloudinary secret loaded:",
//   Boolean(process.env.CLOUDINARY_API_SECRET)
// );

const { default: app } = await import("./app.js");
const { connectDB } = await import("./config/db.js");

const PORT = process.env.PORT || 5000;

await connectDB();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});