import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

import {
  deriveOperationOutcome,
  previewPlanExecution,
  type OperationResolution,
} from "../../../transitions/planning/index.js";
import { preapprovedPlanExecution } from "../../../transitions/planning/testing.js";
import {
  AcceptedResolutionWriter,
  LockfileWriteError,
  computeMaterializedTreeIntegrity,
} from "../../../desired-state/index.js";
import { CodingAgentRepository } from "../../../projection/index.js";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../../lifecycle/install/test-helpers.js";
import { writeLocalSkillPackage } from "../../../lifecycle/testing.js";
import { exactVersion, extensionName, handle } from "../../../lifecycle/test-helpers.js";
import { SelectiveUpdate } from "../../../lifecycle/update/selective/use-case.js";
import { planSkillInstallationStep } from "./plan.js";

const NAME = "code-review";
const canonical = `agent_extensions/path/@acme/skills/${NAME}/src`;

const selectiveRequest = {
  kind: "selective-skills",
  source: Option.none<string>(),
  nameFilters: [NAME],
  nameFilterFlag: "--name",
  ignoreVersionConstraints: false,
} as const;

const prepareUpdate = () =>
  Effect.gen(function* () {
    const candidate = yield* SelectiveUpdate.prepare(selectiveRequest);
    if (candidate.outcome !== "planned") throw new Error(candidate.message);
    return candidate;
  });

const artifact = (resolution: OperationResolution) => {
  expect(deriveOperationOutcome(resolution)).toBe("applied");
  expect(resolution.units).toHaveLength(1);
  const result = resolution.units[0]?.artifact;
  if (result === undefined) throw new Error("Missing applied skill artifact");
  return result;
};

describe("skill installation application", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (settings: Readonly<Record<string, unknown>> = {}): InstallWorld => {
    const result = makeInstallWorld({ settings });
    cleanups.push(result.cleanup);
    return result;
  };

  it.effect.each([
    { agents: [], targets: [{ path: `.agents/skills/${NAME}`, change: "created" }] },
    {
      agents: ["claude-code", "cursor"],
      targets: [
        { path: `.agents/skills/${NAME}`, change: "created" },
        { path: `.claude/skills/${NAME}`, change: "created", agentIds: ["claude-code"] },
        { path: `.cursor/skills/${NAME}`, change: "created", agentIds: ["cursor"] },
      ],
    },
    {
      agents: ["antigravity", "amp", "claude-code"],
      targets: [
        { path: `.agents/skills/${NAME}`, change: "created", agentIds: ["antigravity", "amp"] },
        { path: `.claude/skills/${NAME}`, change: "created", agentIds: ["claude-code"] },
      ],
    },
  ])("reports and realizes each distinct target for $agents", ({ agents, targets }) => {
    const { workspace } = world({ agents });
    const source = writeLocalSkillPackage(workspace.root, { name: NAME });
    workspace.writeFile(`vendor/${NAME}/src/references/review.md`, "Review evidence.\n");
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = artifact(
            yield* applyInstall(installRequest({ subject: { kind: "source", source } })),
          );
          expect(result.agents).toEqual(agents);
          expect(result.targets).toEqual(targets);
          expect(result.fileCount).toBe(2);
          expect(workspace.readFile(`${canonical}/SKILL.md`)).toBe(
            workspace.readFile(`vendor/${NAME}/src/SKILL.md`),
          );
          for (const target of targets) {
            const destination = path.join(workspace.root, target.path);
            expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
            expect(fs.realpathSync(destination)).toBe(path.join(workspace.root, canonical));
            expect(workspace.readFile(`${target.path}/references/review.md`)).toBe(
              "Review evidence.\n",
            );
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports unknown configured agents while installing for supported recipients", () => {
    const { workspace } = world();
    const source = writeLocalSkillPackage(workspace.root, { name: NAME });
    return workspace
      .provide(
        Effect.gen(function* () {
          const agents = yield* CodingAgentRepository;
          const result = yield* applyInstall(
            installRequest({ subject: { kind: "source", source } }),
          ).pipe(
            Effect.provideService(CodingAgentRepository, {
              ...agents,
              getUnknownConfiguredAgentIds: () => Effect.succeed(["unknown-agent"]),
            }),
          );
          expect(artifact(result).agents).toEqual(["claude-code"]);
          expect(result.units[0]?.warnings).toContain(
            "Skipping unknown configured agents: unknown-agent",
          );
          expect(workspace.readFile(`.claude/skills/${NAME}/SKILL.md`)).toBe(
            workspace.readFile(`vendor/${NAME}/src/SKILL.md`),
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves marker-free content when symlink creation falls back to a copy", () => {
    const { workspace } = world();
    const source = writeLocalSkillPackage(workspace.root, { name: NAME });
    const copyOnly = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const platform = yield* FileSystem.FileSystem;
        return {
          ...platform,
          symlink: () =>
            Effect.fail(
              PlatformError.badArgument({
                module: "FileSystem",
                method: "symlink",
                description: "fixture disables symbolic links",
              }),
            ),
        };
      }),
    ).pipe(Layer.provideMerge(NodeServices.layer));
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = artifact(
            yield* applyInstall(installRequest({ subject: { kind: "source", source } })),
          );
          expect(result.agents).toEqual(["claude-code"]);
          for (const directory of [`.agents/skills/${NAME}`, `.claude/skills/${NAME}`]) {
            expect(fs.lstatSync(path.join(workspace.root, directory)).isSymbolicLink()).toBe(false);
            expect(workspace.readFile(`${directory}/SKILL.md`)).toBe(
              workspace.readFile(`vendor/${NAME}/src/SKILL.md`),
            );
          }
        }),
      )
      .pipe(Effect.provide(copyOnly));
  });

  it.effect(
    "rejects incompatible reused official skill bytes before altering the workspace",
    () => {
      const { workspace, registry } = world();
      const packagePath = "agent_extensions/registry/@agentxm/skills/axm";
      workspace.writeFile(
        `${packagePath}/skill.json`,
        JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "1.0.0" }),
      );
      workspace.writeFile(`${packagePath}/src/SKILL.md`, "# axm\n");
      workspace.writeFile(`${packagePath}/src/preserve.md`, "Preserve existing content.\n");
      return workspace
        .provide(
          Effect.gen(function* () {
            const treeIntegrity = yield* computeMaterializedTreeIntegrity(
              path.join(workspace.root, packagePath),
            );
            const writer = yield* AcceptedResolutionWriter;
            yield* writer.setAccepted("skill", "axm", {
              source: { type: "registry", url: new URL(registry.source.location) },
              identity: { owner: handle("@agentxm"), name: extensionName("axm") },
              resolved: {
                version: exactVersion("1.0.0"),
                integrity: "sha512-fixture",
                publisherBindingId: "hbnd_test",
              },
              treeIntegrity,
            });
            const before = workspace.snapshot();
            const step = yield* planSkillInstallationStep({
              operation: "install",
              force: false,
              versionRange: Option.none(),
              ref: {
                type: "skill",
                refType: "registry",
                name: extensionName("axm"),
                owner: handle("@agentxm"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
                source: {
                  type: "registry",
                  name: registry.source.name,
                  location: new URL(registry.source.location),
                  owner: Option.none(),
                },
                skill: {
                  name: extensionName("axm"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
              },
            });
            if (step.readiness === "error") throw new Error(step.errorMessage);
            const failure = yield* Effect.flip(step.run);
            expect(failure.cause).toMatchObject({ _tag: "AxmSkillIncompatible" });
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "selective update previews without writes, preserves intent, and reports the updated artifact",
    () => {
      const { workspace } = world();
      const source = writeLocalSkillPackage(workspace.root, { name: NAME });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ subject: { kind: "source", source } }));
            const settings = workspace.readFile("axm.json");
            const changed = `${workspace.readFile(`vendor/${NAME}/src/SKILL.md`)}\nNew review policy.\n`;
            workspace.writeFile(`vendor/${NAME}/src/SKILL.md`, changed);
            const before = workspace.snapshot();
            const candidate = yield* prepareUpdate();
            const preview = yield* SelectiveUpdate.previewOrApply(candidate, previewPlanExecution);
            expect(deriveOperationOutcome(preview)).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);

            const result = artifact(
              yield* SelectiveUpdate.previewOrApply(candidate, preapprovedPlanExecution),
            );
            expect(result.change).toBe("updated");
            expect(result.agents).toEqual(["claude-code"]);
            expect(result.targets?.map((target) => target.path)).toEqual([
              `.agents/skills/${NAME}`,
              `.claude/skills/${NAME}`,
            ]);
            expect(workspace.readFile("axm.json")).toBe(settings);
            expect(workspace.readFile(`${canonical}/SKILL.md`)).toBe(changed);
            expect(workspace.readFile(`.claude/skills/${NAME}/SKILL.md`)).toBe(changed);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "rolls back canonical content, projections and accepted state if recording an update fails",
    () => {
      const { workspace } = world();
      const source = writeLocalSkillPackage(workspace.root, { name: NAME });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ subject: { kind: "source", source } }));
            workspace.writeFile(
              `vendor/${NAME}/src/SKILL.md`,
              `${workspace.readFile(`vendor/${NAME}/src/SKILL.md`)}\nUncommitted policy.\n`,
            );
            const before = workspace.snapshot();
            const candidate = yield* prepareUpdate();
            const writer = yield* AcceptedResolutionWriter;
            let attempted = false;
            const failed = yield* SelectiveUpdate.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            ).pipe(
              Effect.provideService(AcceptedResolutionWriter, {
                ...writer,
                setAccepted: () =>
                  Effect.gen(function* () {
                    attempted = true;
                    expect(workspace.readFile(`${canonical}/SKILL.md`)).toContain(
                      "Uncommitted policy.",
                    );
                    return yield* new LockfileWriteError({
                      path: path.join(workspace.root, "axm-lock.yaml"),
                      step: "write-temp",
                      cause: "injected accepted-resolution failure",
                    });
                  }),
              }),
            );
            expect(attempted).toBe(true);
            expect(deriveOperationOutcome(failed)).toBe("failed");
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each([
    { constraint: "", suffix: "" },
    { constraint: "^1.0.0", suffix: "@^1.0.0" },
    { constraint: "1.2.3", suffix: "@1.2.3" },
  ])(
    "records the requested Registry constraint $constraint and publisher identity",
    ({ suffix }) => {
      const { workspace, registry } = world();
      registry.writeSkill(NAME, [{ version: "1.2.3", body: "Published review policy." }]);
      return workspace
        .provide(
          Effect.gen(function* () {
            const result = artifact(
              yield* applyInstall(
                installRequest({
                  subject: { kind: "source", source: `@acme/skills/${NAME}${suffix}` },
                }),
              ),
            );
            expect(result.version).toBe("1.2.3");
            expect(workspace.readFile("axm.json")).toContain(`@acme/skills/${NAME}${suffix}`);
            const lock = workspace.readFile("axm-lock.yaml");
            expect(lock).toContain("version: 1.2.3");
            expect(lock).toContain("publisherBindingId:");
            expect(
              workspace.readFile(`agent_extensions/registry/@acme/skills/${NAME}/src/SKILL.md`),
            ).toBe(workspace.readFile(`.claude/skills/${NAME}/SKILL.md`));
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
