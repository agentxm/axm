import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import * as semver from "semver";

export class SupersededRelease extends Error {
  constructor(
    readonly candidate: string,
    readonly observed: string,
    readonly owner: string,
  ) {
    super(`Superseded candidate ${candidate}: ${owner} already exposes ${observed}.`);
  }
}

export const guardPublicationVersion = (
  candidate: string,
  observed: string | null,
  owner: string,
): void => {
  if (semver.valid(candidate) === null || semver.prerelease(candidate) !== null)
    throw new Error("Expected a stable release version.");
  if (observed === null) return;
  if (semver.valid(observed) === null) throw new Error(`${owner} returned an invalid version.`);
  if (semver.gt(observed, candidate)) throw new SupersededRelease(candidate, observed, owner);
};

export const contentIntegrity = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** Existence-read failures propagate; only an affirmative absence permits a write. */
export const publishImmutable = async (input: {
  readonly name: string;
  readonly integrity: string;
  readonly read: () => Promise<string | null>;
  readonly publish: () => Promise<void>;
}): Promise<"reused" | "published"> => {
  const existing = await input.read();
  if (existing !== null) {
    if (existing !== input.integrity)
      throw new Error(`Published content integrity conflict: ${input.name}.`);
    return "reused";
  }
  await input.publish();
  if ((await input.read()) !== input.integrity)
    throw new Error(`Published content readback failed: ${input.name}.`);
  return "published";
};

export interface PublicationBoundary {
  readonly name: "artifacts" | "npm" | "tap";
  readonly publish: () => Promise<void>;
}
export type PublicationStates = Record<
  PublicationBoundary["name"],
  "pending" | "succeeded" | "failed" | "superseded"
>;

/** Preflight all mutable owners before any publication; recheck each owner at its write boundary. */
export const distributeRelease = async (
  preflight: () => Promise<void>,
  boundaries: ReadonlyArray<PublicationBoundary>,
  record: (states: PublicationStates) => void,
): Promise<"distributed" | "superseded"> => {
  const states: PublicationStates = { artifacts: "pending", npm: "pending", tap: "pending" };
  let active: PublicationBoundary["name"] | undefined;
  try {
    await preflight();
    for (const boundary of boundaries) {
      active = boundary.name;
      await boundary.publish();
      states[active] = "succeeded";
      record({ ...states });
    }
    return "distributed";
  } catch (error) {
    if (active !== undefined)
      states[active] = error instanceof SupersededRelease ? "superseded" : "failed";
    record({ ...states });
    if (error instanceof SupersededRelease) {
      console.log(error.message);
      return "superseded";
    }
    throw error;
  }
};

const NpmMetadata = Schema.Struct({
  "dist-tags": Schema.Record(Schema.String, Schema.String),
  versions: Schema.Record(Schema.String, Schema.Unknown),
});
const PublishedVersion = Schema.Struct({ dist: Schema.Struct({ integrity: Schema.String }) });

export const readNpmPublication = async (
  name: string,
  version: string,
  fetchImplementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
): Promise<{ readonly latest: string | null; readonly integrity: string | null }> => {
  const response = await fetchImplementation(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    { cache: "no-store", signal: AbortSignal.timeout(30_000) },
  );
  if (response.status === 404) return { latest: null, integrity: null };
  if (response.status !== 200)
    throw new Error(`npm existence query failed for ${name}: HTTP ${response.status}.`);
  const metadata = Schema.decodeUnknownSync(NpmMetadata)(await response.json());
  const published = metadata.versions[version];
  return {
    latest: metadata["dist-tags"]["latest"] ?? null,
    integrity:
      published === undefined
        ? null
        : Schema.decodeUnknownSync(PublishedVersion)(published).dist.integrity,
  };
};
