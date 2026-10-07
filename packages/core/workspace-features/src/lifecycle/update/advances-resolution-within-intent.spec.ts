import * as Schema from "effect/Schema";
import { LockfileSchema } from "@agentxm/workspace-kernel/workspace-state";
import { fileRegistryPackagePath } from "../../testing/install-world.js";
import * as DateTime from "effect/DateTime";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";

import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import { makeGitSkillRepository } from "../../testing/git-repositories.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import {
  makeFileRegistry,
  type FileRegistry,
  type RegistrySkillVersion,
} from "@agentxm/registry-client/testing";
import { readSettings } from "../install/test-helpers.js";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
import {
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  SHARED_SUBAGENT,
  SHARED_SUBAGENT_PACKS,
  publishSharedMemberScenario,
  publishSharedSubagentScenario,
  sharedMemberBody,
  sharedMemberSettings,
  sharedSubagentSettings,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import {
  applyUpdate,
  previewUpdate,
  configuredUpdateRequest,
  expectResolved,
  targetedUpdateRequest,
} from "./test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";

const lockSkill = (raw: string, name: string): unknown => {
  const parsed: unknown = Schema.decodeUnknownSync(LockfileSchema)(YAML.parse(raw));
  if (typeof parsed !== "object" || parsed === null || !("skills" in parsed)) return undefined;
  if (typeof parsed.skills !== "object" || parsed.skills === null) return undefined;
  return Object.entries(parsed.skills).find(([key]) => key === name)?.[1];
};

export const specification = defineSpecification({
  requirement: "cli/update/advances-resolution-within-intent",
  title: "Update advances the accepted resolution within durable intent",
  statement:
    "Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within its effective constraint — the intersection of its durable direct constraint with the range of every Pack that requires it — without changing axm.json or any other extension, shall be a no-op when already current, and when that intersection admits no version shall change nothing and report a conflict naming every contributor. Every type-group spelling of update shall be the root sweep narrowed to one type, so a range never selects a yanked release, a release under the minimum age is taken only under a declared exemption or the one-shot override and is otherwise reported as held, an edited or missing canonical tree is reacquired and reported as updated, and an entry pinned to a Git tag or commit is held unchanged while a newer tag is reported.",
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
const canonicalSkillDocument = (registry: FileRegistry) =>
  `${fileRegistryPackagePath(registry, "skills", REVIEW)}/src/SKILL.md`;

const firstVersion: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };

it.effect("updates a member within a missing acquired Pack's accepted constraint", () => {
  const { workspace, registry, cleanup } = makeInstallWorld();
  registry.writeSkill(REVIEW, [firstVersion]);
  registry.writePack("toolkit", [{ version: "1.0.0", dependencies: { [FQN]: "^1.0.0" } }]);
  return workspace
    .provide(
      Effect.gen(function* () {
        yield* applyInstall(
          installRequest({
            type: "pack",
            subject: { kind: "source", source: "@acme/packs/toolkit@^1.0.0" },
          }),
        );
        fs.rmSync(
          nodePath.join(workspace.root, fileRegistryPackagePath(registry, "packs", "toolkit")),
          {
            recursive: true,
          },
        );
        registry.writeSkill(REVIEW, [
          firstVersion,
          { version: "1.1.0", body: "Compatible guidance." },
          { version: "2.0.0", body: "Outside the accepted Pack constraint." },
        ]);
        const before = workspace.snapshot();
        const sources = yield* SourceHostProviders;
        yield* Effect.gen(function* () {
          const request = targetedUpdateRequest({ source: FQN });
          const preview = expectResolved(yield* previewUpdate(request));
          expect(deriveOperationOutcome(preview), JSON.stringify(preview)).toBe("previewed");
          expect(workspace.snapshot()).toEqual(before);
          const applied = expectResolved(yield* applyUpdate(request));
          expect(deriveOperationOutcome(applied), JSON.stringify(applied)).toBe("applied");
          expect(lockSkill(workspace.readFile("axm-lock.yaml"), REVIEW)).toMatchObject({
            resolved: { version: "1.1.0" },
          });
          expect(workspace.readFile(canonicalSkillDocument(registry))).toContain(
            "Compatible guidance.",
          );
          expect(workspace.exists(fileRegistryPackagePath(registry, "packs", "toolkit"))).toBe(
            false,
          );
        }).pipe(
          Effect.provideService(SourceHostProviders, {
            ...sources,
            fetch: (ref) =>
              ref.type === "pack"
                ? Effect.die("Update planning must not fetch accepted Pack declarations")
                : sources.fetch(ref),
            acquireForTransition: (ref) =>
              ref.type === "pack"
                ? Effect.die("Update planning must not acquire accepted Pack declarations")
                : sources.acquireForTransition(ref),
          }),
        );
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});

/** The two spellings of one Registry binding a direct declaration may carry. */
const DECLARATION_SPELLINGS = ["bare", "registry-qualified"] as const;
type DeclarationSpelling = (typeof DECLARATION_SPELLINGS)[number];

/** A Registry locator spelled bare, or qualified by the configured source it binds to. */
const spelled = (locator: string, spelling: DeclarationSpelling, sourceName: string): string =>
  spelling === "bare" ? locator : `${sourceName}:${locator}`;

/** `axm skills update --name <name>`: the configured sweep narrowed to one skill. */
const typeGroupSkillUpdate = (name: string) =>
  applyUpdate(configuredUpdateRequest({ type: "skill", nameFilters: [name] }));

/** `axm subagents update --name <name>`: the configured sweep narrowed to one subagent. */
const typeGroupSubagentUpdate = (name: string) =>
  applyUpdate(configuredUpdateRequest({ type: "subagent", nameFilters: [name] }));

it.effect(
  "a type-group subagent update preserves the declared range while advancing within it",
  () => {
    const { workspace, registry, cleanup } = makeInstallWorld();
    const name = "reviewer";
    return workspace
      .provide(
        Effect.gen(function* () {
          registry.writeSubagent(name, [{ version: "1.0.0", body: "Initial reviewer." }]);
          const initial = yield* applyInstall(
            installRequest({
              type: "subagent",
              subject: { kind: "source", source: `@acme/subagents/${name}@^1.0.0` },
            }),
          );
          expect(deriveOperationOutcome(initial), JSON.stringify(initial)).toBe("applied");
          const before = workspace.readFile("axm.json");
          registry.writeSubagent(name, [
            { version: "1.0.0", body: "Initial reviewer." },
            { version: "1.1.0", body: "Compatible reviewer." },
            { version: "2.0.0", body: "Different reviewer." },
          ]);
          const resolution = expectResolved(yield* typeGroupSubagentUpdate(name));
          expect(deriveOperationOutcome(resolution), JSON.stringify(resolution)).toBe("applied");
          expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.1.0");
          expect(workspace.readFile(`.claude/agents/${name}.md`)).toContain("Compatible reviewer.");
          expect(workspace.readFile("axm.json")).toBe(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

for (const scope of ["project", "user"] as const)
  it.effect(
    `refuses an incompatible native subagent update before mutation in ${scope} scope`,
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld({ scope });
      return workspace
        .provide(
          Effect.gen(function* () {
            registry.writeSubagent("reviewer", [{ version: "1.0.0", body: "Initial reviewer." }]);
            const initial = yield* applyInstall(
              installRequest({
                type: "subagent",
                subject: { kind: "source", source: "@acme/subagents/reviewer@^1.0.0" },
              }),
            );
            expect(deriveOperationOutcome(initial)).toBe("applied");
            registry.writeSubagent("reviewer", [
              { version: "1.0.0", body: "Initial reviewer." },
              {
                version: "1.1.0",
                files: {
                  "subagent.json": JSON.stringify({
                    owner: "@acme",
                    type: "subagent",
                    name: "reviewer",
                    version: "1.1.0",
                    implementations: { codex: { kind: "native", source: "native/review.toml" } },
                  }),
                  "native/review.toml":
                    'name = "reviewer"\ndescription = "Review"\ndeveloper_instructions = "Review evidence"\n',
                },
              },
            ]);
            const before = workspace.snapshot();
            const homeBefore = workspace.homeSnapshot();
            const result = expectResolved(yield* typeGroupSubagentUpdate("reviewer"));
            expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("blocked");
            expect(result.blocking?.causeCode).toBe("conflict");
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
    { timeout: 90_000 },
  );

describe("type-group subagent update of a member a direct pin and Packs share", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * The shared-subagent scenario accepted at 1.0.0, after which the person
   * re-declares the subagent with `pin` as its range or with no range at all,
   * spelled as a bare FQN or qualified by the configured Registry it binds to.
   */
  const acceptedThenRedeclared = (
    pin: string | undefined,
    spelling: DeclarationSpelling = "bare",
  ) =>
    Effect.gen(function* () {
      const created = makeInstallWorld({ settings: sharedSubagentSettings("1.0.0") });
      cleanups.push(created.cleanup);
      publishSharedSubagentScenario(created.registry);
      yield* created.workspace.provide(
        applyInstall(installRequest({ subject: { kind: "configured" } })),
      );
      created.workspace.writeFile(
        "axm.json",
        `${JSON.stringify(
          {
            ...readSettings(created.workspace),
            subagents: {
              [SHARED_SUBAGENT.name]: spelled(
                pin === undefined ? SHARED_SUBAGENT.fqn : `${SHARED_SUBAGENT.fqn}@${pin}`,
                spelling,
                created.registry.source.name,
              ),
            },
          },
          null,
          2,
        )}\n`,
      );
      return created.workspace;
    });

  const lockedVersion = (workspace: LifecycleFixture): unknown => {
    const parsed: unknown = Schema.decodeUnknownSync(LockfileSchema)(
      YAML.parse(workspace.readFile("axm-lock.yaml")),
    );
    if (typeof parsed !== "object" || parsed === null || !("subagents" in parsed)) return undefined;
    const locked = parsed.subagents;
    if (typeof locked !== "object" || locked === null) return undefined;
    const entry: unknown = Reflect.get(locked, SHARED_SUBAGENT.name);
    return typeof entry === "object" && entry !== null && "resolved" in entry
      ? entry.resolved
      : undefined;
  };

  it.effect.each(DECLARATION_SPELLINGS)(
    "advances a %s direct pin to the pin, not the newest version every Pack admits, and names the Packs that hold it back",
    (spelling) =>
      Effect.gen(function* () {
        const workspace = yield* acceptedThenRedeclared(SHARED_MEMBER_PIN.inside, spelling);

        const resolution = expectResolved(
          yield* workspace.provide(typeGroupSubagentUpdate(SHARED_SUBAGENT.name)),
        );

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(lockedVersion(workspace)).toMatchObject({ version: SHARED_MEMBER_PIN.inside });
        const message = resolution.units.map((unit) => unit.message ?? "").join("\n");
        for (const pack of SHARED_SUBAGENT_PACKS) {
          expect(message).toContain(
            `${SHARED_SUBAGENT.fqn} held at ${SHARED_MEMBER_PIN.inside} by pack "${pack.fqn}" (${pack.range}), latest is 2.0.0`,
          );
        }
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "a direct pin outside every Pack range changes nothing and names all three contributors",
    () =>
      Effect.gen(function* () {
        const workspace = yield* acceptedThenRedeclared(SHARED_MEMBER_PIN.outside);
        const lockBefore = workspace.readFile("axm-lock.yaml");

        const resolution = expectResolved(
          yield* workspace.provide(typeGroupSubagentUpdate(SHARED_SUBAGENT.name)),
        );

        expect(countUnitStates(resolution.units).committed).toBe(0);
        const refusal = [
          resolution.blocking?.detail ?? "",
          ...resolution.units.map((unit) => unit.message ?? ""),
        ].join(" ");
        expect(refusal).toContain(`settings range=${SHARED_MEMBER_PIN.outside}`);
        for (const pack of SHARED_SUBAGENT_PACKS) {
          expect(refusal).toContain(`${pack.fqn} range=${pack.range}`);
        }
        expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "without a direct range, advances within the Packs' ranges, not to the newest release",
    () =>
      Effect.gen(function* () {
        const workspace = yield* acceptedThenRedeclared(undefined);

        const resolution = expectResolved(
          yield* workspace.provide(typeGroupSubagentUpdate(SHARED_SUBAGENT.name)),
        );

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(lockedVersion(workspace)).toMatchObject({ version: "1.2.0" });
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

/** A declaration that states its source and leaves activation to its default. */
const omittedActivationRows = [
  {
    type: "skill",
    name: REVIEW,
    settingsKey: "skills",
    fqn: FQN,
    publish: (registry: FileRegistry, versions: ReadonlyArray<RegistrySkillVersion>) =>
      registry.writeSkill(REVIEW, versions),
  },
  {
    type: "subagent",
    name: "reviewer",
    settingsKey: "subagents",
    fqn: "@acme/subagents/reviewer",
    publish: (registry: FileRegistry, versions: ReadonlyArray<RegistrySkillVersion>) =>
      registry.writeSubagent("reviewer", versions),
  },
] as const;

it.effect.each(omittedActivationRows)(
  "a type-group $type update advances a declaration that omits its activation",
  ({ type, name, settingsKey, fqn, publish }) => {
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
          const resolution = expectResolved(
            yield* applyUpdate(configuredUpdateRequest({ type, nameFilters: [name] })),
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(workspace.readFile("axm-lock.yaml")).toContain("version: 2.0.0");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

describe.each(["targeted", "type-group"] as const)(
  "%s update of a desired Registry extension",
  (route) => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    });

    const world = (): { workspace: LifecycleFixture; registry: FileRegistry } => {
      const registry = makeFileRegistry();
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
      registry: FileRegistry,
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
        : typeGroupSkillUpdate(REVIEW);

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

    it.effect("never selects a yanked release, however new", () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace, {
              later: [
                { version: "1.5.0", body: "Fifth guidance." },
                {
                  version: "2.0.0",
                  body: "Yanked guidance.",
                  yankedAt: "2026-01-01T00:00:00.000Z",
                },
              ],
            });

            const resolution = expectResolved(yield* update());

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.5.0");
            expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
              "Fifth guidance.",
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

    it.effect(
      "holds a release under the minimum age, and takes it only under the one-shot override",
      () => {
        const { workspace, registry } = world();
        return workspace
          .provide(
            Effect.gen(function* () {
              const publishedAt = DateTime.formatIso(yield* DateTime.now);
              yield* acceptedThenPublished(registry, workspace, {
                later: [{ version: "2.0.0", body: "Fresh guidance.", published: publishedAt }],
              });

              const held = expectResolved(yield* update());
              expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.0.0");
              expect(workspace.readFile("axm-lock.yaml")).not.toContain("version: 2.0.0");
              expect(held.releaseAge?.holdbacks).toEqual([
                expect.objectContaining({ target: FQN, candidateVersion: "2.0.0" }),
              ]);
              expect(held.releaseAge?.bypasses).toEqual([]);

              const taken = expectResolved(
                yield* update().pipe(Effect.provideService(ReleaseAgePosture, "ignore")),
              );
              expect(deriveOperationOutcome(taken)).toBe("applied");
              expect(workspace.readFile("axm-lock.yaml")).toContain("version: 2.0.0");
              expect(taken.releaseAge?.bypasses).toEqual([
                expect.objectContaining({
                  target: FQN,
                  candidateVersion: "2.0.0",
                  bypassCause: "ignore-flag",
                }),
              ]);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );

    it.effect("reacquires a canonical tree that was edited after acceptance", () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace, { later: [] });
            expect(workspace.readFile(canonicalSkillDocument(registry))).toContain(
              "First guidance.",
            );
            workspace.writeFile(canonicalSkillDocument(registry), "# code-review\n\nTampered.\n");

            const resolution = expectResolved(yield* update());

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(countUnitStates(resolution.units)).toMatchObject({ committed: 1, failed: 0 });
            expect(workspace.readFile(canonicalSkillDocument(registry))).toContain(
              "First guidance.",
            );
            expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
              "First guidance.",
            );
            expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.0.0");
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
              workspace.readFile(
                `agent_extensions/_local/project/vendor/${UNRELATED}/src/SKILL.md`,
              ),
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

describe.each(["root", "type-group"] as const)(
  "%s update of a skill pinned to a Git tag",
  (route) => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    });

    const update = () =>
      route === "root" ? applyUpdate(configuredUpdateRequest({})) : typeGroupSkillUpdate(REVIEW);

    it.effect("holds the pinned tag unchanged and reports the newer tag", () =>
      Effect.gen(function* () {
        const remote = yield* makeGitSkillRepository({ name: REVIEW });
        cleanups.push(remote.cleanup);
        remote.tag("v1.0.0");
        const workspace = makeLifecycleFixture({
          sources: "live",
          settings: { owner: "@acme", agents: ["claude-code"] },
        });
        cleanups.push(workspace.cleanup);

        yield* workspace.provide(
          applyInstall(
            installRequest({ subject: { kind: "source", source: `${remote.url}#v1.0.0` } }),
          ),
        );
        const lockBefore = workspace.readFile("axm-lock.yaml");
        expect(lockBefore).toContain(remote.acceptedCommit);
        remote.advance();
        remote.tag("v2.0.0");

        const resolution = expectResolved(yield* workspace.provide(update()));

        expect(deriveOperationOutcome(resolution)).toBe("no-op");
        expect(resolution.units.map((unit) => unit.message)).toEqual([
          `${REVIEW} is pinned to Git tag v1.0.0; newer tag v2.0.0 is available`,
        ]);
        expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
        expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).not.toContain(
          "New guidance.",
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  },
);

describe.each(["configured", "targeted", "type-group"] as const)(
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
     * re-pins the direct declaration, spelled as a bare FQN or qualified by
     * the configured Registry it binds to. Both spellings name one binding.
     */
    const acceptedThenRepinned = (pin: string, spelling: DeclarationSpelling = "bare") =>
      Effect.gen(function* () {
        const created = makeInstallWorld({ settings: sharedMemberSettings("1.0.0") });
        cleanups.push(created.cleanup);
        publishSharedMemberScenario(created.registry);
        yield* created.workspace.provide(
          applyInstall(installRequest({ subject: { kind: "configured" } })),
        );
        created.workspace.writeFile(
          "axm.json",
          `${JSON.stringify(
            {
              ...readSettings(created.workspace),
              skills: {
                [SHARED_MEMBER.name]: spelled(
                  `${SHARED_MEMBER.fqn}@${pin}`,
                  spelling,
                  created.registry.source.name,
                ),
              },
            },
            null,
            2,
          )}\n`,
        );
        return created.workspace;
      });

    const update = () => {
      switch (route) {
        case "configured":
          return applyUpdate(configuredUpdateRequest({}));
        case "targeted":
          return applyUpdate(targetedUpdateRequest({ source: SHARED_MEMBER.fqn }));
        case "type-group":
          return typeGroupSkillUpdate(SHARED_MEMBER.name);
      }
    };

    it.effect.each(DECLARATION_SPELLINGS)(
      "advances a %s direct pin to the pin, not the newest version every Pack admits",
      (spelling) =>
        Effect.gen(function* () {
          const workspace = yield* acceptedThenRepinned(SHARED_MEMBER_PIN.inside, spelling);
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

    if (route === "targeted") {
      it.effect(
        "a direct pin moved to a different Registry after planning commits nothing and is reported stale",
        () =>
          Effect.gen(function* () {
            const workspace = yield* acceptedThenRepinned(SHARED_MEMBER_PIN.inside);
            const mirror = makeFileRegistry();
            cleanups.push(mirror.cleanup);
            const settings = readSettings(workspace);
            const configuredSources = Array.isArray(settings["sources"]) ? settings["sources"] : [];
            const writeSettings = (declared: string) =>
              workspace.writeFile(
                "axm.json",
                `${JSON.stringify(
                  {
                    ...settings,
                    sources: [...configuredSources, { ...mirror.source, name: "mirror" }],
                    skills: { [SHARED_MEMBER.name]: declared },
                  },
                  null,
                  2,
                )}\n`,
              );
            const pinned = `${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`;
            writeSettings(pinned);
            const lockBefore = workspace.readFile("axm-lock.yaml");

            const resolution = yield* workspace.provide(
              Effect.gen(function* () {
                const candidate = yield* UpdateExtensions.prepare(
                  targetedUpdateRequest({ source: SHARED_MEMBER.fqn }),
                );
                if (candidate.outcome === "nothing-configured") {
                  throw new Error("Expected a planned targeted update");
                }
                // The same FQN, now bound to another configured Registry.
                writeSettings(`mirror:${pinned}`);
                return yield* UpdateExtensions.previewOrApply(candidate, preapprovedPlanExecution);
              }),
            );

            expect(countUnitStates(resolution.units).committed).toBe(0);
            expect(resolution.blocking?.class).toBe("stale-candidate");
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
          }).pipe(Effect.provide(NodeServices.layer)),
      );
    }

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
