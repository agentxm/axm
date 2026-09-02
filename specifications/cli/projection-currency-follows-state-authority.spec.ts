import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/projection-currency-follows-state-authority",
  title: "Generated document currency follows authoritative inputs, not rendered bytes",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table", "example"],
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
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      const reconciled = workspace.readFile("AGENTS.md");
      expect(reconciled).not.toBe(withoutGeneration);
      expect(reconciled).toContain("First authoritative guidance.");

      writeAuthoredRule(workspace.root, "Second authoritative guidance.\n");
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

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(fs.readFileSync(projectionPath, "utf8")).toBe(rewritten);

      writeAuthoredSubagent(workspace.root, "Second reviewer guidance.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      const updated = fs.readFileSync(projectionPath, "utf8");
      expect(updated).toContain("Second reviewer guidance.");
      expect(updated).not.toContain("Repository-formatted body.");
    }),
  );
});
