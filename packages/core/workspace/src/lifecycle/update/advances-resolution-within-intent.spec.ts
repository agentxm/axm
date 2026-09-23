import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { countUnitStates, deriveOperationOutcome } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { preapprovedPlanExecution } from "../../transitions/planning/testing.js";
import { SelectiveUpdate } from "./selective/use-case.js";

import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalSkillPackage,
  type LifecycleFixture,
  type LifecycleRegistry,
  type RegistrySkillVersion,
} from "../testing.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
} from "../install/test-helpers.js";
import {
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberBody,
  sharedMemberSettings,
} from "../../desired-state/workspace/test-helpers.js";
import {
  applyUpdate,
  configuredUpdateRequest,
  expectResolved,
  targetedUpdateRequest,
} from "./test-helpers.js";

const lockSkill = (raw: string, name: string): unknown => {
  const parsed: unknown = YAML.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("skills" in parsed)) return undefined;
  if (typeof parsed.skills !== "object" || parsed.skills === null) return undefined;
  return Object.entries(parsed.skills).find(([key]) => key === name)?.[1];
};

export const specification = defineSpecification({
  requirement: "cli/update/advances-resolution-within-intent",
  title: "Update advances the accepted resolution within durable intent",
  statement:
    "Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within its effective constraint — the intersection of its durable direct constraint with the range of every Pack that requires it — without changing axm.json or any other extension, shall be a no-op when already current, and when that intersection admits no version shall change nothing and report a conflict naming every contributor.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["workspace/desired-state/effective-constraint-has-one-owner"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const REVIEW = "code-review";
const FQN = `@acme/skills/${REVIEW}`;
const UNRELATED = "release-notes";

const firstVersion: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };

it.effect(
  "selective subagent update preserves the declared range while advancing within it",
  () => {
    const { workspace, registry, cleanup } = makeInstallWorld();
    const name = "reviewer";
    return workspace
      .provide(
        Effect.gen(function* () {
          registry.writeSubagent(name, [{ version: "1.0.0", body: "Initial reviewer." }]);
          yield* applyInstall(
            installRequest({
              type: "subagent",
              subject: { kind: "source", source: `@acme/subagents/${name}@^1.0.0` },
            }),
          );
          const before = workspace.readFile("axm.json");
          registry.writeSubagent(name, [
            { version: "1.0.0", body: "Initial reviewer." },
            { version: "1.1.0", body: "Compatible reviewer." },
            { version: "2.0.0", body: "Different reviewer." },
          ]);
          const candidate = yield* SelectiveUpdate.prepare({
            kind: "selective-subagents",
            source: Option.none(),
            nameFilters: [name],
            nameFilterFlag: "--name",
            ignoreVersionConstraints: false,
          });
          if (candidate.outcome !== "planned") throw new Error(candidate.message);
          const resolution = yield* SelectiveUpdate.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.1.0");
          expect(workspace.readFile(`.claude/agents/${name}.md`)).toContain("Compatible reviewer.");
          expect(workspace.readFile("axm.json")).toBe(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

/** A declaration that states its source and leaves activation to its default. */
const omittedActivationRows = [
  {
    kind: "selective-skills",
    type: "skill",
    name: REVIEW,
    settingsKey: "skills",
    fqn: FQN,
    publish: (registry: LifecycleRegistry, versions: ReadonlyArray<RegistrySkillVersion>) =>
      registry.writeSkill(REVIEW, versions),
  },
  {
    kind: "selective-subagents",
    type: "subagent",
    name: "reviewer",
    settingsKey: "subagents",
    fqn: "@acme/subagents/reviewer",
    publish: (registry: LifecycleRegistry, versions: ReadonlyArray<RegistrySkillVersion>) =>
      registry.writeSubagent("reviewer", versions),
  },
] as const;

it.effect.each(omittedActivationRows)(
  "selective $type update advances a declaration that omits its activation",
  ({ kind, name, settingsKey, fqn, publish }) => {
    const { workspace, registry, cleanup } = makeInstallWorld({
      settings: { [settingsKey]: { [name]: { source: fqn } } },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          publish(registry, [firstVersion]);
          yield* applyInstall(installRequest({ subject: { kind: "configured" } }));
          expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.0.0");
          publish(registry, [firstVersion, { version: "2.0.0", body: "Second guidance." }]);

          // An omitted `enabled` is an enabled declaration, not a disabled one.
          const candidate = yield* SelectiveUpdate.prepare({
            kind,
            source: Option.none(),
            nameFilters: [name],
            nameFilterFlag: "--name",
            ignoreVersionConstraints: false,
          });
          if (candidate.outcome !== "planned") throw new Error(candidate.message);
          const resolution = yield* SelectiveUpdate.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(workspace.readFile("axm-lock.yaml")).toContain("version: 2.0.0");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

describe.each(["targeted", "selective"] as const)(
  "%s update of a desired Registry extension",
  (route) => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    });

    const world = (): { workspace: LifecycleFixture; registry: LifecycleRegistry } => {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      const workspace = makeLifecycleFixture({
        sources: "live",
        settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      return { workspace, registry };
    };

    /**
     * A workspace holding the accepted first version of a Registry skill,
     * declared through the given locator, and one unrelated local skill, after
     * which the Registry publishes the later versions.
     */
    const acceptedThenPublished = (
      registry: LifecycleRegistry,
      workspace: LifecycleFixture,
      options?: {
        readonly locator?: string;
        readonly later?: ReadonlyArray<RegistrySkillVersion>;
      },
    ) =>
      Effect.gen(function* () {
        registry.writeSkill(REVIEW, [firstVersion]);
        yield* applyInstall(
          installRequest({ subject: { kind: "source", source: options?.locator ?? FQN } }),
        );
        const unrelated = writeLocalSkillPackage(workspace.root, { name: UNRELATED });
        yield* applyInstall(installRequest({ subject: { kind: "source", source: unrelated } }));
        registry.writeSkill(REVIEW, [
          firstVersion,
          ...(options?.later ?? [{ version: "2.0.0", body: "Second guidance." }]),
        ]);
      });

    const update = () =>
      route === "targeted"
        ? applyUpdate(targetedUpdateRequest({ source: FQN }))
        : Effect.gen(function* () {
            const candidate = yield* SelectiveUpdate.prepare({
              kind: "selective-skills",
              source: Option.none(),
              nameFilters: [REVIEW],
              nameFilterFlag: "--name",
              ignoreVersionConstraints: false,
            });
            if (candidate.outcome !== "planned") throw new Error(candidate.message);
            return {
              _tag: "Resolved" as const,
              resolution: yield* SelectiveUpdate.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              ),
            };
          });

    it.effect(
      "advances the accepted resolution and realized content to a later published version",
      () => {
        const { workspace, registry } = world();
        return workspace
          .provide(
            Effect.gen(function* () {
              yield* acceptedThenPublished(registry, workspace);
              expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.0.0");

              const resolution = expectResolved(yield* update());

              expect(workspace.readFile("axm-lock.yaml")).toContain("version: 2.0.0");
              expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
                "Second guidance.",
              );
              expect(deriveOperationOutcome(resolution)).toBe("applied");
              expect(countUnitStates(resolution.units)).toMatchObject({
                committed: 1,
                failed: 0,
                blocked: 0,
              });
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );

    it.effect("advances only to the newest version the recorded constraint allows", () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace, {
              locator: `${FQN}@^1.0.0`,
              later: [
                { version: "1.1.0", body: "Compatible guidance." },
                { version: "2.0.0", body: "Second guidance." },
              ],
            });

            const resolution = expectResolved(yield* update());

            expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.1.0");
            expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
              "Compatible guidance.",
            );
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(countUnitStates(resolution.units)).toMatchObject({
              committed: 1,
              failed: 0,
              blocked: 0,
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

    it.effect("changes no workspace configuration and no unrelated extension", () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace);
            const settingsBefore = JSON.stringify(readSettings(workspace));
            const unrelatedProjection = workspace.readFile(`.claude/skills/${UNRELATED}/SKILL.md`);
            const unrelatedAccepted = lockSkill(workspace.readFile("axm-lock.yaml"), UNRELATED);
            expect(unrelatedAccepted).toBeDefined();

            yield* update();

            expect(JSON.stringify(readSettings(workspace))).toBe(settingsBefore);
            expect(workspace.readFile(`.claude/skills/${UNRELATED}/SKILL.md`)).toBe(
              unrelatedProjection,
            );
            expect(lockSkill(workspace.readFile("axm-lock.yaml"), UNRELATED)).toEqual(
              unrelatedAccepted,
            );
            expect(
              workspace.readFile(`agent_extensions/path/@acme/skills/${UNRELATED}/src/SKILL.md`),
            ).toContain(UNRELATED);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

    it.effect("repeating an update at the advanced resolution reports a no-op", () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace);
            yield* update();
            const lockfileAfterFirst = workspace.readFile("axm-lock.yaml");

            const resolution = expectResolved(yield* update());

            expect(deriveOperationOutcome(resolution)).toBe("no-op");
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileAfterFirst);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  },
);

describe.each(["configured", "targeted", "selective"] as const)(
  "%s update of a member a direct pin and Packs share",
  (route) => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    });

    /**
     * The shared-member scenario accepted at 1.0.0, after which the person
     * re-pins the direct declaration.
     */
    const acceptedThenRepinned = (pin: string) =>
      Effect.gen(function* () {
        const created = makeInstallWorld({ settings: sharedMemberSettings("1.0.0") });
        cleanups.push(created.cleanup);
        publishSharedMemberScenario(created.registry);
        yield* created.workspace.provide(
          applyInstall(installRequest({ subject: { kind: "configured" } })),
        );
        // Re-pin in the form install recorded, so only the pin changes.
        const settings = readSettings(created.workspace);
        const skills = settings["skills"];
        const declared =
          typeof skills === "object" && skills !== null && SHARED_MEMBER.name in skills
            ? Reflect.get(skills, SHARED_MEMBER.name)
            : undefined;
        if (typeof declared !== "string") throw new Error("Expected the recorded direct pin");
        created.workspace.writeFile(
          "axm.json",
          `${JSON.stringify(
            {
              ...settings,
              skills: { [SHARED_MEMBER.name]: declared.replace(/@1\.0\.0$/u, `@${pin}`) },
            },
            null,
            2,
          )}\n`,
        );
        return created.workspace;
      });

    const update = () =>
      Effect.gen(function* () {
        if (route === "configured") return yield* applyUpdate(configuredUpdateRequest({}));
        if (route === "targeted") {
          return yield* applyUpdate(targetedUpdateRequest({ source: SHARED_MEMBER.fqn }));
        }
        const candidate = yield* SelectiveUpdate.prepare({
          kind: "selective-skills",
          source: Option.none(),
          nameFilters: [SHARED_MEMBER.name],
          nameFilterFlag: "--name",
          ignoreVersionConstraints: false,
        });
        if (candidate.outcome !== "planned") throw new Error(candidate.message);
        return {
          _tag: "Resolved" as const,
          resolution: yield* SelectiveUpdate.previewOrApply(candidate, preapprovedPlanExecution),
        };
      });

    it.effect("advances to the direct pin, not the newest version every Pack admits", () =>
      Effect.gen(function* () {
        const workspace = yield* acceptedThenRepinned(SHARED_MEMBER_PIN.inside);
        const settingsBefore = workspace.readFile("axm.json");

        const resolution = expectResolved(yield* workspace.provide(update()));

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(lockSkill(workspace.readFile("axm-lock.yaml"), SHARED_MEMBER.name)).toMatchObject({
          resolved: { version: SHARED_MEMBER_PIN.inside },
        });
        expect(workspace.readFile(`.claude/skills/${SHARED_MEMBER.name}/SKILL.md`)).toContain(
          sharedMemberBody(SHARED_MEMBER_PIN.inside),
        );
        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect(
      "a direct pin outside every Pack range changes nothing and names all three contributors",
      () =>
        Effect.gen(function* () {
          const workspace = yield* acceptedThenRepinned(SHARED_MEMBER_PIN.outside);
          const before = workspace.snapshot();

          const refusal = yield* workspace.provide(
            update().pipe(
              Effect.map((outcome) => {
                const resolution = expectResolved(outcome);
                expect(countUnitStates(resolution.units).committed).toBe(0);
                return [
                  resolution.blocking?.detail ?? "",
                  ...resolution.units.map((unit) => unit.message ?? ""),
                ].join(" ");
              }),
              Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
                Effect.succeed(failure.detail ?? ""),
              ),
            ),
          );

          expect(refusal).toContain(`settings range=${SHARED_MEMBER_PIN.outside}`);
          for (const pack of SHARED_MEMBER_PACKS) {
            expect(refusal).toContain(`${pack.fqn} range=${pack.range}`);
          }
          expect(workspace.snapshot()).toEqual(before);
        }).pipe(Effect.provide(NodeServices.layer)),
    );
  },
);
