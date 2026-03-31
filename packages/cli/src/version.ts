import { createRequire } from "node:module";

declare const __AXM_VERSION__: string;

export const loadVersion = (): string => {
  if (typeof __AXM_VERSION__ === "string" && __AXM_VERSION__.length > 0) {
    return __AXM_VERSION__;
  }

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
