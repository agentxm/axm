import { createHash } from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { gt, valid } from "semver";
import { SupersededRelease } from "./release-publication.js";
import { EXPECTED_RELEASE_ASSETS } from "./release-checksums.js";

export const LATEST_RELEASE_KEY = "latest.txt";

export class ReleaseStorageError extends Data.TaggedError("ReleaseStorageError")<{
  readonly operation: string;
  readonly detail: string;
}> {}

export interface ReleaseObject {
  readonly bytes: Uint8Array;
  readonly etag: string;
}

export interface ReleaseStorage {
  readonly read: (key: string) => Effect.Effect<ReleaseObject | null, ReleaseStorageError>;
  readonly put: (
    key: string,
    bytes: Uint8Array,
    options: {
      readonly contentType: string;
      readonly cacheControl: string;
      readonly condition: { readonly absent: true } | { readonly etag: string };
    },
  ) => Effect.Effect<void, ReleaseStorageError>;
}

const failure = (operation: string, detail: string) =>
  new ReleaseStorageError({ operation, detail });
const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const stableVersion = (value: string): boolean =>
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(value) && valid(value) === value;

export const inspectLatestRelease = (store: ReleaseStorage, version: string) =>
  Effect.gen(function* () {
    if (!stableVersion(version))
      return yield* failure("preflight", "Invalid stable release version");
    const current = yield* store.read(LATEST_RELEASE_KEY);
    if (current === null) return null;
    const previous = new TextDecoder().decode(current.bytes).trim();
    if (!stableVersion(previous))
      return yield* failure("preflight", "Invalid stored latest version");
    if (gt(previous, version)) {
      return yield* Effect.fail(new SupersededRelease(version, previous, "R2 distribution"));
    }
    return current;
  });

const contentType = (name: string): string =>
  name.endsWith(".json")
    ? "application/json"
    : name === "install.sh"
      ? "text/x-shellscript"
      : name.endsWith(".ps1") ||
          name.endsWith(".cmd") ||
          name.endsWith(".md") ||
          name === "SHA256SUMS"
        ? "text/plain; charset=utf-8"
        : "application/octet-stream";

/** Each object is immutable; ambiguous writes are observed, never blindly repeated. */
const publishObject = (store: ReleaseStorage, key: string, bytes: Uint8Array, type: string) =>
  Effect.gen(function* () {
    const existing = yield* store.read(key);
    const matches = (observed: ReleaseObject | null) =>
      observed !== null && digest(observed.bytes) === digest(bytes);
    if (existing !== null) {
      if (!matches(existing))
        return yield* failure("publish", `Immutable content conflict: ${key}`);
      return;
    }
    yield* store
      .put(key, bytes, {
        contentType: type,
        cacheControl: "public, max-age=31536000, immutable",
        condition: { absent: true },
      })
      .pipe(
        Effect.catch((error) =>
          store
            .read(key)
            .pipe(
              Effect.flatMap((observed) => (matches(observed) ? Effect.void : Effect.fail(error))),
            ),
        ),
      );
    if (!matches(yield* store.read(key))) {
      return yield* failure("readback", `Published object integrity mismatch: ${key}`);
    }
  });

/** Publish a complete cohort before changing its single public selection pointer. */
export const publishReleaseDistribution = (
  store: ReleaseStorage,
  input: {
    readonly version: string;
    readonly commit: string;
    readonly loadAsset: (name: string) => Effect.Effect<Uint8Array, ReleaseStorageError>;
  },
) =>
  Effect.gen(function* () {
    const previous = yield* inspectLatestRelease(store, input.version);
    if (!/^[0-9a-f]{40}$/u.test(input.commit)) {
      return yield* failure("preflight", "Invalid release commit");
    }
    // Validate the entire local cohort before writing any object. Traversal is
    // sequential to bound memory to one native binary and one readback at a time.
    const inventory = yield* Effect.forEach(EXPECTED_RELEASE_ASSETS, (name) =>
      input
        .loadAsset(name)
        .pipe(
          Effect.flatMap((bytes) =>
            bytes.byteLength === 0
              ? Effect.fail(failure("preflight", `Empty release asset: ${name}`))
              : Effect.succeed({ name, sha256: digest(bytes), size: bytes.byteLength }),
          ),
        ),
    );
    const prefix = `cli-v${input.version}/`;
    const manifest = new TextEncoder().encode(
      JSON.stringify({ version: input.version, commit: input.commit, assets: inventory }) + "\n",
    );
    // Check a previously completed release's identity before attempting repairs.
    const existingManifest = yield* store.read(`${prefix}release.json`);
    if (existingManifest !== null && digest(existingManifest.bytes) !== digest(manifest)) {
      return yield* failure("preflight", "Release manifest conflicts with the exact candidate");
    }
    for (const asset of inventory) {
      const bytes = yield* input.loadAsset(asset.name);
      if (digest(bytes) !== asset.sha256)
        return yield* failure("publish", `Local asset changed: ${asset.name}`);
      yield* publishObject(store, `${prefix}${asset.name}`, bytes, contentType(asset.name));
    }
    yield* publishObject(store, `${prefix}release.json`, manifest, "application/json");
    const bytes = new TextEncoder().encode(`${input.version}\n`);
    if (previous !== null && new TextDecoder().decode(previous.bytes).trim() === input.version)
      return;
    yield* store
      .put(LATEST_RELEASE_KEY, bytes, {
        contentType: "text/plain; charset=utf-8",
        cacheControl: "no-store",
        condition: previous === null ? { absent: true } : { etag: previous.etag },
      })
      .pipe(
        Effect.catch((error) =>
          store
            .read(LATEST_RELEASE_KEY)
            .pipe(
              Effect.flatMap((observed) =>
                observed !== null && digest(observed.bytes) === digest(bytes)
                  ? Effect.void
                  : Effect.fail(error),
              ),
            ),
        ),
      );
    const latest = yield* store.read(LATEST_RELEASE_KEY);
    if (latest === null || digest(latest.bytes) !== digest(bytes)) {
      return yield* failure("readback", "Latest release pointer did not match the candidate");
    }
  });
