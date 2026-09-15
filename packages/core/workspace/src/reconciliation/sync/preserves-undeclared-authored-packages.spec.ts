import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { applySync, expectResolved, makeSyncFixture, previewSync } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-undeclared-authored-packages",
  title: "Sync leaves undeclared authored packages alone",
  statement:
    "When an authoring root holds an authored package or authored lookalike that no workspace declaration names, sync shall not project, remove, or rewrite it and shall not count it as unconverged.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const BASE = { owner: "@acme", agents: ["claude-code"] };

const manifest = (name: string) =>
  `${JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0", description: `The ${name} skill.` })}\n`;

/** Undeclared authored content: a valid package and two lookalikes. */
const AUTHORED: Readonly<Record<string, string>> = {
  "skills/drafted/skill.json": manifest("drafted"),
  "skills/drafted/src/SKILL.md":
    '---\nname: "drafted"\ndescription: "Drafted."\n---\n\n# drafted\n',
  "skills/no-manifest/SKILL.md": "# No manifest\n",
  "skills/mismatched/skill.json": manifest("other-name"),
  "skills/mismatched/src/SKILL.md": "# Mismatched\n",
};

describe("Sync preserves undeclared authored packages", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const authoredSnapshot = (root: string) =>
    Object.keys(AUTHORED).map((relative) => [
      relative,
      fs.readFileSync(nodePath.join(root, relative), "utf8"),
    ]);

  it.effect("an otherwise converged workspace stays converged and byte-identical", () => {
    const workspace = makeSyncFixture({ settings: BASE, files: AUTHORED });
    cleanups.push(workspace.cleanup);
    const before = workspace.snapshot();
    return workspace
      .provide(
        Effect.gen(function* () {
          expect((yield* previewSync())._tag).toBe("AlreadyReconciled");
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.exists(".claude/skills/drafted")).toBe(false);
          expect(workspace.exists(".agents/skills/drafted")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a sync that changes other state leaves authored content untouched", () => {
    const workspace = makeSyncFixture({
      settings: BASE,
      files: {
        ...AUTHORED,
        "agent_extensions/agentxm/@acme/skills/stale/skill.json": manifest("stale"),
      },
    });
    cleanups.push(workspace.cleanup);
    const before = authoredSnapshot(workspace.root);
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(yield* applySync());
          const touched = resolution.units.flatMap(({ artifact }) =>
            (artifact?.targets ?? []).map(({ path }) => path),
          );
          expect(touched.filter((path) => path.startsWith("skills/"))).toEqual([]);
          expect(authoredSnapshot(workspace.root)).toEqual(before);
          expect(workspace.exists(".claude/skills/drafted")).toBe(false);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
