import { createRequire } from "node:module";

export const loadVersion = (): string => {
  const require = createRequire(import.meta.url);
  for (const relPath of ["../package.json", "../../package.json"]) {
    try {
      const loaded: unknown = require(relPath);
      if (
        typeof loaded === "object" &&
        loaded !== null &&
        "version" in loaded &&
        typeof loaded.version === "string"
      ) {
        return loaded.version;
      }
    } catch {
      continue;
    }
  }
  return "unknown";
};
