import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  writeAuthoredRule,
  type SyncFixture,
  type SyncOutcome,
} from "./test-helpers.js";

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
    "packages/core/workspace-configuration/src/instructions/instruction-copy-currency.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The supporting lint cross-check — that a rewritten managed body produces no `workspace/projection-ownership-valid` finding — is not exercised here: a reconciliation cannot import the lint feature, and lint cannot produce a validly generated document without running one. The reconciliation side of the same fact is exercised: the rewritten body is reported as nothing to reconcile.",
      retirementCondition:
        "`@agentxm/workspace-lint` gains a test that runs its ownership rule over a generated document whose body was rewritten and whose marker and generation record are intact.",
    },
    {
      limitation:
        "The instruction-copy currency rows run beside the instruction-management use case that owns them, in `packages/core/workspace-configuration/src/instructions/instruction-copy-currency.test.ts`; a reconciliation cannot reach that feature. They establish copy currency on a host filesystem with symlink creation refused, not Windows permissions, native symlink probing, or Windows filesystem behavior; the dedicated Windows instruction suite supplies that evidence separately.",
      retirementCondition:
        "Retain the same instruction-copy currency observations through real symlink-unavailable environments on each supported platform, alongside separately attributable Windows execution.",
    },
  ],
});

const AUTHORED_SUBAGENT = "reviewer";

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
    })}\n`,
  );
  fs.writeFileSync(
    nodePath.join(packageRoot, "src", `${AUTHORED_SUBAGENT}.md`),
    `---\nname: ${AUTHORED_SUBAGENT}\ndescription: The ${AUTHORED_SUBAGENT} subagent.\n---\n\n${body}\n`,
  );
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

  it.effect("preserves arbitrary body rewrites while authoritative inputs are unchanged", () => {
    const workspace = ruleWorkspace();
    cleanups.push(workspace.cleanup);
    writeAuthoredRule(workspace.root, "review", "Review every change carefully.");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          const generated = workspace.readFile("AGENTS.md");
          expect(generated).toMatch(/axm:start v=1 region=rules ext=[^ ]+ gen=[0-9a-f]{64}/u);
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
  });

  it.effect("restores a missing generation record once", () => {
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
  });

  it.effect("regenerates after an authoritative source change once", () => {
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
  });

  it.effect("applies the same opaque-body contract to managed Subagent documents", () => {
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
  });

  it.effect("applies the same opaque-body contract to Subagent role-skill fallbacks", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["cline"],
        subagents: { [AUTHORED_SUBAGENT]: "workspace" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSubagent(workspace.root, "First reviewer guidance.");
    const projection = `.cline/skills/${AUTHORED_SUBAGENT}/SKILL.md`;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          const generated = workspace.readFile(projection);
          expect(generated).toMatch(/axm:file v=1 ext=[^ ]+ src=[^ ]+ gen=[0-9a-f]{64}/u);
          const rewritten = generated.replace(
            "First reviewer guidance.",
            "Repository-formatted role body.",
          );
          expect(rewritten).not.toBe(generated);
          workspace.writeFile(projection, rewritten);

          expectNothingToReconcile(yield* previewSync());
          expect(workspace.readFile(projection)).toBe(rewritten);

          expectNothingToReconcile(yield* applySync());
          expect(workspace.readFile(projection)).toBe(rewritten);
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
  );
});
