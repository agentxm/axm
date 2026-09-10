import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { RuleManifestSchema } from "@agentxm/extension-model/unstable/rules/manifest-schema";

import { CreateExtension } from "../../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/rules/new/creates-enabled-workspace-content",
  title: "Creating a rule records editable workspace content",
  statement:
    "When a person creates a rule, AXM shall create its manifest and starter body in the workspace authoring directory, carry the requested title into both, register it as enabled workspace-authored content, and project it into the shared instruction surface agents read.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "The manifest, the body, the declaration, and the instruction projection are all written by the creation use case over the workspace-state services; a real project directory observes each one.",
  derivedFrom: ["packages/core/extension-authoring/src/create/scaffolds/rule.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a rule", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);

      yield* Effect.gen(function* () {
        const candidate = yield* CreateExtension.prepare({
          type: "rule",
          name: "review",
          owner: Option.none(),
          title: Option.some("Review policy"),
        });
        return yield* CreateExtension.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

      const manifest = Schema.decodeUnknownSync(RuleManifestSchema)(
        JSON.parse(created.read("rules/review/rule.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "rule",
        name: "review",
        title: "Review policy",
      });
      expect(created.settings()).toMatchObject({ rules: { review: "workspace" } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
      expect(created.read("rules/review/src/RULE.md")).toContain("Review policy");
      expect(created.read("AGENTS.md")).toContain("Review policy");
    }),
  );
});
