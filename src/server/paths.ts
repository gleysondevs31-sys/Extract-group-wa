import fs from "node:fs/promises";

export const paths = {
  session: process.env.SESSION_PATH || "./data/auth_info",
  exports: process.env.EXPORT_PATH || "./data/exports",
  logs: process.env.LOG_PATH || "./data/logs",
};

export async function ensureDataDirs() {
  await Promise.all(Object.values(paths).map((path) => fs.mkdir(path, { recursive: true })));
}
