import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Path from "effect/Path";

import { WorkspaceCatalog } from "../resolution/sources/index.js";
import { makeSyncFixture } from "../reconciliation/sync/test-helpers.js";

const skill = (name: string) =>
  `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n# ${name}\n`;

describe("workspace catalog skill discovery", () => {
  it.effect("reports an unreadable child instead of returning a partial clean catalog", () => {
    const fixture = makeSyncFixture({
      settings: { owner: "@acme", agents: ["claude-code"] },
      files: {
        ".claude/skills/healthy/SKILL.md": skill("healthy"),
        ".claude/skills/blocked/SKILL.md": skill("blocked"),
      },
    });
    return Effect.gen(function* () {
      const nativeFs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const blocked = path.join(fixture.root, ".claude", "skills", "blocked", "SKILL.md");
      const denied = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readFileString",
        pathOrDescriptor: blocked,
        description: "fixture permission denied",
      });
      const observedFs: FileSystem.FileSystem = {
        ...nativeFs,
        readFileString: (location, ...args) =>
          location === blocked ? Effect.fail(denied) : nativeFs.readFileString(location, ...args),
      };
      const failure = yield* fixture
        .provide(Effect.flatMap(WorkspaceCatalog, (catalog) => catalog.skillCandidates))
        .pipe(Effect.provideService(FileSystem.FileSystem, observedFs), Effect.flip);
      expect(failure).toMatchObject({
        _tag: "WorkspaceCatalogUnavailable",
        category: "unavailable",
        cause: denied,
      });
      if (failure._tag !== "WorkspaceCatalogUnavailable") {
        throw new Error(`Unexpected failure: ${failure._tag}`);
      }
      expect(failure.detail).toContain(blocked);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
