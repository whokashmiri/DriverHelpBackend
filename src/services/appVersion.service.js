import { readFile } from "node:fs/promises";

const versionFile = new URL(
  "../config/version.json",
  import.meta.url
);

export async function getVersionConfig() {
  const content = await readFile(versionFile, "utf8");
  return JSON.parse(content);
}

export async function checkAppVersion({
  role,
  platform,
  versionCode,
  socket = false,
}) {
  // Initially enforce updates for drivers only.
  if (role !== "driver") {
    return { allowed: true };
  }

  const config = await getVersionConfig();
  const android = config.android;

  if (!android.forceUpdate) {
    return { allowed: true };
  }

  // Socket enforcement can be activated separately.
  if (socket && !android.enforceSocket) {
    return { allowed: true };
  }

  const normalizedPlatform =
    typeof platform === "string"
      ? platform.toLowerCase().trim()
      : "";

  // Explicitly reported non-Android clients are not
  // covered by this Android policy.
  if (
    normalizedPlatform &&
    normalizedPlatform !== "android"
  ) {
    return { allowed: true };
  }

  const code = Number(versionCode);

  const hasValidVersion =
    versionCode !== undefined &&
    versionCode !== null &&
    String(versionCode).trim() !== "" &&
    Number.isSafeInteger(code) &&
    code > 0;

  // Legacy clients may not send version information.
  if (!hasValidVersion && !android.enforceMissingVersion) {
    return { allowed: true };
  }

  const requiresUpdate =
    !hasValidVersion ||
    code < android.minimumVersionCode;

  if (!requiresUpdate) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 426,
    code: "APP_UPDATE_REQUIRED",
    message:
      "A new version of Spark Go is required to continue.",
    minimumVersionCode: android.minimumVersionCode,
    latestVersionCode: android.latestVersionCode,
    storeUrl: android.storeUrl,
  };
}