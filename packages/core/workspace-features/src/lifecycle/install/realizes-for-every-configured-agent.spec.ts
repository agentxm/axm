import { gitPackagePath } from "../../testing/install-world.js";
import { execFileSync } from "node:child_process";
import * as os from "node:os";
import { serveBareRepository } from "../../testing/git-repositories.js";
import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { localLifecycleRows } from "./test-helpers.js";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import {
  deriveOperationOutcome,
  operationNativeLocations,
} from "@agentxm/workspace-kernel/operations";
import {
  previewInstall,
  applyInstall,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/install/realizes-for-every-configured-agent",
  title: "Install realizes the extension for every configured agent",
  statement:
    "When an acquirable extension is installed, AXM shall realize it on every native surface supported for that extension type by the configured agents and on its declared shared surfaces, shall report those physical units before first acquisition without claiming current ownership, and shall report the realized units after apply, as permitted by the workspace's activation and instruction settings.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "extension-adoption"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the shared Skill policy location.",
  ],
  openQuestions: [],
});

const SKILL = "code-review";
const REALIZED_LOCATIONS = [
  `.agents/skills/${SKILL}`,
  `.claude/skills/${SKILL}`,
  `.cursor/skills/${SKILL}`,
];

describe("Install realizes the extension for configured agents", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("realizes the extension for every configured agent", () => {
    const { workspace, cleanup } = makeInstallWorld({
      settings: { agents: ["claude-code", "cursor"] },
    });
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: SKILL });
    for (const location of REALIZED_LOCATIONS) {
      expect(workspace.exists(location), location).toBe(false);
    }
    return workspace
      .provide(
        Effect.gen(function* () {
          const request = installRequest({ type: "skill", subject: { kind: "source", source } });
          const preview = yield* previewInstall(request);
          const proposed = operationNativeLocations(preview);
          expect(proposed).toHaveLength(3);
          expect(
            proposed.every((unit) => unit.state === "created" && unit.ownership === "absent"),
          ).toBe(true);
          for (const location of REALIZED_LOCATIONS) expect(workspace.exists(location)).toBe(false);
          const applied = yield* applyInstall(request);
          expect(
            operationNativeLocations(applied)
              .map((unit) => unit.address.path)
              .sort(),
          ).toEqual(proposed.map((unit) => unit.address.path).sort());

          for (const location of REALIZED_LOCATIONS) {
            expect(workspace.readFile(`${location}/SKILL.md`), location).toBe(
              workspace.readFile(`vendor/${SKILL}/src/SKILL.md`),
            );
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  const copyPlatform = Layer.provideMerge(
    Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (filesystem) => ({
        ...filesystem,
        symlink: (_from: string, to: string) =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "symlink",
              pathOrDescriptor: to,
              description: "Exercise the instruction owner copy fallback.",
            }),
          ),
      })),
    ),
    NodeServices.layer,
  );

  for (const row of localLifecycleRows.filter(
    ({ type }) => type === "rule" || type === "knowledge",
  )) {
    for (const mechanism of ["symlink", "copy"] as const)
      it.effect(
        `previews the new Claude instruction ${mechanism} for a ${row.label} before acquisition`,
        () => {
          const { workspace, cleanup } = makeInstallWorld({
            settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
          });
          cleanups.push(cleanup);
          const name = `proposed-${row.label}`;
          const source = row.writePackage(workspace.root, { name });
          // A discovered nested source must not hide the prospective root source.
          fs.mkdirSync(path.join(workspace.root, "docs"));
          fs.writeFileSync(path.join(workspace.root, "docs", "AGENTS.md"), "Nested guidance\n");
          const before = workspace.snapshot();
          return workspace
            .provide(
              Effect.gen(function* () {
                const request = installRequest({
                  type: row.type,
                  subject: { kind: "source", source },
                });
                const preview = yield* previewInstall(request);
                expect(deriveOperationOutcome(preview)).toBe("previewed");
                expect(workspace.snapshot()).toEqual(before);
                expect(workspace.exists("AGENTS.md")).toBe(false);
                expect(workspace.exists("CLAUDE.md")).toBe(false);
                const region = operationNativeLocations(preview).find(
                  (unit) =>
                    unit.address.kind === "region" &&
                    unit.address.region === (row.type === "rule" ? "rules" : "knowledge"),
                );
                if (mechanism === "symlink") {
                  expect(region).toMatchObject({
                    state: "created",
                    configuredConsumers: ["claude-code"],
                    aliases: expect.arrayContaining([path.join(workspace.root, "CLAUDE.md")]),
                  });
                } else {
                  expect(region?.configuredConsumers).not.toContain("claude-code");
                  expect(region?.aliases).not.toContain(path.join(workspace.root, "CLAUDE.md"));
                  expect(operationNativeLocations(preview)).toContainEqual(
                    expect.objectContaining({
                      address: { kind: "entry", path: path.join(workspace.root, "CLAUDE.md") },
                      state: "created",
                      ownership: "absent",
                      mechanism: "generated-file",
                      configuredConsumers: ["claude-code"],
                    }),
                  );
                }
                const outcome = preview.units
                  .flatMap((unit) => unit.artifact?.agentOutcomes ?? [])
                  .find(
                    (item) =>
                      item.extensionType === row.type &&
                      item.name === name &&
                      item.agentId === "claude-code",
                  );
                expect(outcome).toMatchObject({
                  outcome: "projected",
                  reasonCode: "planned-native-unit",
                });
                expect(outcome?.nativeUnits).toHaveLength(1);
                const applied = yield* applyInstall(request);
                expect(deriveOperationOutcome(applied)).toBe("applied");
                expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(
                  mechanism === "symlink",
                );
                expect(workspace.readFile("CLAUDE.md")).toContain(workspace.readFile("AGENTS.md"));
              }),
            )
            .pipe(Effect.provide(mechanism === "copy" ? copyPlatform : NodeServices.layer));
        },
      );

    it.effect(`does not omit a missing alias for an already-current ${row.label} region`, () => {
      const { workspace, cleanup } = makeInstallWorld({
        settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
      });
      cleanups.push(cleanup);
      const name = `current-${row.label}`;
      const source = row.writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            const request = installRequest({ type: row.type, subject: { kind: "source", source } });
            const initial = yield* applyInstall(request);
            expect(deriveOperationOutcome(initial)).toBe("applied");
            expect(workspace.exists("CLAUDE.md")).toBe(true);
            const instructions = workspace.readFile("AGENTS.md");
            const accepted = workspace.readFile("axm-lock.yaml");
            fs.unlinkSync(path.join(workspace.root, "CLAUDE.md"));
            const before = workspace.snapshot();
            const inventory = yield* (yield* WorkspaceRecords).getExtensionInventory(row.type, {});
            const observed = inventory.items.find((item) => item.name === name);
            expect(observed?.agentOutcomes).toContainEqual(
              expect.objectContaining({
                agentId: "claude-code",
                outcome: "blocked",
                reasonCode: "native-projection-not-current",
              }),
            );
            expect(observed?.nativeLocations).toContainEqual(
              expect.objectContaining({
                address: { kind: "entry", path: path.join(workspace.root, "CLAUDE.md") },
                ownership: "absent",
                state: "absent",
                configuredConsumers: ["claude-code"],
                policyReasons: ["instruction-propagation"],
              }),
            );
            expect(workspace.snapshot()).toEqual(before);

            const preview = yield* previewInstall(request).pipe(Effect.result);
            const afterPreview = workspace.snapshot();
            const applied = yield* applyInstall(request).pipe(Effect.result);
            expect(afterPreview).toEqual(before);
            expect(applied._tag).toBe(preview._tag);
            if (preview._tag === "Failure") {
              expect(preview.failure).toMatchObject({
                _tag: "ExtensionLifecycleFailed",
                category: "conflict",
                cause: {
                  _tag: "InstructionMaintenanceFailed",
                  detail: expect.stringContaining("CLAUDE.md"),
                },
              });
            } else {
              expect(deriveOperationOutcome(preview.success)).toBe("previewed");
              const planned = preview.success.units
                .flatMap((unit) => unit.artifact?.agentOutcomes ?? [])
                .find(
                  (outcome) =>
                    outcome.extensionType === row.type &&
                    outcome.name === name &&
                    outcome.agentId === "claude-code",
                );
              expect(planned).toMatchObject({ outcome: "projected" });
              expect(planned?.nativeUnits?.length).toBeGreaterThan(0);
            }
            if (applied._tag === "Failure") {
              expect(applied.failure).toMatchObject({
                _tag: "ExtensionLifecycleFailed",
                category: "conflict",
                cause: {
                  _tag: "InstructionMaintenanceFailed",
                  detail: expect.stringContaining("CLAUDE.md"),
                },
              });
              expect(workspace.snapshot()).toEqual(before);
              expect(workspace.exists("CLAUDE.md")).toBe(false);
            } else {
              expect(deriveOperationOutcome(applied.success)).toBe("applied");
              expect(workspace.exists("CLAUDE.md")).toBe(true);
              expect(workspace.readFile("CLAUDE.md")).toContain(instructions);
            }
            expect(workspace.readFile("AGENTS.md")).toBe(instructions);
            expect(workspace.readFile("axm-lock.yaml")).toBe(accepted);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

    for (const obstruction of [
      "foreign file",
      "different target",
      "malformed copy marker",
    ] as const) {
      it.effect(`refuses a ${obstruction} at the proposed ${row.label} instruction alias`, () => {
        const { workspace, cleanup } = makeInstallWorld({
          settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
        });
        cleanups.push(cleanup);
        const source = row.writePackage(workspace.root, { name: `blocked-${row.label}` });
        const alias = path.join(workspace.root, "CLAUDE.md");
        if (obstruction === "different target") {
          fs.writeFileSync(path.join(workspace.root, "OTHER.md"), "Foreign instructions\n");
          fs.symlinkSync("OTHER.md", alias);
        } else {
          fs.writeFileSync(
            alias,
            obstruction === "foreign file"
              ? "Foreign instructions\n"
              : "<!-- axm:file v=1 ext=@agentxm/instructions/alias src=AGENTS.md src=OTHER.md -->\nForeign instructions\n",
          );
        }
        const before = workspace.snapshot();
        return workspace
          .provide(
            Effect.gen(function* () {
              const request = installRequest({
                type: row.type,
                subject: { kind: "source", source },
              });
              const preview = yield* previewInstall(request).pipe(Effect.result);
              expect(preview._tag).toBe("Failure");
              expect(workspace.snapshot()).toEqual(before);
              const apply = yield* applyInstall(request).pipe(Effect.result);
              expect(apply._tag).toBe("Failure");
              expect(workspace.snapshot()).toEqual(before);
              expect(workspace.exists("agent_extensions")).toBe(false);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      });
    }
  }

  it.effect.each(localLifecycleRows)(
    "realizes the applicable agent surfaces for a local $label",
    ({ type, label, writePackage, expectRealized }) => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const name = `conformance-${label}`;
      const source = writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));

            expectRealized(workspace, name);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});

for (const scope of ["project", "user"] as const)
  it.effect(
    `retains complete native-only Git packages in ${scope} scope`,
    () =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld({ scope, settings: { agents: ["codex"] } })),
          (value) => Effect.sync(value.cleanup),
        );
        const root = yield* Effect.acquireRelease(
          Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm-native-git-"))),
          (value) => Effect.sync(() => fs.rmSync(value, { recursive: true, force: true })),
        );
        const source = path.join(root, "source");
        fs.mkdirSync(path.join(source, "native"), { recursive: true });
        fs.writeFileSync(
          path.join(source, "subagent.json"),
          JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "reviewer",
            version: "1.0.0",
            implementations: { codex: { kind: "native", source: "native/review.toml" } },
          }),
        );
        const native =
          'name = "investigator"\ndescription = "Review"\ndeveloper_instructions = "Inspect evidence"\n';
        fs.writeFileSync(path.join(source, "native/review.toml"), native);
        fs.writeFileSync(path.join(source, "LICENSE"), "Fixture license.\n");
        for (const args of [
          ["init", "--quiet", "--initial-branch=main"],
          ["config", "user.email", "test@example.com"],
          ["config", "user.name", "Test"],
          ["add", "."],
          ["commit", "--quiet", "-m", "fixture"],
        ])
          execFileSync("git", args, { cwd: source });
        const repository = yield* Effect.acquireRelease(
          Effect.promise(() => serveBareRepository({ root, source, name: "native" })),
          (value) => Effect.sync(value.stop),
        );
        yield* world.workspace.provide(
          Effect.gen(function* () {
            const resolution = yield* applyInstall(
              installRequest({
                type: "subagent",
                subject: { kind: "source", source: repository.url },
              }),
            );
            expect(deriveOperationOutcome(resolution), JSON.stringify(resolution)).toBe("applied");
            const canonical = path.join(
              world.workspace.workspaceRoot,
              gitPackagePath(repository.url),
            );
            expect(fs.readFileSync(path.join(canonical, "native/review.toml"), "utf8")).toBe(
              native,
            );
            expect(fs.readFileSync(path.join(canonical, "LICENSE"), "utf8")).toBe(
              "Fixture license.\n",
            );
            const nativeRoot = scope === "project" ? world.workspace.root : world.workspace.home;
            expect(
              fs.readFileSync(path.join(nativeRoot, ".codex/agents/investigator.toml"), "utf8"),
            ).toContain(native);
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    { timeout: 90_000 },
  );
