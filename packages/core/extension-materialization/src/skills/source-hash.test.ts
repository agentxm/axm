import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import { computeSkillSourceHash } from "./source-hash.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("computeSkillSourceHash", () => {
  it.effect("distinguishes paths and contents that collide with newline delimiters", () =>
    withNode(
      Effect.gen(function* () {
        const first = mkdtempSync(nodePath.join(tmpdir(), "skill-hash-first-"));
        const second = mkdtempSync(nodePath.join(tmpdir(), "skill-hash-second-"));
        try {
          writeFileSync(nodePath.join(first, "a"), "b");
          writeFileSync(nodePath.join(first, "c"), "");
          writeFileSync(nodePath.join(second, "a"), "b\nc\n");

          expect(yield* computeSkillSourceHash(first)).not.toBe(
            yield* computeSkillSourceHash(second),
          );
        } finally {
          rmSync(first, { recursive: true, force: true });
          rmSync(second, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect.prop(
    "changes when arbitrary file content changes",
    {
      contents: FastCheck.uniqueArray(FastCheck.string(), { minLength: 2, maxLength: 2 }),
    },
    ({ contents }) => {
      const [firstContent, secondContent] = contents;
      if (firstContent === undefined || secondContent === undefined) {
        return Effect.die(new Error("property generator must produce two contents"));
      }
      return withNode(
        Effect.gen(function* () {
          const dir = mkdtempSync(nodePath.join(tmpdir(), "skill-hash-property-"));
          try {
            const file = nodePath.join(dir, "SKILL.md");
            writeFileSync(file, firstContent);
            const first = yield* computeSkillSourceHash(dir);
            writeFileSync(file, secondContent);
            expect(yield* computeSkillSourceHash(dir)).not.toBe(first);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
      );
    },
    { fastCheck: { numRuns: 100, seed: 0x41584d } },
  );

  it.effect("changes when a nested subdirectory file changes", () =>
    withNode(
      Effect.gen(function* () {
        const dir = mkdtempSync(nodePath.join(tmpdir(), "skill-hash-"));
        try {
          mkdirSync(nodePath.join(dir, "sub"), { recursive: true });
          writeFileSync(nodePath.join(dir, "SKILL.md"), "# skill\n");
          writeFileSync(nodePath.join(dir, "sub", "nested.md"), "v1");
          const hash1 = yield* computeSkillSourceHash(dir);

          // A change to a nested file must change the hash — previously nested
          // files were ignored, so the change was misclassified as unchanged.
          writeFileSync(nodePath.join(dir, "sub", "nested.md"), "v2");
          const hash2 = yield* computeSkillSourceHash(dir);

          expect(hash1).not.toBe(hash2);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }),
    ),
  );
});
