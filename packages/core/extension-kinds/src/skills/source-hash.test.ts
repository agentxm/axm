import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
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

  fastCheckIt.prop(
    {
      contents: FastCheck.uniqueArray(FastCheck.string(), { minLength: 2, maxLength: 2 }),
    },
    { numRuns: 100, seed: 0x41584d },
  )("changes when arbitrary file content changes", ({ contents }) => {
    const [firstContent, secondContent] = contents;
    if (firstContent === undefined || secondContent === undefined) {
      // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
      return Effect.runPromise(
        Effect.die(new Error("property generator must produce two contents")),
      );
    }
    // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
    return Effect.runPromise(
      withNode(
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
      ),
    );
  });

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
