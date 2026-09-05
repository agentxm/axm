import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { CacheVerifyOutputSchema, handleCacheVerify } from "axm.sh/specification-harness";
import { makeCacheSpecContext } from "../../../support/cache-harness.js";

export const specification = defineSpecification({
  requirement: "cli/cache/verify/removes-only-corrupt-archives",
  title: "Cache verification removes corrupt archives and preserves valid content",
  statement:
    "The cache verify command shall compare every cached archive with its recorded integrity, remove entries whose integrity is invalid or mismatched, retain matching entries and unrelated files, and report the checked, valid, and removed counts.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/src/root/cache/command.ts",
    "packages/registry-client/src/archive-cache.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Archive cache verification", () => {
  it.effect("checks actual bytes, removes both corruption forms, and is stable when repeated", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* makeCacheSpecContext;
        const valid = context.writeArchive("valid");
        const corrupted = context.writeArchive("corrupted");
        fs.writeFileSync(corrupted.file, "different bytes");
        const invalidIdentity = path.join(context.root, "invalid!.zip");
        fs.writeFileSync(invalidIdentity, "unverifiable bytes");
        const unrelated = path.join(context.root, "operator-note.txt");
        fs.writeFileSync(unrelated, "preserve this note");
        yield* context.provide(handleCacheVerify());
        const first = yield* Schema.decodeUnknownEffect(CacheVerifyOutputSchema)(
          context.rendererState.results[0]?.data,
        );
        expect(first.result).toEqual({ checked: 3, valid: 1, corruptRemoved: 2 });
        expect(fs.readFileSync(valid.file)).toEqual(valid.bytes);
        expect(fs.existsSync(corrupted.file)).toBe(false);
        expect(fs.existsSync(invalidIdentity)).toBe(false);
        expect(fs.readFileSync(unrelated, "utf8")).toBe("preserve this note");
        yield* context.provide(handleCacheVerify());
        const repeated = yield* Schema.decodeUnknownEffect(CacheVerifyOutputSchema)(
          context.rendererState.results[1]?.data,
        );
        expect(repeated.result).toEqual({ checked: 1, valid: 1, corruptRemoved: 0 });
      }),
    ),
  );
});
