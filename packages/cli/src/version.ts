import { createRequire } from "node:module";

export const loadVersion = (): string => {
  const require = createRequire(import.meta.url);
  for (const relPath of ["../package.json", "../../package.json"]) {
    try {
      return (require(relPath) as { version: string }).version;
    } catch {
      continue;
    }
  }
  return "unknown";
};
