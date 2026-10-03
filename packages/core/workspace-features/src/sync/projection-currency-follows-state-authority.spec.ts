import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import {
  deriveOperationOutcome,
  operationNativeLocations,
} from "@agentxm/workspace-kernel/operations";

import { writeLocalHookPackage } from "../testing/local-packages.js";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  writeAuthoredRule,
  writeAuthoredKnowledge,
  type SyncFixture,
  type SyncOutcome,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/projection-currency-follows-state-authority",
  title: "Generated document currency follows authoritative inputs, not rendered bytes",
  statement:
    "Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged and regenerating when inputs change or the generated document is missing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity", "agent-interoperability"],
  boundary: "memory",
  boundaryRationale:
    "Reconciliation is what judges currency; running it over a real workspace shows exactly which bytes it leaves alone and which it regenerates.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/core/workspace-features/src/configuration/instructions/instruction-copy-currency.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The supporting lint cross-check — that a rewritten managed body produces no `workspace/projection-ownership-valid` finding — is not exercised here: a reconciliation cannot import the lint feature, and lint cannot produce a validly generated document without running one. The reconciliation side of the same fact is exercised: the rewritten body is reported as nothing to reconcile.",
      retirementCondition:
        "`@agentxm/workspace-features/linting` gains a test that runs its ownership rule over a generated document whose body was rewritten and whose marker and generation record are intact.",
    },
    {
      limitation:
        "The direct instruction-management copy rows run beside their owner in `packages/core/workspace-features/src/configuration/instructions/instruction-copy-currency.test.ts`. The authored Rule/Knowledge rows here cover contributor currency, read-only inventory, and sync recovery; the Rule row also checks declared dependent-copy updates, while initial Rule/Knowledge/Hook-fallback previews and Rule withdrawal exercise prospective sources and retained authored prose. Unrelated nested copies remain unchanged. These fixtures inject symlink-creation refusal; they do not establish Windows permissions, native symlink probing, or Windows filesystem behavior. The dedicated Windows instruction suite supplies that evidence separately.",
      retirementCondition:
        "Retain the same instruction-copy currency observations through real symlink-unavailable environments on each supported platform, alongside separately attributable Windows execution.",
    },
  ],
});

const AUTHORED_SUBAGENT = "reviewer";
const FIXTURE_TIMEOUT = 20_000;

const writeAuthoredSubagent = (workspaceRoot: string, body: string): void => {
  const packageRoot = nodePath.join(workspaceRoot, "subagents", AUTHORED_SUBAGENT);
  fs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(packageRoot, "subagent.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/subagent.schema.json",
      owner: "@acme",
      type: "subagent",
      name: AUTHORED_SUBAGENT,
      version: "1.0.0",
      description: `The ${AUTHORED_SUBAGENT} subagent.`,
      core: { instructions: `src/${AUTHORED_SUBAGENT}.md` },
    })}\n`,
  );
  fs.writeFileSync(nodePath.join(packageRoot, "src", `${AUTHORED_SUBAGENT}.md`), `${body}\n`);
};

const replaceRegionBody = (content: string, body: string): string => {
  const lines = content.split("\n");
  const start = lines.findIndex(
    (line) => line.includes("axm:start") && line.includes("region=rules"),
  );
  const end = lines.findIndex((line) => line.includes("axm:end") && line.includes("region=rules"));
  if (start < 0 || end <= start) throw new Error("Expected a complete managed Rules region");
  return [...lines.slice(0, start + 1), body, ...lines.slice(end)].join("\n");
};

/**
 * A reconciliation that found nothing to do. It is the feature-level fact the
 * `--fail-on-change` preview reports as "no change": the generated document is
 * current by its inputs, whatever its rendered bytes now say.
 */
const expectNothingToReconcile = (outcome: SyncOutcome): void => {
  expect(outcome._tag).toBe("AlreadyReconciled");
};

/** A reconciliation that found work: the generated document is not current. */
const expectReconciliationPlanned = (outcome: SyncOutcome): void => {
  const resolution = expectResolved(outcome);
  expect(resolution.units.length).toBeGreaterThan(0);
};

const ruleWorkspace = (): SyncFixture =>
  makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: [],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      rules: { review: "workspace" },
    },
  });

describe("Generated document projection currency", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
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

  for (const row of [
    { type: "rule", settingsKey: "rules", write: writeAuthoredRule },
    { type: "knowledge", settingsKey: "knowledge", write: writeAuthoredKnowledge },
  ] as const) {
    it.effect(
      `blocks an owned instruction copy while authored ${row.type} content is stale`,
      () => {
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
            [row.settingsKey]: { review: { source: "workspace" } },
          },
        });
        cleanups.push(workspace.cleanup);
        row.write(workspace.root, "review", "Initial authoritative guidance.");
        workspace.writeFile("docs/AGENTS.md", "Unrelated nested guidance.\n");
        return workspace
          .provide(
            Effect.gen(function* () {
              const beforeInitial = workspace.snapshot();
              const planned = expectResolved(yield* previewSync());
              expect(operationNativeLocations(planned)).toContainEqual(
                expect.objectContaining({
                  address: { kind: "entry", path: nodePath.join(workspace.root, "CLAUDE.md") },
                  ownership: "absent",
                  state: "created",
                  configuredConsumers: ["claude-code"],
                }),
              );
              expect(workspace.snapshot()).toEqual(beforeInitial);
              expect(workspace.exists("AGENTS.md")).toBe(false);
              expect(workspace.exists("CLAUDE.md")).toBe(false);
              const initial = expectResolved(yield* applySync());
              expect(deriveOperationOutcome(initial)).toBe("applied");
              const records = yield* WorkspaceRecords;
              const before = (yield* records.getExtensionInventory(row.type, {})).items.find(
                (item) => item.name === "review",
              );
              expect(before?.agentOutcomes).toContainEqual(
                expect.objectContaining({
                  agentId: "claude-code",
                  outcome: "current",
                }),
              );
              const aliasPath = nodePath.join(workspace.root, "CLAUDE.md");
              expect(fs.lstatSync(aliasPath).isSymbolicLink()).toBe(false);
              const instructions = workspace.readFile("AGENTS.md");
              const copy = workspace.readFile("CLAUDE.md");
              const nestedCopy = workspace.readFile("docs/CLAUDE.md");
              expect(copy).toContain(instructions);
              expect(before?.nativeLocations).toContainEqual(
                expect.objectContaining({
                  address: { kind: "entry", path: aliasPath },
                  ownership: "owned",
                  state: "unchanged",
                  proof: "exact-instruction-copy-banner",
                  configuredConsumers: ["claude-code"],
                }),
              );

              row.write(workspace.root, "review", "Revised authoritative guidance.");
              const afterSourceEdit = workspace.snapshot();
              const stale = (yield* records.getExtensionInventory(row.type, {})).items.find(
                (item) => item.name === "review",
              );
              expect(stale?.agentOutcomes).toContainEqual(
                expect.objectContaining({
                  agentId: "claude-code",
                  outcome: "blocked",
                  reasonCode: "native-projection-not-current",
                }),
              );
              expect(stale?.nativeLocations).toContainEqual(
                expect.objectContaining({
                  address: { kind: "entry", path: aliasPath },
                  ownership: "owned",
                  state: "blocked",
                  proof: "exact-instruction-copy-banner",
                  configuredConsumers: ["claude-code"],
                }),
              );
              expect(workspace.readFile("AGENTS.md")).toBe(instructions);
              expect(workspace.readFile("CLAUDE.md")).toBe(copy);
              expect(workspace.snapshot()).toEqual(afterSourceEdit);

              if (row.type === "rule") {
                const proposed = expectResolved(yield* previewSync());
                expect(operationNativeLocations(proposed)).toContainEqual(
                  expect.objectContaining({
                    address: { kind: "entry", path: aliasPath },
                    ownership: "owned",
                    state: "updated",
                    proof: "exact-instruction-copy-banner",
                    configuredConsumers: ["claude-code"],
                  }),
                );
                expect(operationNativeLocations(proposed)).toContainEqual(
                  expect.objectContaining({
                    address: {
                      kind: "entry",
                      path: nodePath.join(workspace.root, "docs", "CLAUDE.md"),
                    },
                    ownership: "owned",
                    state: "unchanged",
                    proof: "exact-instruction-copy-banner",
                  }),
                );
                expect(workspace.snapshot()).toEqual(afterSourceEdit);
              }
              const recovered = expectResolved(yield* applySync());
              expect(
                recovered.failure ??
                  recovered.units.find((unit) => unit.error !== undefined)?.error,
              ).toBeUndefined();
              expect(deriveOperationOutcome(recovered)).toBe("applied");
              expect(workspace.readFile("AGENTS.md")).toContain("Revised authoritative guidance.");
              expect(workspace.readFile("CLAUDE.md")).toContain(workspace.readFile("AGENTS.md"));
              const current = (yield* records.getExtensionInventory(row.type, {})).items.find(
                (item) => item.name === "review",
              );
              expect(current?.agentOutcomes).toContainEqual(
                expect.objectContaining({
                  agentId: "claude-code",
                  outcome: "current",
                }),
              );
              expect(current?.nativeLocations).toContainEqual(
                expect.objectContaining({
                  address: { kind: "entry", path: aliasPath },
                  ownership: "owned",
                  state: "unchanged",
                  proof: "exact-instruction-copy-banner",
                  configuredConsumers: ["claude-code"],
                }),
              );
              expect(workspace.readFile("docs/CLAUDE.md")).toBe(nestedCopy);
              expectNothingToReconcile(yield* applySync());
            }),
          )
          .pipe(Effect.provide(copyPlatform));
      },
      { timeout: FIXTURE_TIMEOUT },
    );
  }

  it.effect(
    "projects native Hooks without inventing a root instruction source beside nested guidance",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          hooks: { review: "./vendor/review" },
        },
        files: { "docs/AGENTS.md": "Unrelated nested guidance.\n" },
      });
      cleanups.push(workspace.cleanup);
      writeLocalHookPackage(workspace.root, { name: "review" });
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const planned = expectResolved(yield* previewSync());
            expect(
              operationNativeLocations(planned).some(
                (unit) =>
                  unit.address.path === nodePath.join(workspace.root, "AGENTS.md") &&
                  (unit.state === "created" || unit.state === "updated"),
              ),
            ).toBe(false);
            expect(workspace.snapshot()).toEqual(before);
            const applied = expectResolved(yield* applySync());
            expect(
              applied.failure ?? applied.units.find((unit) => unit.error !== undefined)?.error,
            ).toBeUndefined();
            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.readFile(".claude/settings.json")).toContain("PreToolUse");
            expect(workspace.exists("AGENTS.md")).toBe(false);
            expect(workspace.exists("CLAUDE.md")).toBe(false);
            expect(workspace.readFile("docs/AGENTS.md")).toBe("Unrelated nested guidance.\n");
            expect(workspace.readFile("docs/CLAUDE.md")).toContain("Unrelated nested guidance.");
          }),
        )
        .pipe(Effect.provide(copyPlatform));
    },
    // This full preview-plus-apply filesystem scenario measured 25 seconds on a shared host.
    { timeout: 60_000 },
  );

  it.effect(
    "updates an instruction copy when withdrawing a Rule region from retained authored prose",
    () => {
      const authored = "# Authored guidance\n\nKeep this exact text.\n";
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { review: "workspace" },
        },
        files: { "AGENTS.md": authored },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "Contribution to remove.");
      return workspace
        .provide(
          Effect.gen(function* () {
            const initial = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(initial)).toBe("applied");
            expect(workspace.readFile("CLAUDE.md")).toContain("Contribution to remove.");
            workspace.writeSettings({
              ...workspace.readSettings(),
              rules: { review: { source: "workspace", enabled: false } },
            });
            const before = workspace.snapshot();
            const planned = expectResolved(yield* previewSync());
            expect(operationNativeLocations(planned)).toContainEqual(
              expect.objectContaining({
                address: {
                  kind: "region",
                  path: nodePath.join(workspace.root, "AGENTS.md"),
                  region: "rules",
                },
                state: "removed",
              }),
            );
            expect(operationNativeLocations(planned)).toContainEqual(
              expect.objectContaining({
                address: { kind: "entry", path: nodePath.join(workspace.root, "CLAUDE.md") },
                ownership: "owned",
                state: "updated",
                proof: "exact-instruction-copy-banner",
              }),
            );
            expect(workspace.snapshot()).toEqual(before);
            const applied = expectResolved(yield* applySync());
            expect(
              applied.failure ?? applied.units.find((unit) => unit.error !== undefined)?.error,
            ).toBeUndefined();
            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.readFile("AGENTS.md")).toBe(authored);
            expect(workspace.readFile("CLAUDE.md")).toContain(authored);
            expect(workspace.readFile("CLAUDE.md")).not.toContain("Contribution to remove.");
            expectNothingToReconcile(yield* applySync());
          }),
        )
        .pipe(Effect.provide(copyPlatform));
    },
    { timeout: FIXTURE_TIMEOUT },
  );

  it.effect(
    "preserves arbitrary body rewrites while authoritative inputs are unchanged",
    () => {
      const workspace = ruleWorkspace();
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "Review every change carefully.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();

            const generated = workspace.readFile("AGENTS.md");
            expect(generated).toMatch(
              /axm:start v=1 region=rules ext=[^ ]+ src=[^ ]+ gen=[0-9a-f]{64}/u,
            );
            const rewritten = replaceRegionBody(
              generated,
              "Repository formatter output.\n\n- Wrapped, reordered, or otherwise rewritten.",
            );
            workspace.writeFile("AGENTS.md", rewritten);

            // Currency is judged by the inputs and the generation record, so the
            // rewritten body is not a change to reconcile.
            expectNothingToReconcile(yield* previewSync());
            expect(workspace.readFile("AGENTS.md")).toBe(rewritten);

            expectNothingToReconcile(yield* applySync());
            expect(workspace.readFile("AGENTS.md")).toBe(rewritten);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: FIXTURE_TIMEOUT },
  );

  it.effect(
    "restores a missing generation record once",
    () => {
      const workspace = ruleWorkspace();
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "First authoritative guidance.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();

            const withoutGeneration = workspace
              .readFile("AGENTS.md")
              .replace(/ gen=[0-9a-f]{64}(?= -->)/u, "");
            workspace.writeFile("AGENTS.md", withoutGeneration);

            expectReconciliationPlanned(yield* previewSync());
            expect(workspace.readFile("AGENTS.md")).toBe(withoutGeneration);

            yield* applySync();
            const reconciled = workspace.readFile("AGENTS.md");
            expect(reconciled).not.toBe(withoutGeneration);
            expect(reconciled).toContain("First authoritative guidance.");

            expectNothingToReconcile(yield* applySync());
            expect(workspace.readFile("AGENTS.md")).toBe(reconciled);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: FIXTURE_TIMEOUT },
  );

  it.effect(
    "regenerates after an authoritative source change once",
    () => {
      const workspace = ruleWorkspace();
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "First authoritative guidance.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const generated = workspace.readFile("AGENTS.md");

            writeAuthoredRule(workspace.root, "review", "Second authoritative guidance.");

            expectReconciliationPlanned(yield* previewSync());
            expect(workspace.readFile("AGENTS.md")).toBe(generated);

            yield* applySync();
            const afterSourceChange = workspace.readFile("AGENTS.md");
            expect(afterSourceChange).toContain("Second authoritative guidance.");
            expect(afterSourceChange).not.toContain("First authoritative guidance.");

            expectNothingToReconcile(yield* applySync());
            expect(workspace.readFile("AGENTS.md")).toBe(afterSourceChange);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: FIXTURE_TIMEOUT },
  );

  it.effect(
    "applies the same opaque-body contract to managed Subagent documents",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          subagents: { [AUTHORED_SUBAGENT]: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSubagent(workspace.root, "First reviewer guidance.");
      const projection = `.claude/agents/${AUTHORED_SUBAGENT}.md`;
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();

            const generated = workspace.readFile(projection);
            expect(generated).toMatch(/axm:file v=1 ext=[^ ]+ src=[^ ]+ gen=[0-9a-f]{64}/u);
            const rewritten = generated.replace(
              "First reviewer guidance.",
              "Repository-formatted body.",
            );
            expect(rewritten).not.toBe(generated);
            workspace.writeFile(projection, rewritten);

            expectNothingToReconcile(yield* previewSync());
            expect(workspace.readFile(projection)).toBe(rewritten);

            expectNothingToReconcile(yield* applySync());
            expect(workspace.readFile(projection)).toBe(rewritten);

            writeAuthoredSubagent(workspace.root, "Second reviewer guidance.");
            yield* applySync();
            const updated = workspace.readFile(projection);
            expect(updated).toContain("Second reviewer guidance.");
            expect(updated).not.toContain("Repository-formatted body.");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: FIXTURE_TIMEOUT },
  );

  it.effect("leaves foreign Skills untouched while unsupported Subagents converge", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["cline"],
        subagents: { [AUTHORED_SUBAGENT]: "workspace" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSubagent(workspace.root, "Reviewer guidance.");
    const skill = `.cline/skills/${AUTHORED_SUBAGENT}/SKILL.md`;
    workspace.writeFile(skill, "Foreign Skill guidance.\n");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.readFile(skill)).toBe("Foreign Skill guidance.\n");
          expectNothingToReconcile(yield* previewSync());
          expectNothingToReconcile(yield* applySync());
          expect(workspace.readFile(skill)).toBe("Foreign Skill guidance.\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "restores a missing generated unit without treating its prior body as authority",
    () => {
      const workspace = ruleWorkspace();
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "Required guidance.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            workspace.remove("AGENTS.md");

            expectReconciliationPlanned(yield* previewSync());
            expect(workspace.exists("AGENTS.md")).toBe(false);

            yield* applySync();
            expect(workspace.readFile("AGENTS.md")).toContain("Required guidance.");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: FIXTURE_TIMEOUT },
  );
  it.effect(
    "native variants preserve edits, retire renamed outputs and converge when support is removed",
    () => {
      const native = (name: string, body: string) =>
        `---\nname: ${name}\ndescription: Review\n---\n${body}\n`;
      const manifest = (claude: boolean) =>
        JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name: "reviewer",
          version: "1.0.0",
          implementations: {
            ...(claude ? { "claude-code": { kind: "native", source: "native/claude.md" } } : {}),
            cursor: { kind: "native", source: "native/cursor.md" },
          },
        });
      const workspace = makeSyncFixture({
        settings: { owner: "@acme", agents: ["claude-code"], subagents: { reviewer: "workspace" } },
        files: {
          "subagents/reviewer/subagent.json": manifest(true),
          "subagents/reviewer/native/claude.md": native("investigator", "Selected instructions"),
          "subagents/reviewer/native/cursor.md": native("review", "Dormant instructions"),
          ".claude/agents/personal.md": "Keep this foreign agent.\n",
        },
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
            const edited = `${workspace.readFile(".claude/agents/investigator.md")}\nUser formatting.\n`;
            workspace.writeFile(".claude/agents/investigator.md", edited);
            workspace.writeFile(
              "subagents/reviewer/native/cursor.md",
              native("review", "Changed dormant instructions"),
            );
            yield* applySync();
            expect(workspace.readFile(".claude/agents/investigator.md")).toBe(edited);
            workspace.writeFile(
              "subagents/reviewer/native/claude.md",
              native("analyst", "Changed selected instructions"),
            );
            yield* applySync();
            expect(workspace.exists(".claude/agents/investigator.md")).toBe(false);
            expect(workspace.readFile(".claude/agents/analyst.md")).toContain(
              "Changed selected instructions",
            );
            workspace.writeFile("subagents/reviewer/subagent.json", manifest(false));
            yield* applySync();
            expect(workspace.exists(".claude/agents/analyst.md")).toBe(false);
            expect(workspace.readFile(".claude/agents/personal.md")).toBe(
              "Keep this foreign agent.\n",
            );
            expect(workspace.exists("subagents/reviewer/native/claude.md")).toBe(true);
            expectNothingToReconcile(yield* applySync());
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 240_000 },
  );

  for (const equivalent of [true, false])
    it.effect(
      `aliased native implementations ${equivalent ? "converge" : "refuse incompatible output before writes"}`,
      () => {
        const native = (body: string) => `---\nname: reviewer\ndescription: Review\n---\n${body}\n`;
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code", "cursor"],
            subagents: { reviewer: "workspace" },
          },
          files: {
            "subagents/reviewer/subagent.json": JSON.stringify({
              owner: "@acme",
              type: "subagent",
              name: "reviewer",
              version: "1.0.0",
              implementations: {
                "claude-code": { kind: "native", source: "native/shared.md" },
                cursor: {
                  kind: "native",
                  source: equivalent ? "native/shared.md" : "native/other.md",
                },
              },
            }),
            "subagents/reviewer/native/shared.md": native("Shared instructions"),
            "subagents/reviewer/native/other.md": native("Different instructions"),
          },
        });
        cleanups.push(workspace.cleanup);
        fs.mkdirSync(nodePath.join(workspace.root, ".claude/agents"), { recursive: true });
        fs.mkdirSync(nodePath.join(workspace.root, ".cursor"), { recursive: true });
        fs.symlinkSync(
          nodePath.join(workspace.root, ".claude/agents"),
          nodePath.join(workspace.root, ".cursor/agents"),
          "dir",
        );
        return workspace
          .provide(
            Effect.gen(function* () {
              const before = workspace.snapshot();
              const result = yield* Effect.result(applySync());
              if (equivalent) {
                expect(result._tag).toBe("Success");
                expect(workspace.readFile(".claude/agents/reviewer.md")).toContain(
                  "Shared instructions",
                );
                expectNothingToReconcile(yield* applySync());
              } else {
                expect(result._tag).toBe("Failure");
                expect(workspace.snapshot()).toEqual(before);
                expect(workspace.exists(".claude/agents/reviewer.md")).toBe(false);
              }
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
      { timeout: 90_000 },
    );
});
