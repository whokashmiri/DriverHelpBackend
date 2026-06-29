import cloudinary from "../config/cloudinary.js";

export function uploadBufferToCloudinary(buffer, folder) {
  // console.log("Uploading to Cloudinary...");
  // console.log("Folder:", folder);
  // console.log("Buffer exists:", Boolean(buffer));
  // console.log("Buffer size:", buffer?.length);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          // console.log("Cloudinary upload error message:", error.message);
          // console.log("Cloudinary upload error name:", error.name);
          // console.log("Cloudinary upload error http_code:", error.http_code);
          reject(error);
          return;
        }

        // console.log("Cloudinary upload success:", result.secure_url);

        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}