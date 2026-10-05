import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { EXPECTED_RELEASE_ASSETS } from "./release-checksums.js";
import {
  publishReleaseDistribution,
  ReleaseStorageError,
  type ReleaseObject,
  type ReleaseStorage,
} from "./release-distribution.js";

export const specification = defineSpecification({
  requirement: "system/distribution/latest-selects-complete-release",
  title: "Latest selects a complete immutable release",
  statement:
    "Production release publication shall expose a stable version as latest only after all required immutable artifacts and their source identity have been verified, preserve the prior selection on incomplete or conflicting publication, and prevent a retry or concurrent publisher from overwriting a newer selection.",
  class: "functional",
  role: "supporting",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The object store enforces conditional writes and returns strongly consistent object reads; exact CI artifacts pass the canonical release asset validator before distribution.",
  ],
  openQuestions: [],
});

const bytes = (value: string) => new TextEncoder().encode(value);
const failure = () => new ReleaseStorageError({ operation: "fixture", detail: "provider failure" });
const candidate = {
  version: "1.2.3",
  commit: "a".repeat(40),
  loadAsset: (name: string) => Effect.succeed(bytes(name)),
};
const fixture = (options?: {
  failKey?: string;
  ambiguousKey?: string;
  race?: boolean;
  corrupt?: boolean;
}) => {
  const objects = new Map<string, ReleaseObject>();
  const writes: string[] = [];
  const store: ReleaseStorage = {
    read: (key) => Effect.sync(() => objects.get(key) ?? null),
    put: (key, content, metadata) =>
      Effect.gen(function* () {
        if (key === options?.failKey) return yield* failure();
        if (key === "latest.txt" && options?.race)
          objects.set(key, { bytes: bytes("2.0.0\n"), etag: "raced" });
        const previous = objects.get(key);
        if (
          "absent" in metadata.condition
            ? previous !== undefined
            : previous?.etag !== metadata.condition.etag
        )
          return yield* failure();
        if (key === "latest.txt") {
          expect(objects.has("cli-v1.2.3/release.json")).toBe(true);
          expect(EXPECTED_RELEASE_ASSETS.every((name) => objects.has(`cli-v1.2.3/${name}`))).toBe(
            true,
          );
          expect(metadata.cacheControl).toBe("no-store");
        }
        writes.push(key);
        objects.set(key, {
          bytes: options?.corrupt ? bytes("corrupted") : content,
          etag: `etag-${writes.length}`,
        });
        if (key === options?.ambiguousKey) return yield* failure();
      }),
  };
  return { store, objects, writes };
};

describe("release distribution", () => {
  it.effect(
    "publishes the complete immutable cohort before latest and reuses identical retries",
    () =>
      Effect.gen(function* () {
        const f = fixture();
        yield* publishReleaseDistribution(f.store, candidate);
        expect(f.writes.at(-1)).toBe("latest.txt");
        expect(f.writes).toHaveLength(EXPECTED_RELEASE_ASSETS.length + 2);
        yield* publishReleaseDistribution(f.store, candidate);
        expect(f.writes).toHaveLength(EXPECTED_RELEASE_ASSETS.length + 2);
      }),
  );

  it.effect("does not change latest on incomplete publication and repairs a retry", () =>
    Effect.gen(function* () {
      const f = fixture({ failKey: "cli-v1.2.3/skill.schema.json" });
      yield* Effect.flip(publishReleaseDistribution(f.store, candidate));
      expect(f.objects.has("latest.txt")).toBe(false);
      expect(f.objects.has("cli-v1.2.3/release.json")).toBe(false);
      const resumed = fixture();
      for (const [key, value] of f.objects) resumed.objects.set(key, value);
      yield* publishReleaseDistribution(resumed.store, candidate);
      expect(resumed.writes).not.toContain("cli-v1.2.3/axm-linux-x64");
      expect(resumed.writes.at(-1)).toBe("latest.txt");
    }),
  );

  it.effect("validates all local assets before any upload", () =>
    Effect.gen(function* () {
      const f = fixture();
      yield* Effect.flip(
        publishReleaseDistribution(f.store, {
          ...candidate,
          loadAsset: (name) =>
            name === "skill.schema.json" ? Effect.fail(failure()) : candidate.loadAsset(name),
        }),
      );
      expect(f.writes).toEqual([]);
    }),
  );

  it.effect.each(["cli-v1.2.3/axm-linux-x64", "latest.txt"])(
    "observes an ambiguous write to %s without repeating it",
    (key) =>
      Effect.gen(function* () {
        const f = fixture({ ambiguousKey: key });
        yield* publishReleaseDistribution(f.store, candidate);
        expect(f.writes.filter((value) => value === key)).toHaveLength(1);
      }),
  );

  it.effect("rejects a conflicting immutable object and a changed source commit", () =>
    Effect.gen(function* () {
      const f = fixture();
      f.objects.set("cli-v1.2.3/axm-linux-x64", { bytes: bytes("wrong"), etag: "existing" });
      const error = yield* Effect.flip(publishReleaseDistribution(f.store, candidate));
      expect(error instanceof ReleaseStorageError ? error.detail : error.message).toContain(
        "Immutable content conflict",
      );
      expect(f.objects.has("latest.txt")).toBe(false);
      const complete = fixture();
      yield* publishReleaseDistribution(complete.store, candidate);
      const changed = yield* Effect.flip(
        publishReleaseDistribution(complete.store, { ...candidate, commit: "b".repeat(40) }),
      );
      expect(changed instanceof ReleaseStorageError ? changed.detail : changed.message).toContain(
        "manifest conflicts",
      );
    }),
  );

  it.effect("rejects corrupted readback and never advertises it", () =>
    Effect.gen(function* () {
      const f = fixture({ corrupt: true });
      yield* Effect.flip(publishReleaseDistribution(f.store, candidate));
      expect(f.objects.has("latest.txt")).toBe(false);
    }),
  );

  it.effect("preserves newer releases and fails conditional publication races", () =>
    Effect.gen(function* () {
      const f = fixture();
      f.objects.set("latest.txt", { bytes: bytes("2.0.0\n"), etag: "newer" });
      yield* Effect.flip(publishReleaseDistribution(f.store, candidate));
      expect(f.writes).toEqual([]);
      const racing = fixture({ race: true });
      yield* Effect.flip(publishReleaseDistribution(racing.store, candidate));
      expect(new TextDecoder().decode(racing.objects.get("latest.txt")?.bytes)).toBe("2.0.0\n");
    }),
  );
});
