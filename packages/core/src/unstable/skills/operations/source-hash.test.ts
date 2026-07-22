import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { computeSkillSourceHash } from "./source-hash.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("computeSkillSourceHash", () => {
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
