/**
 * Tests for local filesystem source provider.
 *
 * Verifies provider creation, type discriminator, and discovery
 * from local directories.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { CliEnvConfig } from "../../config/index.js";
import { createLocalSourceHostProvider } from "./local.js";

const runEffect = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | CliEnvConfig>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.merge(NodeServices.layer, CliEnvConfig.testDefaults))),
  );

describe("createLocalSourceHostProvider", () => {
  const provider = createLocalSourceHostProvider();

  it("has type 'local'", () => {
    expect(provider.type).toBe("local");
  });

  it("match returns true for file:// URLs", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* provider.match(new URL("file:///path/to/dir"));
        expect(result).toBe(true);
      }),
    ));

  it("match returns false for https:// URLs", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* provider.match(new URL("https://example.com"));
        expect(result).toBe(false);
      }),
    ));

  it("match returns false for git:// URLs", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* provider.match(new URL("git://example.com/repo.git"));
        expect(result).toBe(false);
      }),
    ));

  it("discovers skills from a local directory", () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-new-"));
    const skillDir = nodePath.join(dir, "my-skill");
    mkdirSync(skillDir);
    writeFileSync(
      nodePath.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: A local skill\n---\n# My Skill",
    );

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(
          { type: "local", path: dir },
          {
            skillNames: [],
            type: "skill",
            profile: Option.none(),
            versionConstraint: Option.none(),
          },
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
        const skill = refs.find((r) => r.type === "skill" && r.skill.name === "my-skill");
        expect(skill).toBeDefined();
        // Verify it returns ExtensionRef with LocalRefDetails
        if (skill && skill.type === "skill") {
          expect(skill.source.type).toBe("local");
          expect("location" in skill).toBe(true);
        }
      }).pipe(
        Effect.ensuring(Effect.sync(() => rmSync(dir, { recursive: true })).pipe(Effect.ignore)),
      ),
    );
  });

  it("filters by name", () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-new-"));
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
        const refs = yield* provider.find(
          { type: "local", path: dir },
          {
            skillNames: ["skill-a"],
            type: "skill",
            profile: Option.none(),
            versionConstraint: Option.none(),
          },
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
    const dir = mkdtempSync(nodePath.join(tmpdir(), "test-local-new-"));
    writeFileSync(nodePath.join(dir, "SKILL.md"), "content");

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch({ type: "local", path: dir }, {
          type: "skill",
          refType: "local",
          skill: { name: "x", description: Option.none(), metadata: Option.none() },
          source: { type: "local", path: dir },
          location: `file://${dir}`,
        } as never);
        expect(result.directory).toBe(dir);
      }).pipe(
        Effect.ensuring(Effect.sync(() => rmSync(dir, { recursive: true })).pipe(Effect.ignore)),
      ),
    );
  });
});
