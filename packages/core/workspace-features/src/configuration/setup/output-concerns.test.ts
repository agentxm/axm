/**
 * Setup's output-concern observation groups the selected agents by the native
 * skill directories they read. A directory several agents declare under the
 * same spelling is resolved once for that observation; each agent still
 * counts as one of its readers, and a different spelling of the same
 * directory is still resolved on its own.
 *
 * Counts are exact for these fixtures and are taken after fixture creation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { observeSetupOutputConcerns } from "./output-concerns.js";
import { setupWorkspaceTestLayer } from "./test-helpers.js";

/** The native platform, with its filesystem recorded. */
const recordingPlatform = Layer.merge(
  NativePlatformTest,
  layerRecordingFileSystem(NativePlatformTest),
);

/** Three agents whose only shared project skill directory is `.agents/skills`. */
const SHARING = ["kimi-cli", "replit", "deepagents"] as const;

const observeConcerns = (
  fixture: SetupFixture,
  agentIds: ReadonlyArray<string>,
  targets: Parameters<typeof observeSetupOutputConcerns>[3] = [],
  root: string = fixture.root,
) =>
  fixture
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        recording.reset();
        const concerns = yield* observeSetupOutputConcerns(root, "project", agentIds, targets);
        return { concerns, calls: recording.calls() };
      }).pipe(
        Effect.provide(
          setupWorkspaceTestLayer({
            scope: "project",
            projectRoot: decodeAbsolutePathSync(fixture.root),
          }),
        ),
      ),
    )
    .pipe(Effect.provide(recordingPlatform));

const countOf = (
  calls: ReadonlyArray<{ readonly method: string; readonly path: string }>,
  method: string,
  target: string,
) => calls.filter((call) => call.method === method && call.path === target).length;

describe("Setup output concerns resolve a shared skill read directory once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixtureWith = (
    files: Readonly<Record<string, string>> = {},
    homeFiles: Readonly<Record<string, string>> = {},
  ) => {
    const fixture = makeSetupFixture({ files, homeFiles });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("a directory three agents read is resolved once", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ ".agents/skills/.keep": "" });
      const shared = path.join(fixture.root, ".agents", "skills");
      const observed = yield* observeConcerns(fixture, SHARING);
      expect(observed.concerns).toEqual([]);
      // Before, once per declaring agent: 3 realPath calls, and the listed
      // spelling walk read the root and `.agents` 3 times each.
      expect(countOf(observed.calls, "realPath", shared)).toBe(1);
      expect(countOf(observed.calls, "readDirectory", fixture.root)).toBe(1);
      expect(countOf(observed.calls, "readDirectory", path.join(fixture.root, ".agents"))).toBe(1);
    }),
  );

  it.effect("an absent shared directory walks its missing ancestors once", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith();
      const shared = path.join(fixture.root, ".agents", "skills");
      const observed = yield* observeConcerns(fixture, SHARING);
      expect(observed.concerns).toEqual([]);
      // Before: 3 realPath and 3 readLink calls on the directory, 3 realPath on `.agents`.
      expect(countOf(observed.calls, "realPath", shared)).toBe(1);
      expect(countOf(observed.calls, "readLink", shared)).toBe(1);
      expect(countOf(observed.calls, "realPath", path.join(fixture.root, ".agents"))).toBe(1);
    }),
  );

  it.effect("one declaring agent resolves the directory once, as before", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ ".agents/skills/.keep": "" });
      const observed = yield* observeConcerns(fixture, ["kimi-cli"]);
      expect(
        countOf(observed.calls, "realPath", path.join(fixture.root, ".agents", "skills")),
      ).toBe(1);
    }),
  );

  it.effect("every agent reading the shared directory claims the proposed output there", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(
        { ".agents/skills/.keep": "" },
        { ".agents/skills/axm/SKILL.md": "x\n" },
      );
      const shared = path.join(fixture.root, ".agents", "skills");
      const observed = yield* observeConcerns(fixture, SHARING, [
        { path: path.join(fixture.root, ".axm", "skills", "axm") },
        { path: path.join(shared, "axm"), agentIds: ["kimi-cli"] },
      ]);
      expect(observed.concerns).toEqual([
        {
          kind: "collision",
          path: path.join(shared, "axm"),
          otherPath: path.join(fixture.home, ".agents", "skills", "axm"),
          entryName: "axm",
          extensionType: "skill",
          // deepagents claims the output only as a reader of the shared directory.
          agentIds: ["deepagents"],
        },
      ]);
      // Before: 4, once per declaring agent and once as the proposed entry's parent.
      expect(countOf(observed.calls, "realPath", shared)).toBe(2);
    }),
  );

  it.effect("a dangling shared directory falls back to its spelling for every reader", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith();
      fs.mkdirSync(path.join(fixture.root, ".agents"));
      fs.symlinkSync(
        path.join(fixture.root, "missing"),
        path.join(fixture.root, ".agents", "skills"),
      );
      const shared = path.join(fixture.root, ".agents", "skills");
      const observed = yield* observeConcerns(fixture, SHARING, [
        { path: path.join(fixture.root, ".axm", "skills", "axm") },
        { path: path.join(shared, "axm"), agentIds: ["kimi-cli"] },
      ]);
      expect(observed.concerns).toEqual([
        { kind: "unreadable", path: path.join(shared, "axm"), reason: "dangling-ancestor" },
      ]);
      // Before: 4, once per declaring agent and once as the proposed entry's parent.
      expect(countOf(observed.calls, "readLink", shared)).toBe(2);
    }),
  );

  it.effect("another spelling of the shared directory is still resolved on its own", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ ".agents/skills/.keep": "" });
      const alias = `${fixture.root}-alias`;
      fs.symlinkSync(fixture.root, alias);
      cleanups.push(() => fs.rmSync(alias, { force: true }));
      const fromRoot = yield* observeConcerns(fixture, SHARING);
      const fromAlias = yield* observeConcerns(fixture, SHARING, [], alias);
      expect(fromAlias.concerns).toEqual(fromRoot.concerns);
      // Before: 3 each.
      expect(
        countOf(fromRoot.calls, "realPath", path.join(fixture.root, ".agents", "skills")),
      ).toBe(1);
      expect(countOf(fromAlias.calls, "realPath", path.join(alias, ".agents", "skills"))).toBe(1);
    }),
  );
});
