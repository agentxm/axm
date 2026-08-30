import { computeSourceHash, type SourceHash } from "../extensions/rendered-files.js";

interface PackManifestIdentityInput {
  readonly owner: string;
  readonly type: "pack";
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
};

/** Identity of the decoded Pack manifest semantics used to authorize reachability. */
export const computePackManifestContentIdentity = (
  manifest: PackManifestIdentityInput,
): SourceHash =>
  computeSourceHash(
    JSON.stringify(
      normalize({
        owner: manifest.owner,
        type: manifest.type,
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
      }),
    ),
  );
