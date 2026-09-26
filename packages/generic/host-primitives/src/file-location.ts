/** Local file locations at AXM's host boundary. */

// Intentional escape hatch: node:url owns URL/path conversion on the host.
import { fileURLToPath, pathToFileURL } from "node:url";

/** Encode a filesystem path as a file URL. */
export const toFileLocation = (path: string): string => pathToFileURL(path).href;

/** Decode file URLs while preserving other ref-location schemes unchanged. */
export const fromFileLocation = (location: string): string =>
  location.startsWith("file:") ? fileURLToPath(location) : location;
