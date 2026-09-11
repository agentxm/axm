import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome, type OperationResolution } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyInstall,
  contentUnder,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../install/test-helpers.js";
import { PACK_UNINSTALL_GRAPH_BLOCKER_ID } from "../packs/uninstall/readiness.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable",
  title: "Uninstall retires a desired pack whose package cannot be read",
  statement:
    "When uninstall targets a desired pack whose package manifest is missing or cannot be decoded, and every other desired pack is intact, AXM shall remove the pack's configuration and accepted resolution, shall delete no content it could not verify, shall report the removal as registration-only naming the unreadable manifest, and shall reach the same decision in preview and apply; when any other desired pack is incomplete, AXM shall remain blocked and shall change nothing.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A pack's member list is not persisted outside its package manifest; neither axm.json nor axm-lock.yaml carries one, so an unreadable manifest leaves members computable only from the remaining desired state.",
  ],
  openQuestions: [],
});

/** How a fixture pack's own package manifest presents on disk. */
type PackManifestCondition = "intact" | "deleted" | "undecodable" | "mismatched";

interface PackFixture {
  readonly name: string;
  readonly authority: "workspace" | "registry";
  readonly manifest: PackManifestCondition;
}

const OWNER = "@acme";

const manifestFor = (fixture: PackFixture): Readonly<Record<string, unknown>> => ({
  owner: OWNER,
  type: "pack",
  name: fixture.name,
  version: "1.0.0",
  description: `The ${fixture.name} pack.`,
  dependencies: {},
});

/** Where a completed acquisition leaves the pack's package, relative to the root. */
const packDirectory = (fixture: PackFixture): string =>
  fixture.authority === "workspace"
    ? nodePath.join("packs", fixture.name)
    : nodePath.join("agent_extensions", "agentxm", OWNER, "packs", fixture.name);

const manifestPath = (fixture: PackFixture): string =>
  nodePath.join(packDirectory(fixture), "pack.json");

/** A pack authored in the workspace, as `axm packs init` leaves one. */
const writeAuthoredPack = (root: string, fixture: PackFixture): void => {
  const directory = nodePath.join(root, packDirectory(fixture));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(nodePath.join(directory, "README.md"), `# ${fixture.name}\n`);
  fs.writeFileSync(
    nodePath.join(directory, "pack.json"),
    `${JSON.stringify(manifestFor(fixture), null, 2)}\n`,
  );
};

/**
 * Every pack starts from the package a completed acquisition leaves behind, so
 * the damaged manifest is the only difference a scenario introduces.
 */
const damageManifest = (root: string, fixture: PackFixture): void => {
  const file = nodePath.join(root, manifestPath(fixture));
  switch (fixture.manifest) {
    case "intact":
      return;
    case "deleted":
      fs.rmSync(file, { force: true });
      return;
    case "undecodable":
      fs.writeFileSync(file, "{ this is not a pack manifest");
      return;
    case "mismatched":
      fs.writeFileSync(file, JSON.stringify({ ...manifestFor(fixture), owner: "@other" }));
      return;
  }
};

describe("Uninstall a desired pack whose package cannot be read", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A workspace that desires every fixture pack: authored packs are written
   * into the project, Registry packs are published and then really installed.
   */
  const start = (fixtures: ReadonlyArray<PackFixture>): InstallWorld => {
    const authored = fixtures.filter((fixture) => fixture.authority === "workspace");
    const world = makeInstallWorld(
      authored.length === 0
        ? {}
        : {
            settings: {
              packs: Object.fromEntries(
                authored.map((fixture) => [fixture.name, { source: "workspace", enabled: true }]),
              ),
            },
          },
    );
    cleanups.push(world.cleanup);
    for (const fixture of fixtures) {
      if (fixture.authority === "workspace") {
        writeAuthoredPack(world.workspace.root, fixture);
        continue;
      }
      world.registry.writePack(fixture.name, [
        { version: "1.0.0", dependencies: {}, files: { "README.md": `# ${fixture.name}\n` } },
      ]);
    }
    return world;
  };

  /** Acquire every Registry pack, then damage the manifests the scenario names. */
  const seed = (world: InstallWorld, fixtures: ReadonlyArray<PackFixture>) =>
    Effect.gen(function* () {
      for (const fixture of fixtures) {
        if (fixture.authority !== "registry") continue;
        yield* applyInstall(
          installRequest({
            type: "pack",
            subject: { kind: "source", source: `${OWNER}/packs/${fixture.name}` },
          }),
        );
      }
      for (const fixture of fixtures) {
        damageManifest(world.workspace.root, fixture);
      }
    });

  const unreadableTargets: ReadonlyArray<{
    readonly label: string;
    readonly target: PackFixture;
  }> = [
    {
      label: "a workspace pack whose manifest was deleted",
      target: { name: "toolkit", authority: "workspace", manifest: "deleted" },
    },
    {
      label: "a registry pack whose manifest was deleted",
      target: { name: "toolkit", authority: "registry", manifest: "deleted" },
    },
    {
      label: "a registry pack whose manifest cannot be decoded",
      target: { name: "toolkit", authority: "registry", manifest: "undecodable" },
    },
  ];

  it.effect.each(unreadableTargets)(
    "removes the registration and preserves the package of $label",
    ({ target }) => {
      const world = start([target]);
      const { workspace } = world;
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* seed(world, [target]);
            const packageBefore = contentUnder(workspace, packDirectory(target));
            expect(packageBefore.length).toBeGreaterThan(0);
            expect(JSON.stringify(readSettings(workspace))).toContain(target.name);

            const resolution = yield* applyUninstall(
              uninstallRequest({ type: "pack", selector: target.name }),
            );

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(JSON.stringify(readSettings(workspace))).not.toContain(target.name);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain(target.name);
            // Content whose manifest could not be read is never deleted.
            expect(contentUnder(workspace, packDirectory(target))).toEqual(packageBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(unreadableTargets)("reports $label as registration-only", ({ target }) => {
    const world = start([target]);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* seed(world, [target]);

          const resolution = yield* applyUninstall(
            uninstallRequest({ type: "pack", selector: target.name }),
          );

          // No consumer may read the result as a content removal that did not
          // occur, so the report names the manifest and what it left alone.
          const reported = resolution.units.flatMap((unit) => [
            unit.message ?? "",
            ...(unit.warnings ?? []),
          ]);
          expect(reported.join("\n")).toContain(manifestPath(target));
          expect(reported.join("\n")).toContain("left its package content in place");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reaches the same decision in preview and apply, and previews purely", () => {
    const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
    const world = start([target]);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* seed(world, [target]);
          const before = workspace.snapshot();

          const previewed = yield* previewUninstall(
            uninstallRequest({ type: "pack", selector: target.name }),
          );
          expect(deriveOperationOutcome(previewed)).toBe("previewed");
          expect(workspace.snapshot()).toEqual(before);

          const applied = yield* applyUninstall(
            uninstallRequest({ type: "pack", selector: target.name }),
          );
          expect(deriveOperationOutcome(applied)).toBe("applied");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("retires the same pack through the root uninstall route", () => {
    const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
    const world = start([target]);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* seed(world, [target]);
          const packageBefore = contentUnder(workspace, packDirectory(target));

          const resolution = yield* applyUninstall(
            uninstallRequest({ selector: `${OWNER}/packs/${target.name}` }),
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(JSON.stringify(readSettings(workspace))).not.toContain(target.name);
          expect(contentUnder(workspace, packDirectory(target))).toEqual(packageBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("is a no-op when the completed retirement is repeated", () => {
    const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
    const world = start([target]);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* seed(world, [target]);
          yield* applyUninstall(uninstallRequest({ type: "pack", selector: target.name }));
          const after = workspace.snapshot();

          const repeated = yield* applyUninstall(
            uninstallRequest({ type: "pack", selector: target.name }),
          );

          expect(deriveOperationOutcome(repeated)).toBe("no-op");
          expect(workspace.snapshot()).toEqual(after);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  const blockedCases: ReadonlyArray<{
    readonly label: string;
    readonly fixtures: ReadonlyArray<PackFixture>;
  }> = [
    {
      label: "an intact target beside a pack whose manifest is missing",
      fixtures: [
        { name: "toolkit", authority: "workspace", manifest: "intact" },
        { name: "sibling", authority: "workspace", manifest: "deleted" },
      ],
    },
    {
      label: "an unreadable target beside a pack whose manifest is missing",
      fixtures: [
        { name: "toolkit", authority: "workspace", manifest: "deleted" },
        { name: "sibling", authority: "workspace", manifest: "deleted" },
      ],
    },
    {
      label: "a target whose readable manifest declares another identity",
      fixtures: [{ name: "toolkit", authority: "workspace", manifest: "mismatched" }],
    },
  ];

  const expectBlocked = (resolution: OperationResolution): void => {
    expect(deriveOperationOutcome(resolution)).toBe("blocked");
    expect(resolution.riskConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "blocked", id: PACK_UNINSTALL_GRAPH_BLOCKER_ID }),
      ]),
    );
    expect(resolution.units.filter((unit) => unit.state === "committed")).toEqual([]);
  };

  for (const route of ["root", "type"] as const) {
    it.effect.each(blockedCases)(
      `stays blocked through the ${route} form and changes nothing for $label`,
      ({ fixtures }) => {
        const world = start(fixtures);
        const { workspace } = world;
        const request =
          route === "root"
            ? uninstallRequest({ selector: `${OWNER}/packs/toolkit` })
            : uninstallRequest({ type: "pack", selector: "toolkit" });
        return workspace
          .provide(
            Effect.gen(function* () {
              yield* seed(world, fixtures);
              for (const fixture of fixtures) {
                expect(workspace.readFile(nodePath.join(packDirectory(fixture), "README.md"))).toBe(
                  `# ${fixture.name}\n`,
                );
              }
              const before = workspace.snapshot();

              expectBlocked(yield* previewUninstall(request));
              expect(workspace.snapshot()).toEqual(before);

              expectBlocked(yield* applyUninstall(request));
              expect(workspace.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
  }
});
