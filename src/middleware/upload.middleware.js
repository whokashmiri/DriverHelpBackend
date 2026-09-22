import multer from "multer";

const storage =
  multer.memoryStorage();

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]);

function fileFilter(
  req,
  file,
  cb,
) {
  if (
    !ALLOWED_IMAGE_TYPES.has(
      file.mimetype,
    )
  ) {
    cb(
      new Error(
        "Only JPEG, PNG, WEBP, HEIC and HEIF images are allowed",
      ),
      false,
    );

    return;
  }

  cb(null, true);
}

export const upload =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        5 *
        1024 *
        1024,
    },
  });