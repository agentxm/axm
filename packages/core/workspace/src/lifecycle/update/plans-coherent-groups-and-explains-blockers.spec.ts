import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { countUnitStates, deriveOperationOutcome } from "../../transitions/planning/index.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../install/test-helpers.js";
import {
  applyUpdate,
  configuredUpdateRequest,
  expectResolved,
  previewUpdate,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/plans-coherent-groups-and-explains-blockers",
  title:
    "A workspace update settles related Pack changes together and names what a refusal prevented",
  statement:
    "A workspace update shall plan selected Packs that share a member as one group against the same proposed graph, refuse a group whose constraints cannot be satisfied — a direct declaration of a shared member contributing its range like any Pack — before it writes anything, and report every selected Pack and directly declared member that refusal prevented together with every constraint that decided it, while a group that shares no member with a refused one remains free to settle and stays committed.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "cli/update/advances-resolution-within-intent",
    "cli/mutations-are-closure-atomic",
    "workspace/desired-state/effective-constraint-has-one-owner",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether a blocked group should also report the newest Pack version it could have selected, which cli/update/explains-excluded-newer-versions owns separately.",
  ],
});

/** Publish one Pack major and the member major it requires. */
const publishPack = (
  registry: InstallWorld["registry"],
  args: {
    readonly pack: string;
    readonly rule: string;
    readonly packVersion: string;
    readonly memberRange: string;
  },
): void => {
  registry.writePack(args.pack, [
    { version: args.packVersion, dependencies: { [`@acme/rules/${args.rule}`]: args.memberRange } },
  ]);
};

const lockContains = (workspace: InstallWorld["workspace"], text: string): boolean =>
  workspace.readFile("axm-lock.yaml").includes(text);

const installPack = (name: string) =>
  applyInstall(
    installRequest({ type: "pack", subject: { kind: "source", source: `@acme/packs/${name}` } }),
  );

describe("A workspace update plans coherent groups", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect(
    "two selected Packs sharing a member advance on one member resolution",
    () => {
      const { workspace, registry } = world();
      registry.writeRule("shared", [{ version: "1.0.0", body: "First." }]);
      publishPack(registry, {
        pack: "one",
        rule: "shared",
        packVersion: "1.0.0",
        memberRange: "^1.0.0",
      });
      publishPack(registry, {
        pack: "two",
        rule: "shared",
        packVersion: "1.0.0",
        memberRange: "^1.0.0",
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* installPack("one");
            yield* installPack("two");

            registry.writeRule("shared", [
              { version: "1.0.0", body: "First." },
              { version: "1.1.0", body: "Second." },
            ]);
            registry.writePack("one", [
              { version: "1.0.0", dependencies: { "@acme/rules/shared": "^1.0.0" } },
              { version: "1.1.0", dependencies: { "@acme/rules/shared": "^1.1.0" } },
            ]);
            registry.writePack("two", [
              { version: "1.0.0", dependencies: { "@acme/rules/shared": "^1.0.0" } },
              { version: "1.1.0", dependencies: { "@acme/rules/shared": "^1.1.0" } },
            ]);

            const resolution = expectResolved(
              yield* applyUpdate(configuredUpdateRequest({ type: "pack" })),
            );

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(lockContains(workspace, "version: 1.1.0")).toBe(true);
            expect(lockContains(workspace, "version: 1.0.0")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 15_000 },
  );

  it.effect("a refused group leaves an independent ready group free to settle", () => {
    const { workspace, registry } = world();
    registry.writeRule("alpha", [{ version: "1.0.0", body: "Alpha one." }]);
    registry.writeRule("beta", [{ version: "1.0.0", body: "Beta one." }]);
    publishPack(registry, {
      pack: "alpha-pack",
      rule: "alpha",
      packVersion: "1.0.0",
      memberRange: "^1.0.0",
    });
    publishPack(registry, {
      pack: "beta-pack",
      rule: "beta",
      packVersion: "1.0.0",
      memberRange: "^1.0.0",
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("alpha-pack");
          yield* installPack("beta-pack");
          // A declared member constraint the newer alpha-pack cannot satisfy.
          yield* applyInstall(
            installRequest({
              type: "rule",
              subject: { kind: "source", source: "@acme/rules/alpha@^1.0.0" },
            }),
          );

          registry.writeRule("alpha", [
            { version: "1.0.0", body: "Alpha one." },
            { version: "2.0.0", body: "Alpha two." },
          ]);
          registry.writeRule("beta", [
            { version: "1.0.0", body: "Beta one." },
            { version: "1.1.0", body: "Beta two." },
          ]);
          registry.writePack("alpha-pack", [
            { version: "1.0.0", dependencies: { "@acme/rules/alpha": "^1.0.0" } },
            { version: "2.0.0", dependencies: { "@acme/rules/alpha": "^2.0.0" } },
          ]);
          registry.writePack("beta-pack", [
            { version: "1.0.0", dependencies: { "@acme/rules/beta": "^1.0.0" } },
            { version: "1.1.0", dependencies: { "@acme/rules/beta": "^1.1.0" } },
          ]);

          const resolution = expectResolved(
            yield* applyUpdate(configuredUpdateRequest({ type: "pack" })),
          );

          const counts = countUnitStates(resolution.units);
          expect(counts.blocked).toBeGreaterThan(0);
          expect(counts.committed).toBeGreaterThan(0);
          // The independent group settled and stays committed.
          expect(lockContains(workspace, "version: 1.1.0")).toBe(true);
          // The refused group wrote nothing.
          expect(lockContains(workspace, "version: 2.0.0")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a refused group prevents the directly declared member it shares", () => {
    const { workspace, registry } = world();
    registry.writeRule("alpha", [{ version: "1.0.0", body: "Alpha one." }]);
    publishPack(registry, {
      pack: "alpha-pack",
      rule: "alpha",
      packVersion: "1.0.0",
      memberRange: "^1.0.0",
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("alpha-pack");
          yield* applyInstall(
            installRequest({
              type: "rule",
              subject: { kind: "source", source: "@acme/rules/alpha@^2.0.0 || ^1.0.0" },
            }),
          );
          // The person now pins the member outside the range the Pack requires.
          workspace.writeFile(
            "axm.json",
            workspace.readFile("axm.json").replace("@^2.0.0 || ^1.0.0", "@^2.0.0"),
          );
          registry.writeRule("alpha", [
            { version: "1.0.0", body: "Alpha one." },
            { version: "2.0.0", body: "Alpha two." },
          ]);
          const lockBefore = workspace.readFile("axm-lock.yaml");

          const resolution = expectResolved(yield* applyUpdate(configuredUpdateRequest({})));

          const blocked = resolution.units.filter((unit) => unit.state === "blocked");
          expect(blocked.map((unit) => unit.label)).toEqual(
            expect.arrayContaining(["rules/alpha", "@acme/packs/alpha-pack"]),
          );
          for (const unit of blocked) {
            expect(unit.blocking?.reference).toBe("pack-constraint-conflict");
            expect(unit.message).toContain("settings range=^2.0.0");
            expect(unit.message).toContain("@acme/packs/alpha-pack range=^1.0.0");
          }
          expect(countUnitStates(resolution.units).committed).toBe(0);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a refusal names the selected Pack it prevented and the deciding constraints", () => {
    const { workspace, registry } = world();
    registry.writeRule("alpha", [{ version: "1.0.0", body: "Alpha one." }]);
    publishPack(registry, {
      pack: "alpha-pack",
      rule: "alpha",
      packVersion: "1.0.0",
      memberRange: "^1.0.0",
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installPack("alpha-pack");
          yield* applyInstall(
            installRequest({
              type: "rule",
              subject: { kind: "source", source: "@acme/rules/alpha@^1.0.0" },
            }),
          );
          registry.writeRule("alpha", [
            { version: "1.0.0", body: "Alpha one." },
            { version: "2.0.0", body: "Alpha two." },
          ]);
          registry.writePack("alpha-pack", [
            { version: "1.0.0", dependencies: { "@acme/rules/alpha": "^1.0.0" } },
            { version: "2.0.0", dependencies: { "@acme/rules/alpha": "^2.0.0" } },
          ]);

          const previewed = expectResolved(
            yield* previewUpdate(configuredUpdateRequest({ type: "pack" })),
          );
          const applied = expectResolved(
            yield* applyUpdate(configuredUpdateRequest({ type: "pack" })),
          );

          for (const resolution of [previewed, applied]) {
            const blocked = resolution.units.filter((unit) => unit.state === "blocked");
            // One label policy for every planner: a blocked row states its
            // owner and type like every other row of the same ledger.
            expect(blocked.map((unit) => unit.label)).toContain("@acme/packs/alpha-pack");
            // A machine consumer reads the class of blocker without parsing prose.
            expect(blocked.map((unit) => unit.blocking?.reference)).toContain(
              "pack-constraint-conflict",
            );
            const reason = blocked.map((unit) => unit.message ?? "").join(" ");
            expect(reason).toContain("prevented=@acme/packs/alpha-pack");
            // Every contributor is named: the direct declaration and the Pack.
            expect(reason).toContain("settings range=^1.0.0");
            expect(reason).toContain("@acme/packs/alpha-pack range=^2.0.0");
            expect(lockContains(workspace, "version: 2.0.0")).toBe(false);
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
