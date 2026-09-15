import cloudinary from "../config/cloudinary.js";

export function uploadBufferToCloudinary(
  buffer,
  folder,
) {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      const error = new Error(
        "Invalid upload buffer",
      );

      error.statusCode = 400;

      reject(error);

      return;
    }

    if (buffer.length === 0) {
      const error = new Error(
        "Upload buffer is empty",
      );

      error.statusCode = 400;

      reject(error);

      return;
    }

    console.log(
      "[Cloudinary] upload start",
      {
        folder,
        size: buffer.length,
      },
    );

    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      const error = new Error(
        "Cloudinary upload timed out",
      );

      error.statusCode = 504;

      reject(error);
    }, 60_000);

    const uploadStream =
      cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
        },
        (error, result) => {
          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(timeout);

          if (error) {
            console.error(
              "[Cloudinary] upload failed",
              {
                message:
                  error?.message,
                name:
                  error?.name,
                httpCode:
                  error?.http_code,
              },
            );

            reject(error);

            return;
          }

          if (
            !result?.secure_url ||
            !result?.public_id
          ) {
            const resultError =
              new Error(
                "Cloudinary returned an invalid upload response",
              );

            reject(resultError);

            return;
          }

          console.log(
            "[Cloudinary] upload success",
            {
              publicId:
                result.public_id,
              bytes:
                result.bytes,
              format:
                result.format,
            },
          );

          resolve(result);
        },
      );

    uploadStream.on(
      "error",
      (error) => {
        if (settled) {
          return;
        }

        settled = true;

        clearTimeout(timeout);

        console.error(
          "[Cloudinary] stream error",
          error,
        );

        reject(error);
      },
    );

    uploadStream.end(buffer);
  });
}