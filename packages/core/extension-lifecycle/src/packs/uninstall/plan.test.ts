/**
 * The two staleness gates a settled pack removal passes before it applies.
 *
 * A candidate is built from one reading of the desired state and applied
 * against another; both gates compare the two readings, so they are decisions
 * over data and are exercised as such. What a passing gate then removes is
 * `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`'s
 * business.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import {
  decodeDesiredExtensionIdentity,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "@agentxm/workspace-state";

import { SetActivation } from "../../activation/set-activation.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../../install/test-helpers.js";
import { UninstallExtensions } from "../../uninstall/uninstall-extensions.js";
import {
  applyUninstall,
  previewUninstall,
  uninstallRequest,
} from "../../uninstall/test-helpers.js";
import {
  validatePackRetirementFacts,
  validateResolvedPackUninstallTargets,
  type ResolvedPackUninstallTarget,
} from "./plan.js";

const targetFor = (identity: string): ResolvedPackUninstallTarget => {
  const decoded = decodeDesiredExtensionIdentity(identity);
  if (decoded === undefined || decoded.type !== "pack") {
    throw new Error(`Invalid pack test identity: ${identity}`);
  }
  return {
    type: "pack",
    owner: decoded.owner,
    name: decoded.name,
    authority: decoded.authority,
    desiredIdentity: identity,
  };
};

const packNode = (identity: string, name = "toolkit"): DesiredExtensionNode => ({
  type: "pack",
  name,
  identity,
  source: identity,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: identity, enabled: true }],
});

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  mcpSourceClosures: [],
  problems: [],
});

const expectFailureCategory = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
  category: "conflict" | "validation",
) =>
  Effect.gen(function* () {
    const error = yield* validateResolvedPackUninstallTargets(graph, targets).pipe(Effect.flip);
    expect(error.category).toBe(category);
  });

describe("pack uninstall target precondition", () => {
  const selected = targetFor("workspace:@acme/packs/toolkit");

  it.effect("accepts an unchanged target and ignores unrelated graph drift", () =>
    validateResolvedPackUninstallTargets(
      completeGraph([
        packNode(selected.desiredIdentity),
        {
          type: "skill",
          name: "unrelated",
          identity: "@other/skills/unrelated",
          source: "@other/skills/unrelated",
          enabled: true,
          constraints: [],
          origins: [{ type: "settings", source: "@other/skills/unrelated", enabled: true }],
        },
      ]),
      [selected],
    ),
  );

  it.effect("fails with conflict when the selected owner changes", () =>
    expectFailureCategory(
      completeGraph([packNode("workspace:@other/packs/toolkit")]),
      [selected],
      "conflict",
    ),
  );

  it.effect("fails with conflict when the selected authority changes", () =>
    expectFailureCategory(completeGraph([packNode("@acme/packs/toolkit")]), [selected], "conflict"),
  );

  it.effect("fails with conflict when the selected node disappears", () =>
    expectFailureCategory(completeGraph([]), [selected], "conflict"),
  );

  it.effect("fails with validation when the selected current identity cannot decode", () =>
    expectFailureCategory(
      completeGraph([packNode("workspace:not-an-extension")]),
      [selected],
      "validation",
    ),
  );

  it.effect("revalidates target identity without introducing a graph-completeness rule", () =>
    validateResolvedPackUninstallTargets(
      {
        complete: false,
        nodes: [packNode(selected.desiredIdentity)],
        mcpSourceClosures: [],
        problems: [],
      },
      [selected],
    ),
  );
});

describe("pack retirement staleness", () => {
  const retirement = {
    pack: "@acme/packs/toolkit",
    manifestPath: "packs/toolkit/pack.json",
    reason: "missing",
  } as const;

  it.effect("accepts unchanged retirement facts", () =>
    validatePackRetirementFacts({ planned: [retirement], observed: [retirement] }),
  );

  it.effect("accepts a plan that retires nothing against an intact graph", () =>
    validatePackRetirementFacts({ planned: [], observed: [] }),
  );

  it.effect("conflicts when the target's package became readable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
      expect(error.detail).toContain("@acme/packs/toolkit");
    }),
  );

  it.effect("conflicts when the target's package became unreadable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [],
        observed: [retirement],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );

  it.effect("conflicts when the reason for the target's unreadability changed", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [{ ...retirement, reason: "invalid" }],
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );

  it.effect("conflicts when the graph no longer supports any retirement decision", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: undefined,
      }).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );
});

/**
 * What a settled pack removal withdraws.
 *
 * A pack owns its members only as long as no other route reaches them, and a
 * selector may name one pack, a glob, or nothing at all. Each of those is
 * observable only in what the workspace holds afterwards, so these run the
 * real closure against a `file://` Registry and a real project.
 */
describe("pack removal", () => {
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

  const installPack = (source: string) =>
    applyInstall(installRequest({ type: "pack", subject: { kind: "source", source } }));

  const removePack = (selector: string) =>
    applyUninstall(uninstallRequest({ type: "pack", selector }));

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

  it.effect.each(["toolkit", "@acme/packs/toolkit"])(
    "removes the pack and its resolution when selected as %s",
    (selector) => {
      const created = world();
      const { workspace, registry } = created;
      registry.writeSkill("member", [{ version: "1.0.0", body: "Member guidance." }]);
      registry.writePack("toolkit", [
        { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* installPack("@acme/packs/toolkit");
            expect(workspace.readFile("axm-lock.yaml")).toContain("toolkit");

            const resolution = yield* removePack(selector);

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(JSON.stringify(readSettings(workspace))).not.toContain("toolkit");
            const lockfile = workspace.readFile("axm-lock.yaml");
            expect(lockfile).not.toContain("toolkit");
            // The member had no other route, so it goes with the pack.
            expect(lockfile).not.toContain("member");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(["toolkit", "@acme/packs/toolkit"])(
    "withdraws a workspace-authored pack selected as %s and leaves its package",
    (selector) => {
      const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
      const { workspace } = created;
      writeAuthoredPack(workspace.root, "toolkit");
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = yield* removePack(selector);

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(JSON.stringify(readSettings(workspace))).not.toContain("toolkit");
            // The author wrote the package; withdrawing the declaration never
            // deletes it.
            expect(workspace.readFile(nodePath.join("packs", "toolkit", "pack.json"))).toContain(
              "toolkit",
            );
            expect(workspace.readFile(nodePath.join("packs", "toolkit", "README.md"))).toBe(
              "# toolkit\n",
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("is a no-op when the pack was never desired", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();

          const resolution = yield* removePack("nonexistent-pack");

          expect(deriveOperationOutcome(resolution)).toBe("no-op");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("does not remove a same-name pack owned by someone else", () => {
    const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
    const { workspace } = created;
    writeAuthoredPack(workspace.root, "toolkit");
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();

          const resolution = yield* removePack("@other/packs/toolkit");

          expect(deriveOperationOutcome(resolution)).toBe("no-op");
          expect(JSON.stringify(readSettings(workspace))).toContain("toolkit");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses a fully qualified selector of another type", () => {
    const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
    const { workspace } = created;
    writeAuthoredPack(workspace.root, "toolkit");
    return workspace
      .provide(
        Effect.gen(function* () {
          const error = yield* removePack("@acme/skills/toolkit").pipe(Effect.flip);

          expect(error).toMatchObject({
            _tag: "ExtensionLifecycleFailed",
            category: "validation",
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("expands a glob to every matching pack and leaves the rest", () => {
    const created = world();
    const { workspace, registry } = created;
    for (const name of ["acme-tools", "acme-utils", "other-pack"]) {
      registry.writePack(name, [{ version: "1.0.0", dependencies: {} }]);
    }
    return workspace
      .provide(
        Effect.gen(function* () {
          for (const name of ["acme-tools", "acme-utils", "other-pack"]) {
            yield* installPack(`@acme/packs/${name}`);
          }

          yield* removePack("acme-*");

          const lockfile = workspace.readFile("axm-lock.yaml");
          expect(lockfile).not.toContain("acme-tools");
          expect(lockfile).not.toContain("acme-utils");
          expect(lockfile).toContain("other-pack");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("settles a glob that matches nothing as a no-op with no unit", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const request = uninstallRequest({ type: "pack", selector: "nonexistent-*" });

          const previewed = yield* previewUninstall(request);
          expect(deriveOperationOutcome(previewed)).toBe("no-op");
          expect(previewed.units).toEqual([]);

          const applied = yield* applyUninstall(request);
          expect(deriveOperationOutcome(applied)).toBe("no-op");
          expect(applied.units).toEqual([]);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves a member another desired pack still reaches", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("shared", [{ version: "1.0.0", body: "Shared guidance." }]);
    for (const name of ["pack-a", "pack-b"]) {
      registry.writePack(name, [
        { version: "1.0.0", dependencies: { "@acme/skills/shared": "^1.0.0" } },
      ]);
    }
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("@acme/packs/pack-a");
          yield* installPack("@acme/packs/pack-b");

          yield* removePack("pack-a");

          const lockfile = workspace.readFile("axm-lock.yaml");
          expect(lockfile).not.toContain("pack-a");
          expect(lockfile).toContain("shared");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each([
    { label: "an enabled direct entry", enabled: true },
    { label: "a disabled direct entry", enabled: false },
  ])("preserves a member the workspace desires as $label", ({ enabled }) => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("promoted", [{ version: "1.0.0", body: "Promoted guidance." }]);
    registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/skills/promoted": "^1.0.0" } },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("@acme/packs/toolkit");
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "@acme/skills/promoted" },
            }),
          );
          if (!enabled) {
            yield* SetActivation.prepare({
              type: "skill",
              name: "promoted",
              enabled: false,
            }).pipe(
              Effect.flatMap((candidate) =>
                candidate._tag === "Unchanged"
                  ? Effect.void
                  : SetActivation.previewOrApply(candidate, preapprovedPlanExecution),
              ),
            );
          }
          const directBefore = JSON.stringify(readSettings(workspace));
          expect(directBefore).toContain("promoted");
          // The row is only about a disabled entry if the entry is disabled.
          expect(directBefore.includes('"enabled":false')).toBe(!enabled);

          yield* removePack("toolkit");

          // The direct route survives its pack, with the activation it carried.
          const directAfter = JSON.stringify(readSettings(workspace));
          expect(directAfter).toContain("promoted");
          expect(directAfter.includes('"enabled":false')).toBe(!enabled);
          expect(workspace.readFile("axm-lock.yaml")).toContain("promoted");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses the candidate when the missing manifest reappears before apply", () => {
    const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
    const { workspace } = created;
    writeAuthoredPack(workspace.root, "toolkit");
    const manifest = nodePath.join(workspace.root, "packs", "toolkit", "pack.json");
    const restored = fs.readFileSync(manifest, "utf8");
    fs.rmSync(manifest);
    return workspace
      .provide(
        Effect.gen(function* () {
          const candidate = yield* UninstallExtensions.prepare(
            uninstallRequest({ type: "pack", selector: "toolkit" }),
          );
          const before = workspace.snapshot();
          fs.writeFileSync(manifest, restored);

          const resolution = yield* UninstallExtensions.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution.blocking).toMatchObject({ class: "stale-candidate" });
          expect(JSON.stringify(readSettings(workspace))).toContain("toolkit");
          expect(workspace.readFile("axm-lock.yaml")).toBe(
            Object.fromEntries(before)["axm-lock.yaml"],
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
