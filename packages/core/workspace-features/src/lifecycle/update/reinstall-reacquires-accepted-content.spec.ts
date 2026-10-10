import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { UpdateExtensions } from "./update-extensions.js";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import {
  applyUpdate,
  configuredUpdateRequest,
  targetedUpdateRequest,
  previewUpdate,
  expectResolved,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/reinstall-reacquires-accepted-content",
  title: "Update reinstall reacquires an accepted source without bypassing selection policies",
  statement:
    "Root and typed updates with --reinstall shall reacquire already accepted external content even when its selected version is unchanged, for all seven extension types. Ordinary updates shall reuse usable accepted Registry content at that version. Reinstall preview shall describe the same acquisition without writing workspace state. A reinstall shall preserve desired constraints and Pack ownership, remain subject to release-age and publisher approval policies, and reject a candidate made stale by intervening material changes without overwriting them.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update reacquisition", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect.each(["configured", "targeted"] as const)(
    "%s reinstall refuses changed Registry bytes under the accepted version",
    (route) => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const source = "@acme/skills/review";
      registry.writeSkill("review", [{ version: "1.0.0", body: "Accepted guidance." }]);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source } }),
            );
            registry.writeSkill("review", [
              { version: "1.0.0", body: "Different immutable content." },
            ]);
            const before = workspace.snapshot();
            const request =
              route === "configured"
                ? configuredUpdateRequest({ type: "skill", reinstall: true })
                : targetedUpdateRequest({ source, reinstall: true });
            const result = yield* Effect.result(applyUpdate(request));
            if (result._tag === "Success") {
              const resolved = expectResolved(result.success);
              expect(deriveOperationOutcome(resolved)).toBe("failed");
              expect(resolved.units.filter((unit) => unit.state === "committed")).toEqual([]);
              expect(
                resolved.units.some((unit) => unit.error?.category === "conflict"),
                JSON.stringify(resolved),
              ).toBe(true);
            } else {
              expect(result.failure).toMatchObject({ category: "conflict" });
            }
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
  it.effect("rejects a reinstall candidate after an intervening canonical edit", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "review" });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );
          const candidate = yield* UpdateExtensions.prepare(
            configuredUpdateRequest({ type: "skill", reinstall: true }),
          );
          if (candidate.outcome === "nothing-configured")
            throw new Error("Expected an accepted skill");
          const before = workspace.snapshot();
          yield* UpdateExtensions.previewOrApply(candidate, previewPlanExecution);
          expect(workspace.snapshot()).toEqual(before);
          workspace.writeFile(
            "agent_extensions/_local/project/vendor/review/src/SKILL.md",
            "Intervening edit.\n",
          );
          const intervening = workspace.snapshot();
          const result = yield* UpdateExtensions.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(result.resolution.blocking?.class).toBe("stale-candidate");
          expect(result.installedSkills).toEqual([]);
          expect(workspace.snapshot()).toEqual(intervening);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
  for (const type of installableExtensionTypes) {
    it.effect.each(["configured", "targeted"] as const)(
      `${type}: %s --reinstall reacquires current content and preview writes nothing`,
      (route) => {
        const world = makeInstallWorld();
        cleanups.push(world.cleanup);
        const name = "current";
        const versions = [{ version: "1.0.0", body: "Accepted guidance." }];
        const publish = () => {
          switch (type) {
            case "skill":
              world.registry.writeSkill(name, versions);
              break;
            case "subagent":
              world.registry.writeSubagent(name, versions);
              break;
            case "rule":
              world.registry.writeRule(name, versions);
              break;
            case "hook":
              world.registry.writeHook(name, versions);
              break;
            case "knowledge":
              world.registry.writeKnowledge(name, versions);
              break;
            case "mcp-server":
              world.registry.writeMcp(name, versions);
              break;
            case "pack":
              world.registry.writeSkill("member", versions);
              world.registry.writePack(
                name,
                versions.map(({ version }) => ({
                  version,
                  dependencies: { "@acme/skills/member": "^1.0.0" },
                })),
              );
              break;
          }
        };
        publish();
        const source = `@acme/${toExtensionTypePlural(type)}/${name}`;
        const request = (reinstall: boolean) =>
          route === "targeted"
            ? targetedUpdateRequest({ source, reinstall })
            : configuredUpdateRequest({ type, reinstall });
        return world.workspace
          .provide(
            Effect.gen(function* () {
              yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));
              const before = world.workspace.snapshot();
              const acquired = yield* Ref.make<ReadonlyArray<string>>([]);
              const providers = yield* SourceHostProviders;
              const observe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
                effect.pipe(
                  Effect.provideService(SourceHostProviders, {
                    ...providers,
                    acquireForTransition: (ref) =>
                      Ref.update(acquired, (names) => [...names, `${ref.type}/${ref.name}`]).pipe(
                        Effect.andThen(providers.acquireForTransition(ref)),
                      ),
                  }),
                );
              const ordinary = expectResolved(yield* observe(applyUpdate(request(false))));
              expect(deriveOperationOutcome(ordinary), JSON.stringify(ordinary)).toBe("no-op");
              expect(yield* Ref.get(acquired)).toEqual([]);
              expect(world.workspace.snapshot()).toEqual(before);

              versions.push({ version: "1.1.0", body: "Newer guidance." });
              publish();
              const preview = expectResolved(yield* observe(previewUpdate(request(true))));
              expect(preview.mode).toBe("preview");
              expect(preview.units.every((unit) => unit.state === "ready")).toBe(true);
              expect(world.workspace.snapshot()).toEqual(before);
              expect(yield* Ref.get(acquired)).toEqual([]);

              const applied = expectResolved(yield* observe(applyUpdate(request(true))));
              expect(deriveOperationOutcome(applied), JSON.stringify(applied)).toBe("no-op");
              expect(yield* Ref.get(acquired)).toContain(`${type}/${name}`);
              if (type === "pack") expect(yield* Ref.get(acquired)).toContain("skill/member");
              expect(world.workspace.readFile("axm-lock.yaml")).not.toContain("version: 1.1.0");
              expect(world.workspace.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
      30_000,
    );
  }
});
