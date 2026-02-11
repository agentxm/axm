/**
 * Tests for local filesystem source provider.
 *
 * Verifies provider creation, type discriminator, and discovery
 * from local directories.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { createLocalProvider } from "./local.js";

const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("createLocalProvider", () => {
  it("has type 'local'", () => {
    const provider = createLocalProvider();
    expect(provider.type).toBe("local");
  });

  it("discovers skills from a local directory", () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-"));
    const skillDir = nodePath.join(dir, "my-skill");
    mkdirSync(skillDir);
    writeFileSync(
      nodePath.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: A local skill\n---\n# My Skill",
    );

    return runEffect(
      Effect.gen(function* () {
        const provider = createLocalProvider();
        const refs = yield* provider.find(
          { type: "local", path: dir },
          { names: [], agents: [], type: "skill" },
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
        const skill = refs.find((r) => r.type === "skill" && r.skill.name === "my-skill");
        expect(skill).toBeDefined();
      }).pipe(
        Effect.ensuring(Effect.sync(() => rmSync(dir, { recursive: true })).pipe(Effect.ignore)),
      ),
    );
  });

  it("returns empty for nonexistent path", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createLocalProvider();
        const result = yield* provider
          .find(
            { type: "local", path: "/nonexistent/path/that/does/not/exist" },
            { names: [], agents: [], type: "skill" },
          )
          .pipe(Effect.either);
        // Should fail because directory doesn't exist
        expect(result._tag).toBe("Left");
      }),
    ));

  it("filters by name", () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-"));
    const skillDir1 = nodePath.join(dir, "skill-a");
    const skillDir2 = nodePath.join(dir, "skill-b");
    mkdirSync(skillDir1);
    mkdirSync(skillDir2);
    writeFileSync(
      nodePath.join(skillDir1, "SKILL.md"),
      "---\nname: skill-a\ndescription: Skill A\n---\n",
    );
    writeFileSync(
      nodePath.join(skillDir2, "SKILL.md"),
      "---\nname: skill-b\ndescription: Skill B\n---\n",
    );

    return runEffect(
      Effect.gen(function* () {
        const provider = createLocalProvider();
        const refs = yield* provider.find(
          { type: "local", path: dir },
          { names: ["skill-a"], agents: [], type: "skill" },
        );
        expect(refs).toHaveLength(1);
        if (refs[0]!.type === "skill") {
          expect(refs[0]!.skill.name).toBe("skill-a");
        }
      }).pipe(
        Effect.ensuring(Effect.sync(() => rmSync(dir, { recursive: true })).pipe(Effect.ignore)),
      ),
    );
  });

  it("fetch returns the local directory", () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-"));
    writeFileSync(nodePath.join(dir, "SKILL.md"), "content");

    return runEffect(
      Effect.gen(function* () {
        const provider = createLocalProvider();
        const result = yield* provider.fetch(
          { type: "local", path: dir },
          {
            type: "skill",
            skill: { name: "x", description: "", metadata: Option.none() },
            source: { type: "local", path: dir },
            location: `file://${dir}`,
            version: Option.none(),
            gitTreeSha: Option.none(),
          },
        );
        expect(result.directory).toBe(dir);
      }).pipe(
        Effect.ensuring(Effect.sync(() => rmSync(dir, { recursive: true })).pipe(Effect.ignore)),
      ),
    );
  });
});
