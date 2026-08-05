import type { PackTrustManifest } from "../trust/index.js";
import type { PackManifest } from "./manifest-schema.js";

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
};

/**
 * Capture the manifest fields needed to classify a later authored-pack edit.
 * The opaque metadata identity intentionally excludes identity, version, and
 * membership so diagnostics can report those changes separately.
 */
export const packTrustManifest = (manifest: PackManifest): PackTrustManifest => {
  const { owner, name, version, dependencies, type: _, ...metadata } = manifest;
  void _;
  return {
    owner,
    name,
    version,
    dependencies,
    metadataIdentity: JSON.stringify(sortJson(metadata)),
  };
};
