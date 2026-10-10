import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";

import { LintWorkspace } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/lint/selects-explicit-workspace-root",
  title: "An explicit lint workspace selects its exact root",
  statement:
    "Lint shall use an explicit workspace as its exact root, including a nested staged workspace, select the repository root for staged lint only when the workspace is omitted, and reject an explicit workspace with user scope as usage.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "A real repository and Git index distinguish an explicitly selected nested workspace from repository-root discovery.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Lint workspace selection", () => {
  it.effect("preserves an explicit filesystem root and rejects it with user scope", () =>
    Effect.gen(function* () {
      const request = {
        path: "/workspace/nested",
        cwd: "/workspace",
        userHome: "/home/test",
        scope: "project",
        view: "filesystem",
        fix: false,
      } as const;
      const selected = yield* LintWorkspace.admit(request);
      expect(selected.workspaceRoot).toBe("/workspace/nested");
      expect(selected.input).toEqual({ view: "filesystem" });
      const refusal = yield* Effect.flip(LintWorkspace.admit({ ...request, scope: "user" }));
      expect(refusal).toMatchObject({
        _tag: "LintStagingFailed",
        category: "usage",
        detail: "An explicit workspace cannot be combined with --scope user",
      });
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("climbs to the Git root only when the staged workspace is omitted", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-lint-root-")));
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(root, "axm.json"), "{}\n");
    fs.writeFileSync(path.join(nested, "axm.json"), "{}\n");
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    return Effect.gen(function* () {
      const request = {
        cwd: nested,
        userHome: root,
        scope: "project",
        view: "git-index",
        fix: false,
      } as const;
      const explicit = yield* LintWorkspace.admit({ ...request, path: nested });
      const implicit = yield* LintWorkspace.admit(request);
      expect(explicit.displayWorkspaceRoot).toBe(nested);
      expect(implicit.displayWorkspaceRoot).toBe(root);
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.scoped,
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });
});
