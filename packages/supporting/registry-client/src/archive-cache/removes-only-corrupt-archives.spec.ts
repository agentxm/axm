import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeCacheFixture } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/cache/verify/removes-only-corrupt-archives",
  title: "Cache verification removes corrupt archives and preserves valid content",
  statement:
    "The cache verify command shall compare every cached archive with its recorded integrity, remove entries whose integrity is invalid or mismatched, retain matching entries and unrelated files, and report the checked, valid, and removed counts.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/supporting/registry-client/src/archive-cache.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Archive cache verification", () => {
  it.effect("checks actual bytes, removes both corruption forms, and is stable when repeated", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeCacheFixture;
        const valid = fixture.writeArchive("valid");
        const corrupted = fixture.writeArchive("corrupted");
        fs.writeFileSync(corrupted.file, "different bytes");
        const invalidIdentity = nodePath.join(fixture.root, "invalid!.zip");
        fs.writeFileSync(invalidIdentity, "unverifiable bytes");
        const unrelated = nodePath.join(fixture.root, "operator-note.txt");
        fs.writeFileSync(unrelated, "preserve this note");

        expect(yield* fixture.provide(fixture.cache.verify())).toEqual({
          checked: 3,
          valid: 1,
          corruptRemoved: 2,
        });
        expect(fs.readFileSync(valid.file)).toEqual(valid.bytes);
        expect(fs.existsSync(corrupted.file)).toBe(false);
        expect(fs.existsSync(invalidIdentity)).toBe(false);
        expect(fs.readFileSync(unrelated, "utf8")).toBe("preserve this note");

        expect(yield* fixture.provide(fixture.cache.verify())).toEqual({
          checked: 1,
          valid: 1,
          corruptRemoved: 0,
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
});
