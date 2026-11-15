/**
 * What preparing a Pack removal observes, counted at the physical and logical
 * seams it crosses.
 *
 * One plan describes every ordered target from the same graph inside one
 * read phase: the projection facts every description filters are evaluated
 * once, and a Pack whose package the retirement check observed is described
 * from that observation. Each example names the count observed when every
 * description observed again, and the count with the observation shared.
 * The transition observes both again under its lock.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import {
  deriveOperationOutcome,
  type OperationResolution,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceInvariantFacts } from "@agentxm/workspace-kernel/projection";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../../testing/install-world.js";
import { UninstallExtensions } from "../uninstall-extensions.js";
import { previewUninstall, uninstallRequest } from "../test-helpers.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

/**
 * Forget setup work, then run `measured` counting physical calls, tree
 * hashes, and projection-fact evaluations at the facts owner.
 */
const measure = <A, E, R>(measured: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const facts = yield* WorkspaceInvariantFacts;
    const counts = { projectionFacts: 0 };
    recording.reset();
    const work = workObservations(false);
    const result = yield* measured.pipe(
      work.provide,
      Effect.provideService(WorkspaceInvariantFacts, {
        ...facts,
        projectionFacts: Effect.suspend(() => {
          counts.projectionFacts += 1;
          return facts.projectionFacts;
        }),
      }),
    );
    return {
      result,
      ...counts,
      readDirectory: (path: string) =>
        recording.calls({ method: "readDirectory", path }).filter((call) => call.path === path)
          .length,
      readFile: (path: string) =>
        recording.calls({ method: "readFile", path }).filter((call) => call.path === path).length,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
    };
  });

/** What each unit's artifact names, without the agents that read it. */
const described = (units: OperationResolution["units"], root: string) => {
  const relative = (path: string) => path.split(root).join("<workspace>");
  return units.map(({ id, artifact }) => ({
    id,
    targets: (artifact?.targets ?? []).map(({ path, change }) => ({
      path: relative(path),
      change,
    })),
    references: artifact?.references ?? [],
    managedRegions: (artifact?.managedRegions ?? []).map((region) => ({
      ...region,
      path: relative(region.path),
    })),
  }));
};

describe("Pack uninstall preparation shares its owner call's observations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (settings?: Readonly<Record<string, unknown>>): InstallWorld => {
    const created = makeInstallWorld(settings === undefined ? {} : { settings });
    cleanups.push(created.cleanup);
    return created;
  };

  const installPack = (source: string) =>
    applyInstallAcceptingExecutionChanges(
      installRequest({ type: "pack", subject: { kind: "source", source } }),
    );

  const prepare = (selector: string) =>
    UninstallExtensions.prepare(uninstallRequest({ type: "pack", selector }));

  it.effect("describes an acquired Pack from the package its retirement check observed", () => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("member", [{ version: "1.0.0", body: "Member guidance." }]);
    registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
    ]);
    const packRoot = nodePath.join(
      workspace.root,
      fileRegistryPackagePath(registry, "packs", "toolkit"),
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("@acme/packs/toolkit");
          expect(fs.existsSync(nodePath.join(packRoot, "pack.json"))).toBe(true);
          const counted = yield* measure(prepare("toolkit"));
          expect(counted.result.names).toEqual(["toolkit"]);
          // Repeated: the retirement check and the Pack's artifact each read
          // and hashed the package (one observation reads pack.json once and
          // hashes it once more), and both targets evaluated the facts: 5
          // manifest reads, 3 root reads, 3 tree hashes and 2 fact
          // evaluations. The member inventory the leaf removal shares is not
          // observed for a Pack.
          expect
            .soft({
              manifest: counted.readFile(nodePath.join(packRoot, "pack.json")),
              root: counted.readDirectory(packRoot),
              treeHashes: counted.treeHashes,
              projectionFacts: counted.projectionFacts,
              unconfiguredSkills: counted.readDirectory(
                nodePath.join(workspace.root, ".cursor/skills"),
              ),
            })
            .toEqual({
              manifest: 3,
              root: 2,
              treeHashes: 2,
              projectionFacts: 1,
              unconfiguredSkills: 3,
            });
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "pack", selector: "toolkit" }),
          );
          expect(described(preview.units, workspace.root)).toEqual([
            {
              id: "1 pack",
              targets: [
                { path: "axm.lock", change: "updated" },
                { path: fileRegistryPackagePath(registry, "skills", "member"), change: "removed" },
                { path: ".agents/skills/member", change: "removed" },
                { path: ".claude/skills/member", change: "removed" },
                { path: "axm.json", change: "updated" },
                { path: fileRegistryPackagePath(registry, "packs", "toolkit"), change: "removed" },
              ],
              references: [],
              managedRegions: [],
            },
          ]);
          // The transition still re-observes the Pack's package under its lock.
          const candidate = yield* prepare("toolkit");
          const applied = yield* measure(
            UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution),
          );
          expect(deriveOperationOutcome(applied.result)).toBe("applied");
          expect.soft(applied.readFile(nodePath.join(packRoot, "pack.json"))).toBe(12);
          expect(fs.existsSync(packRoot)).toBe(false);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  // The Pack's artifact describes the package from what the retirement check
  // observed, so a package that no longer verifies, or that another binding
  // still accepts, is described as it was when the artifact observed it.
  it.effect.each([
    {
      condition: "an edited package",
      change: ({ packageRoot }: { packageRoot: string; lockPath: string }) =>
        fs.appendFileSync(nodePath.join(packageRoot, "README.md"), "Edited.\n"),
      reference: {
        state: "unknown",
        reason: "canonical ownership or content could not be verified",
      },
    },
    {
      condition: "a package another binding accepts",
      change: ({ lockPath }: { packageRoot: string; lockPath: string }) =>
        fs.writeFileSync(
          lockPath,
          fs
            .readFileSync(lockPath, "utf8")
            .replace(/^toolkit = (.*)$/m, (row, binding) => `${row}\ntoolkit-copy = ${binding}`),
        ),
      reference: { state: "retained", reason: "required by resulting desired state" },
    },
  ])("describes an acquired Pack with $condition as it observes it", ({ change, reference }) => {
    const created = world();
    const { workspace, registry } = created;
    registry.writeSkill("member", [{ version: "1.0.0", body: "Member guidance." }]);
    registry.writePack("toolkit", [
      {
        version: "1.0.0",
        dependencies: { "@acme/skills/member": "^1.0.0" },
        files: { "README.md": "# toolkit\n" },
      },
    ]);
    const packagePath = fileRegistryPackagePath(registry, "packs", "toolkit");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("@acme/packs/toolkit");
          change({
            packageRoot: nodePath.join(workspace.root, packagePath),
            lockPath: nodePath.join(workspace.root, "axm.lock"),
          });
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "pack", selector: "toolkit" }),
          );
          // The Pack's package is kept and reported, never removed.
          expect(described(preview.units, workspace.root)).toEqual([
            {
              id: "1 pack",
              targets: [
                { path: "axm.lock", change: "updated" },
                { path: fileRegistryPackagePath(registry, "skills", "member"), change: "removed" },
                { path: ".agents/skills/member", change: "removed" },
                { path: ".claude/skills/member", change: "removed" },
                { path: "axm.json", change: "updated" },
              ],
              references: [{ path: packagePath, ...reference }],
              managedRegions: [],
            },
          ]);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  it.effect("describes a workspace-authored Pack from its own observation", () => {
    const created = world({ packs: { toolkit: { source: "workspace", enabled: true } } });
    const { workspace } = created;
    const directory = nodePath.join(workspace.root, "packs", "toolkit");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(nodePath.join(directory, "README.md"), "# toolkit\n");
    fs.writeFileSync(
      nodePath.join(directory, "pack.json"),
      `${JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        version: "1.0.0",
        description: "The toolkit pack.",
        dependencies: {},
      })}\n`,
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "pack", selector: "toolkit" }),
          );
          expect(preview.units.flatMap((unit) => unit.artifact?.references ?? [])).toContainEqual({
            path: "packs/toolkit",
            state: "retained",
            reason: "workspace-authored source",
          });
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  it.effect(
    "evaluates projection facts once for a Pack and its exclusive members while another Rule stays",
    () => {
      const created = world();
      const { workspace, registry } = created;
      registry.writeRule("house", [{ version: "1.0.0", body: "House style." }]);
      registry.writeRule("style", [{ version: "1.0.0", body: "Toolkit style." }]);
      registry.writeKnowledge("guide", [{ version: "1.0.0", body: "# Guide\n" }]);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: { "@acme/rules/style": "^1.0.0", "@acme/knowledge/guide": "^1.0.0" },
        },
      ]);
      const houseRoot = nodePath.join(
        workspace.root,
        fileRegistryPackagePath(registry, "rules", "house"),
      );
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "rule",
                subject: { kind: "source", source: "@acme/rules/house" },
              }),
            );
            yield* installPack("@acme/packs/toolkit");
            expect(fs.existsSync(houseRoot)).toBe(true);
            const counted = yield* measure(prepare("toolkit"));
            expect(counted.result.names).toEqual(["toolkit"]);
            // Repeated: each of the three ordered targets evaluated the facts,
            // observing the remaining Rule contributor each time: 3 fact
            // evaluations, 5 root reads, 15 manifest reads and 17 tree hashes.
            // Each remaining contributor selection decodes the manifest its
            // own observation captured instead of reading it again.
            expect
              .soft({
                projectionFacts: counted.projectionFacts,
                contributorRoot: counted.readDirectory(houseRoot),
                contributorManifest: counted.readFile(nodePath.join(houseRoot, "rule.json")),
                treeHashes: counted.treeHashes,
              })
              .toEqual({
                projectionFacts: 1,
                contributorRoot: 3,
                contributorManifest: 6,
                treeHashes: 10,
              });
            // Every member and the Pack still name the same targets and
            // managed regions they named when each evaluated its own facts.
            const preview = yield* previewUninstall(
              uninstallRequest({ type: "pack", selector: "toolkit" }),
            );
            expect(described(preview.units, workspace.root)).toEqual([
              {
                id: "1 pack",
                targets: [
                  { path: "axm.lock", change: "updated" },
                  { path: fileRegistryPackagePath(registry, "rules", "style"), change: "removed" },
                  { path: "AGENTS.md#rules", change: "updated" },
                  {
                    path: fileRegistryPackagePath(registry, "knowledge", "guide"),
                    change: "removed",
                  },
                  { path: "<workspace>/AGENTS.md#knowledge", change: "updated" },
                  { path: "axm.json", change: "updated" },
                  {
                    path: fileRegistryPackagePath(registry, "packs", "toolkit"),
                    change: "removed",
                  },
                ],
                references: [],
                managedRegions: [
                  {
                    owner: "@agentxm/rules/instructions",
                    path: "AGENTS.md#rules",
                    unitId: "rule:instructions-region",
                  },
                  {
                    owner: "@agentxm/knowledge/discovery",
                    path: "<workspace>/AGENTS.md#knowledge",
                    unitId: "knowledge:discovery-region",
                  },
                ],
              },
            ]);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
  );
});
