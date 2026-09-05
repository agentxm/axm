import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleInstructionsEnable,
  handleLint,
  handleSync,
  LintResultDocumentSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/projection-currency-follows-state-authority",
  title: "Generated document currency follows authoritative inputs, not rendered bytes",
  statement:
    "Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged and regenerating when inputs change or the generated document is missing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The instruction-copy example injects symlink refusal at the production filesystem port while exercising real handler, copy, and currency behavior on the host filesystem. It does not establish Windows permissions, native symlink probing, or Windows filesystem behavior; the dedicated Windows instruction suite supplies that evidence separately.",
      retirementCondition:
        "Retain the same instruction-copy currency observations through real symlink-unavailable environments on each supported platform, alongside separately attributable Windows execution.",
    },
  ],
});

const writeAuthoredRule = (workspaceRoot: string, body: string): void => {
  const packageRoot = path.join(workspaceRoot, "rules", "review");
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "rule.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/rule.schema.json",
      owner: "@acme",
      type: "rule",
      name: "review",
      version: "1.0.0",
      description: "Review changes.",
    })}\n`,
  );
  fs.writeFileSync(path.join(packageRoot, "src", "RULE.md"), body);
};

const writeAuthoredSubagent = (workspaceRoot: string, body: string): void => {
  const packageRoot = path.join(workspaceRoot, "subagents", "reviewer");
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "subagent.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/subagent.schema.json",
      owner: "@acme",
      type: "subagent",
      name: "reviewer",
      version: "1.0.0",
      description: "Review changes.",
    })}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "reviewer.md"),
    `---\nname: reviewer\ndescription: Review changes.\n---\n\n${body}\n`,
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

const lintWorkspace = (root: string) =>
  handleLint({
    pathArg: Option.some(root),
    scope: "project",
    strict: false,
    details: false,
    fix: false,
    input: { view: "workspace" },
  });

const decodeLintDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

const expectReconciliationPreview = (workspace: ReturnType<typeof makeSpecWorkspace>): void => {
  expect(workspace.rendererState.results.at(-1)).toMatchObject({
    ok: false,
    data: {
      result: {
        outcome: "previewed",
        mode: "preview",
        divergence: true,
      },
    },
  });
};

describe("Generated document projection currency", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("preserves arbitrary body rewrites while authoritative inputs are unchanged", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { review: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "Review every change carefully.\n");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const generated = workspace.readFile("AGENTS.md");
      expect(generated).toMatch(/axm:start v=1 region=rules ext=[^ ]+ gen=[0-9a-f]{64}/u);
      const rewritten = replaceRegionBody(
        generated,
        "Repository formatter output.\n\n- Wrapped, reordered, or otherwise rewritten.",
      );
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), rewritten);

      const lintExit = yield* lintWorkspace(workspace.root).pipe(
        Effect.provide(workspace.layer),
        Effect.exit,
      );
      expect(Exit.isSuccess(lintExit)).toBe(true);
      const lintDocument = yield* decodeLintDocument(workspace.rendererState.results.at(-1)?.data);
      expect(lintDocument.result.findings.map(({ ruleId }) => ruleId)).not.toContain(
        "workspace/projection-ownership-valid",
      );

      const previewExit = yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
        Effect.exit,
      );
      expect(Exit.isSuccess(previewExit)).toBe(true);
      expect(workspace.readFile("AGENTS.md")).toBe(rewritten);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readFile("AGENTS.md")).toBe(rewritten);
      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        result: { outcome: "no-op" },
      });
    }),
  );

  it.effect("regenerates after source change and reconciles missing generation once", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { review: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "First authoritative guidance.\n");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const withoutGeneration = workspace
        .readFile("AGENTS.md")
        .replace(/ gen=[0-9a-f]{64}(?= -->)/u, "");
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), withoutGeneration);

      yield* handleSync({
        preview: true,
        failOnChange: true,
      }).pipe(Effect.provide(workspace.layer));
      expectReconciliationPreview(workspace);
      expect(workspace.readFile("AGENTS.md")).toBe(withoutGeneration);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      const reconciled = workspace.readFile("AGENTS.md");
      expect(reconciled).not.toBe(withoutGeneration);
      expect(reconciled).toContain("First authoritative guidance.");

      writeAuthoredRule(workspace.root, "Second authoritative guidance.\n");

      yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
      );
      expectReconciliationPreview(workspace);
      expect(workspace.readFile("AGENTS.md")).toBe(reconciled);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      const afterSourceChange = workspace.readFile("AGENTS.md");
      expect(afterSourceChange).toContain("Second authoritative guidance.");
      expect(afterSourceChange).not.toContain("First authoritative guidance.");

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile("AGENTS.md")).toBe(afterSourceChange);
      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        result: { outcome: "no-op" },
      });
    }),
  );

  it.effect("applies the same opaque-body contract to managed Subagent documents", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          subagents: { reviewer: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSubagent(workspace.root, "First reviewer guidance.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const projectionPath = path.join(workspace.root, ".claude", "agents", "reviewer.md");
      const generated = fs.readFileSync(projectionPath, "utf8");
      expect(generated).toMatch(/axm:file v=1 ext=[^ ]+ src=[^ ]+ gen=[0-9a-f]{64}/u);
      const rewritten = generated.replace("First reviewer guidance.", "Repository-formatted body.");
      fs.writeFileSync(projectionPath, rewritten);

      const previewExit = yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
        Effect.exit,
      );
      expect(Exit.isSuccess(previewExit)).toBe(true);
      expect(fs.readFileSync(projectionPath, "utf8")).toBe(rewritten);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(fs.readFileSync(projectionPath, "utf8")).toBe(rewritten);

      writeAuthoredSubagent(workspace.root, "Second reviewer guidance.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      const updated = fs.readFileSync(projectionPath, "utf8");
      expect(updated).toContain("Second reviewer guidance.");
      expect(updated).not.toContain("Repository-formatted body.");
    }),
  );

  it.effect("applies the same opaque-body contract to Subagent role-skill fallbacks", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: ["cline"],
          subagents: { reviewer: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSubagent(workspace.root, "First reviewer guidance.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const projectionPath = path.join(workspace.root, ".cline", "skills", "reviewer", "SKILL.md");
      const generated = fs.readFileSync(projectionPath, "utf8");
      expect(generated).toMatch(/axm:file v=1 ext=[^ ]+ src=[^ ]+ gen=[0-9a-f]{64}/u);
      const rewritten = generated.replace(
        "First reviewer guidance.",
        "Repository-formatted role body.",
      );
      expect(rewritten).not.toBe(generated);
      fs.writeFileSync(projectionPath, rewritten);

      yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.rendererState.results.at(-1)).toMatchObject({
        ok: true,
        data: { result: { outcome: "no-op" } },
      });
      expect(fs.readFileSync(projectionPath, "utf8")).toBe(rewritten);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(fs.readFileSync(projectionPath, "utf8")).toBe(rewritten);
    }),
  );

  it.effect("restores a missing generated unit without treating its prior body as authority", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { review: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "Required guidance.\n");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      fs.rmSync(path.join(workspace.root, "AGENTS.md"));

      yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
      );
      expectReconciliationPreview(workspace);
      expect(workspace.exists("AGENTS.md")).toBe(false);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile("AGENTS.md")).toContain("Required guidance.");
    }),
  );
  it.effect(
    "preserves rewritten instruction copies until their source changes or the copy is missing",
    () =>
      Effect.gen(function* () {
        const rejectedSymlinkTargets: Array<string> = [];
        // The platform override precedes workspace layer construction, so the
        // handler and captured transaction capabilities see the same filesystem.
        const copyFileSystemLayer = Layer.effect(
          FileSystem.FileSystem,
          Effect.map(FileSystem.FileSystem, (filesystem) => ({
            ...filesystem,
            symlink: (_fromPath: string, toPath: string) =>
              Effect.gen(function* () {
                rejectedSymlinkTargets.push(toPath);
                return yield* PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "symlink",
                  pathOrDescriptor: toPath,
                  description: "This fixture exercises instruction-copy fallback.",
                });
              }),
          })),
        );
        const workspace = makeSpecWorkspace({
          machine: true,
          settings: { agents: ["claude-code"] },
          fileSystemLayer: copyFileSystemLayer,
        });
        cleanups.push(workspace.cleanup);
        const source = path.join(workspace.root, "AGENTS.md");
        const target = path.join(workspace.root, "CLAUDE.md");
        fs.writeFileSync(source, "Initial authored instruction body.\n");

        yield* Effect.gen(function* () {
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false });
          expect(rejectedSymlinkTargets.length).toBeGreaterThan(0);
          expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
          const generated = fs.readFileSync(target, "utf8");
          expect(generated).toContain("Initial authored instruction body.");
          const rewritten = generated.replace(
            "Initial authored instruction body.",
            "Repository-formatted instruction body.",
          );
          expect(rewritten).not.toBe(generated);
          fs.writeFileSync(target, rewritten);

          yield* handleInstructionsEnable({
            fileName: "AGENTS.md",
            gitignore: false,
            preview: true,
          });
          expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
            result: { outcome: "no-op" },
          });
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false });
          expect(fs.readFileSync(target, "utf8")).toBe(rewritten);
          expect(fs.readFileSync(source, "utf8")).toBe("Initial authored instruction body.\n");

          fs.writeFileSync(source, "Revised authored instruction body.\n");
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false });
          const regenerated = fs.readFileSync(target, "utf8");
          expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
          expect(regenerated).toContain("Revised authored instruction body.");
          expect(regenerated).not.toContain("Repository-formatted instruction body.");
          expect(fs.readFileSync(source, "utf8")).toBe("Revised authored instruction body.\n");

          fs.rmSync(target);
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false });
          expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
          expect(fs.readFileSync(target, "utf8")).toBe(regenerated);
          expect(fs.readFileSync(source, "utf8")).toBe("Revised authored instruction body.\n");
        }).pipe(Effect.provide(workspace.layer));
      }),
  );
});
