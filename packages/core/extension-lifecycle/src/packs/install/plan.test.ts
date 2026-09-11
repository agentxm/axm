/**
 * The pack source grammar.
 *
 * `packs install` accepts a registry pattern or a bare name resolved against
 * the configured owner, and refuses every other locator shape. Reading the
 * grammar is a decision the settled request carries, so these examples parse
 * the request and read the parsed fields — or the refusal — back.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  previewInstall,
  readSettings,
  type InstallWorld,
} from "../../install/test-helpers.js";
import { makeLifecycleFixture, type LifecycleFixture } from "../../testing.js";
import { parsePackInstallRequest } from "./plan.js";

describe("pack install source grammar", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace whose only relevant setting is the owner a bare name resolves to. */
  const workspaceOwnedBy = (owner: string): LifecycleFixture => {
    const fixture = makeLifecycleFixture({ settings: { owner, agents: [] } });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  const parse = (owner: string, source: string) =>
    workspaceOwnedBy(owner)
      .provide(
        Effect.scoped(parsePackInstallRequest({ source, nonInteractive: true })).pipe(
          Effect.provide(NodeServices.layer),
        ),
      )
      .pipe(Effect.provide(NodeServices.layer));

  const refusal = (owner: string, source: string) =>
    workspaceOwnedBy(owner)
      .provide(
        Effect.scoped(parsePackInstallRequest({ source, nonInteractive: true }))
          .pipe(Effect.provide(NodeServices.layer))
          .pipe(Effect.flip),
      )
      .pipe(Effect.provide(NodeServices.layer));

  it.effect("accepts @owner/packs/pack-name format", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "@acme/packs/my-pack");
      expect(parsed.owner).toBe("@acme");
      expect(parsed.packName).toBe("my-pack");
      expect(parsed.versionRange).toEqual(Option.none());
      expect(parsed.inputKind).toBe("registry-pattern-input");
    }),
  );

  it.effect("accepts @owner/packs/pack-name@^2.0.0 with version constraint", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "@acme/packs/my-pack@^2.0.0");
      expect(parsed.owner).toBe("@acme");
      expect(parsed.packName).toBe("my-pack");
      expect(parsed.versionRange).toEqual(Option.some("^2.0.0"));
    }),
  );

  it.effect("resolves bare pack-name to @defaultScope/packs/pack-name", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@myorg", "my-pack");
      expect(parsed.owner).toBe("@myorg");
      expect(parsed.packName).toBe("my-pack");
      expect(parsed.resolvedInput).toBe("@myorg/packs/my-pack");
    }),
  );

  it.effect("resolves bare pack-name@version with default owner", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@myorg", "my-pack@^2.0.0");
      expect(parsed.owner).toBe("@myorg");
      expect(parsed.packName).toBe("my-pack");
      expect(parsed.versionRange).toEqual(Option.some("^2.0.0"));
      expect(parsed.resolvedInput).toBe("@myorg/packs/my-pack@^2.0.0");
    }),
  );

  it.effect("rejects @owner/pack-name without a /packs/ segment", () =>
    Effect.gen(function* () {
      const error = yield* refusal("@acme", "@acme/my-pack");
      expect(error.category).toBe("usage");
      expect(`${error.detail}`).toContain("registry");
    }),
  );

  it.effect("rejects local path sources", () =>
    Effect.gen(function* () {
      const error = yield* refusal("@acme", "./local-path");
      expect(error.category).toBe("usage");
      expect(`${error.detail}`).toContain("registry");
    }),
  );

  it.effect("rejects github shorthand sources", () =>
    Effect.gen(function* () {
      const error = yield* refusal("@acme", "github:owner/repo");
      expect(error.category).toBe("usage");
      expect(`${error.detail}`).toContain("registry");
    }),
  );
});

/**
 * What the settled pack graph does once the grammar is read.
 *
 * These run the real closure against a `file://` Registry and a real project,
 * because a pack transition is only observable in what the workspace holds
 * afterwards: which members it acquired, which it withdrew, and which
 * authority refused to be replaced.
 */
describe("pack install graph", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (settings?: Readonly<Record<string, unknown>>): InstallWorld => {
    const created = makeInstallWorld(settings === undefined ? {} : { settings });
    cleanups.push(created.cleanup);
    return created;
  };

  const packRequest = (source: string) =>
    installRequest({ type: "pack", subject: { kind: "source", source } });

  /** A pack authored in the project, as `axm packs new` leaves one. */
  const writeAuthoredPack = (root: string, name: string): void => {
    const directory = nodePath.join(root, "packs", name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(nodePath.join(directory, "README.md"), `# ${name}\n`);
    fs.writeFileSync(
      nodePath.join(directory, "pack.json"),
      `${JSON.stringify(
        {
          owner: "@acme",
          type: "pack",
          name,
          version: "1.0.0",
          description: `The ${name} pack.`,
          dependencies: {},
        },
        null,
        2,
      )}\n`,
    );
  };

  it.effect("hard-blocks a Registry install over workspace pack authority", () => {
    const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
    const { workspace, registry } = created;
    writeAuthoredPack(workspace.root, "toolkit");
    registry.writePack("toolkit", [{ version: "1.0.0", dependencies: {} }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();

          const resolution = yield* applyInstall(packRequest("@acme/packs/toolkit"));

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution.blocking).toMatchObject({
            class: "precondition-unmet",
            phase: "planning",
            causeCode: "conflict",
            detail: expect.stringContaining("workspace-sourced pack"),
          });
          expect(resolution.riskConditions).toHaveLength(1);
          expect(resolution.units.filter((unit) => unit.state === "committed")).toEqual([]);
          expect(resolution.suggestions?.length ?? 0).toBeGreaterThan(0);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports every unusable workspace member without falling back to the Registry", () => {
    const created = world({
      skills: { alpha: "workspace", beta: "workspace" },
    });
    const { workspace, registry } = created;
    // Neither workspace skill has a package, so both are unusable. The
    // Registry does publish them, and the plan must still refuse rather than
    // quietly replacing the authority the workspace declared.
    registry.writeSkill("alpha", [{ version: "1.0.0", body: "Alpha." }]);
    registry.writeSkill("beta", [{ version: "1.0.0", body: "Beta." }]);
    registry.writePack("toolkit", [
      {
        version: "1.0.0",
        dependencies: { "@acme/skills/alpha": "^1.0.0", "@acme/skills/beta": "^1.0.0" },
      },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = yield* previewInstall(packRequest("@acme/packs/toolkit"));

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          const details = (resolution.riskConditions ?? []).map((condition) => condition.detail);
          expect(details).toHaveLength(2);
          expect(details.join("\n")).toContain("alpha");
          expect(details.join("\n")).toContain("beta");
          expect(workspace.exists("agent_extensions/agentxm/@acme/skills/alpha")).toBe(false);
          expect(workspace.exists("agent_extensions/agentxm/@acme/skills/beta")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("still plans the pack when the workspace already desires it", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writePack("toolkit", [{ version: "1.0.0", dependencies: {} }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(packRequest("@acme/packs/toolkit"));

          const repeated = yield* previewInstall(packRequest("@acme/packs/toolkit"));

          // A pack already in the lockfile still plans one unit; the closure
          // is what decides whether that unit changes anything.
          expect(repeated.units).toHaveLength(1);
          expect(repeated.units[0]?.label).toContain("toolkit");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("fails at source resolution when the workspace configures no registry", () => {
    const fixture = makeLifecycleFixture({
      sources: "live",
      settings: { owner: "@acme", agents: [], sources: [] },
    });
    cleanups.push(fixture.cleanup);
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();

          const error = yield* applyInstall(packRequest("@acme/packs/toolkit")).pipe(Effect.flip);

          expect(error).toMatchObject({ _tag: "ExtensionLifecycleFailed" });
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses a pack the Registry does not publish", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();

          const error = yield* applyInstall(packRequest("@acme/packs/absent")).pipe(Effect.flip);

          expect(error).toMatchObject({ _tag: "ExtensionLifecycleFailed" });
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("persists the version constraint the source named", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writePack("toolkit", [{ version: "1.0.0", dependencies: {} }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(packRequest("@acme/packs/toolkit@^1.0.0"));

          expect(JSON.stringify(readSettings(workspace))).toContain("^1.0.0");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("acquires every declared member type the pack names", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review guidance." }]);
    registry.writeHook("guard", [{ version: "1.0.0" }]);
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    registry.writePack("toolkit", [
      {
        version: "1.0.0",
        dependencies: {
          "@acme/skills/review": "^1.0.0",
          "@acme/hooks/guard": "^1.0.0",
          "@acme/mcps/context": "^1.0.0",
        },
      },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = yield* applyInstall(packRequest("@acme/packs/toolkit"));

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          const lockfile = workspace.readFile("axm-lock.yaml");
          expect(lockfile).toContain("review");
          expect(lockfile).toContain("guard");
          expect(lockfile).toContain("context");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("withdraws a member a newer pack version dropped", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("alpha", [{ version: "1.0.0", body: "Alpha." }]);
    registry.writeSkill("beta", [{ version: "1.0.0", body: "Beta." }]);
    registry.writePack("toolkit", [
      {
        version: "1.0.0",
        dependencies: { "@acme/skills/alpha": "^1.0.0", "@acme/skills/beta": "^1.0.0" },
      },
      { version: "2.0.0", dependencies: { "@acme/skills/beta": "^1.0.0" } },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(packRequest("@acme/packs/toolkit@1.0.0"));
          expect(workspace.readFile("axm-lock.yaml")).toContain("alpha");

          yield* applyInstall(packRequest("@acme/packs/toolkit@2.0.0"));

          const lockfile = workspace.readFile("axm-lock.yaml");
          expect(lockfile).not.toContain("alpha");
          expect(lockfile).toContain("beta");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("keeps a dropped member the workspace desires directly", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("alpha", [{ version: "1.0.0", body: "Alpha." }]);
    registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/skills/alpha": "^1.0.0" } },
      { version: "2.0.0", dependencies: {} },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(packRequest("@acme/packs/toolkit@1.0.0"));
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "@acme/skills/alpha" },
            }),
          );

          yield* applyInstall(packRequest("@acme/packs/toolkit@2.0.0"));

          // The direct route still reaches alpha, so the pack's newer version
          // withdraws only its own claim on it.
          expect(JSON.stringify(readSettings(workspace))).toContain("alpha");
          expect(workspace.readFile("axm-lock.yaml")).toContain("alpha");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
