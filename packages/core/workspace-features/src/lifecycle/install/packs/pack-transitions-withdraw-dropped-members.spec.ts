import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import type { FileRegistry } from "@agentxm/registry-client/testing";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../../testing/install-world.js";
import {
  applyUpdateAcceptingExecutionChanges,
  configuredUpdateRequest,
  expectResolved,
  previewUpdate,
  targetedUpdateRequest,
} from "../../update/test-helpers.js";
import { applyActivation } from "../../activation/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/pack-transitions-withdraw-dropped-members",
  title: "Pack transitions withdraw the members their target manifest drops",
  statement:
    "When install, a targeted update, or a configured update moves a Pack to a manifest that no longer requires a member no other desired route reaches, AXM shall withdraw that member in the same atomic transition as uninstalling the Pack would, removing its accepted resolution, acquired package, and owned file outputs so the workspace matches a fresh installation of the target intent and reporting it as a removed member, retaining native MCP and Hook registrations and refusing before any write while a retained registration runs the member's package code, and shall keep a member a direct declaration or another Pack still requires.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "trustworthy-distribution"],
  boundaryRationale:
    "Production workspace services and a file Registry execute over native temporary directories; examples compare the advanced workspace's files, links and accepted resolutions with a fresh installation of the same intent.",
  boundary: "platform",
  methods: ["example", "state-transition"],
  derivedFrom: [
    "cli/install/pack-source-switches-are-member-diffed",
    "cli/uninstall/reports-removed-and-retained-state",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should a Pack transition that drops a Hook whose retained registration runs package code retain that package and its accepted resolution until the registration is withdrawn, as sync does, instead of refusing as Pack uninstall does?",
    "Two dropped MCP connections that share one source closure each see the other in the prior graph, so both retain the shared package and accepted resolution for a later sync to retire.",
  ],
});

const KIT = "@acme/packs/kit";
const MEMBERS = {
  keep: "@acme/skills/keep",
  added: "@acme/skills/added",
  dropped: "@acme/skills/dropped",
  aide: "@acme/subagents/aide",
  style: "@acme/rules/style",
  lore: "@acme/knowledge/lore",
} as const;
/** Every member the first manifest requires and its successor drops, with its member row id. */
const DROPPED = [
  { source: MEMBERS.dropped, row: "skill:dropped" },
  { source: MEMBERS.aide, row: "subagent:aide" },
  { source: MEMBERS.style, row: "rule:style" },
  { source: MEMBERS.lore, row: "knowledge:lore" },
] as const;

/** Workspace state a fresh installation cannot reproduce byte for byte. */
const comparable = (snapshot: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(snapshot).filter(([path]) => !path.startsWith(".axm/")));

/** Present as itself, without following a link, so a dangling link counts as present. */
const present = (world: InstallWorld, relative: string): boolean =>
  fs.lstatSync(nodePath.join(world.workspace.root, relative), { throwIfNoEntry: false }) !==
  undefined;

const publishMembers = (registry: FileRegistry) => {
  for (const name of ["keep", "added", "dropped"] as const)
    registry.writeSkill(name, [{ version: "1.0.0", body: `The ${name} guidance.` }]);
  registry.writeSubagent("aide", [{ version: "1.0.0", body: "Assist." }]);
  registry.writeRule("style", [{ version: "1.0.0", body: "Keep it tidy." }]);
  registry.writeKnowledge("lore", [{ version: "1.0.0", body: "Background." }]);
};

/** The first manifest: the kept member and the members its successor drops. */
const first = (dropped: Readonly<Record<string, string>>) => ({
  version: "1.0.0",
  dependencies: { [MEMBERS.keep]: "^1.0.0", ...dropped },
});
/** The successor manifest keeps one member, adds another, and drops the rest. */
const successor = () => ({
  version: "1.1.0",
  dependencies: { [MEMBERS.keep]: "^1.0.0", [MEMBERS.added]: "^1.0.0" },
});
const dropping = Object.fromEntries(DROPPED.map(({ source }) => [source, "^1.0.0"]));

const packRequest = (source: string) =>
  installRequest({ type: "pack", subject: { kind: "source", source } });

const routes = ["install", "targeted update", "configured update"] as const;
type Route = (typeof routes)[number];

/** Move the installed Pack to its successor manifest through one route. */
const advance = (route: Route) =>
  Effect.gen(function* () {
    switch (route) {
      case "install":
        return yield* applyInstallAcceptingExecutionChanges(packRequest(`${KIT}@1.1.0`));
      case "targeted update":
        return expectResolved(
          yield* applyUpdateAcceptingExecutionChanges(targetedUpdateRequest({ source: KIT })),
        );
      case "configured update":
        return expectResolved(
          yield* applyUpdateAcceptingExecutionChanges(configuredUpdateRequest({ type: "pack" })),
        );
    }
  });

describe("Pack transitions that drop members", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const world = (registry?: FileRegistry): InstallWorld => {
    const created = makeInstallWorld(registry === undefined ? {} : { registry });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect.each(routes)(
    "%s leaves exactly what a fresh installation of the target manifest leaves",
    (route) => {
      const advanced = world();
      const { registry } = advanced;
      publishMembers(registry);
      registry.writePack("kit", [first(dropping)]);
      return Effect.gen(function* () {
        yield* advanced.workspace.provide(applyInstallAcceptingExecutionChanges(packRequest(KIT)));
        for (const { source } of DROPPED)
          expect(advanced.workspace.readFile("axm.lock"), source).toContain(source);
        registry.writePack("kit", [first(dropping), successor()]);

        const result = yield* advanced.workspace.provide(advance(route));
        expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
        const rows = result.units.flatMap((unit) => unit.artifact?.members ?? []);
        for (const { row } of DROPPED)
          expect(rows, row).toContainEqual(
            expect.objectContaining({
              id: row,
              changed: true,
              artifact: expect.objectContaining({ change: "removed", previousVersion: "1.0.0" }),
            }),
          );

        const fresh = world(registry);
        yield* fresh.workspace.provide(
          applyInstallAcceptingExecutionChanges(
            packRequest(route === "install" ? `${KIT}@1.1.0` : KIT),
          ),
        );
        expect(comparable(advanced.workspace.snapshot())).toEqual(
          comparable(fresh.workspace.snapshot()),
        );
      }).pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );

  it.effect.each(["a direct declaration", "another Pack"] as const)(
    "keeps a dropped member %s still requires",
    (retainer) => {
      const advanced = world();
      const { registry } = advanced;
      publishMembers(registry);
      registry.writePack("kit", [first({ [MEMBERS.dropped]: "^1.0.0" })]);
      registry.writePack("other", [
        { version: "1.0.0", dependencies: { [MEMBERS.dropped]: "^1.0.0" } },
      ]);
      const retain =
        retainer === "a direct declaration"
          ? installRequest({ type: "skill", subject: { kind: "source", source: MEMBERS.dropped } })
          : packRequest("@acme/packs/other");
      return Effect.gen(function* () {
        yield* advanced.workspace.provide(applyInstallAcceptingExecutionChanges(packRequest(KIT)));
        yield* advanced.workspace.provide(applyInstallAcceptingExecutionChanges(retain));
        registry.writePack("kit", [first({ [MEMBERS.dropped]: "^1.0.0" }), successor()]);

        const result = yield* advanced.workspace.provide(advance("targeted update"));
        expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
        expect(present(advanced, fileRegistryPackagePath(registry, "skills", "dropped"))).toBe(
          true,
        );

        const fresh = world(registry);
        yield* fresh.workspace.provide(applyInstallAcceptingExecutionChanges(packRequest(KIT)));
        yield* fresh.workspace.provide(applyInstallAcceptingExecutionChanges(retain));
        expect(comparable(advanced.workspace.snapshot())).toEqual(
          comparable(fresh.workspace.snapshot()),
        );
      }).pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "retains a dropped MCP connection's native registration and retires its package",
    () => {
      const advanced = world();
      const { registry } = advanced;
      publishMembers(registry);
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      registry.writePack("kit", [first({ "@acme/mcps/context": "^1.0.0" })]);
      return Effect.gen(function* () {
        yield* advanced.workspace.provide(applyInstallAcceptingExecutionChanges(packRequest(KIT)));
        const native = advanced.workspace.readFile(".mcp.json");
        const packagePath = fileRegistryPackagePath(registry, "mcps", "context");
        expect(present(advanced, packagePath)).toBe(true);
        registry.writePack("kit", [first({ "@acme/mcps/context": "^1.0.0" }), successor()]);

        const result = yield* advanced.workspace.provide(advance("targeted update"));
        expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
        expect(advanced.workspace.readFile(".mcp.json")).toBe(native);
        expect(advanced.workspace.readFile("axm.lock")).not.toContain("@acme/mcps/context");
        expect(present(advanced, packagePath)).toBe(false);
      }).pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "refuses dropping a Hook whose retained registration runs package code, then proceeds once it is disabled",
    () => {
      const advanced = world();
      const { registry } = advanced;
      publishMembers(registry);
      registry.writeHook("guard", [{ version: "1.0.0" }]);
      registry.writePack("kit", [first({ "@acme/hooks/guard": "^1.0.0" })]);
      return Effect.gen(function* () {
        yield* advanced.workspace.provide(applyInstallAcceptingExecutionChanges(packRequest(KIT)));
        const packagePath = fileRegistryPackagePath(registry, "hooks", "guard");
        registry.writePack("kit", [first({ "@acme/hooks/guard": "^1.0.0" }), successor()]);
        const before = advanced.workspace.snapshot();

        const preview = yield* advanced.workspace.provide(
          Effect.result(previewUpdate(targetedUpdateRequest({ source: KIT }))),
        );
        const applied = yield* advanced.workspace.provide(
          Effect.result(advance("targeted update")),
        );
        for (const outcome of [preview, applied]) {
          const evidence = JSON.stringify(outcome);
          expect(evidence).toContain("retained native registrations run its package code");
          expect(evidence).toContain("disable");
        }
        expect(advanced.workspace.snapshot()).toEqual(before);

        yield* advanced.workspace.provide(
          applyActivation({ type: "hook", name: "guard", enabled: false }),
        );
        const result = yield* advanced.workspace.provide(advance("targeted update"));
        expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
        expect(advanced.workspace.readFile("axm.lock")).not.toContain("@acme/hooks/guard");
        expect(present(advanced, packagePath)).toBe(false);
        expect(advanced.workspace.readFile(".claude/settings.json")).not.toContain("guard/src/");
      }).pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );
});
