import { readFile } from "node:fs/promises";

const versionFile = new URL("../config/version.json", import.meta.url);

export async function getAppVersion(req, res, next) {
  try {
    const file = await readFile(versionFile, "utf8");
    const config = JSON.parse(file);
    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
}