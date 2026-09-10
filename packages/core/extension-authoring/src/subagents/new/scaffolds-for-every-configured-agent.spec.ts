import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { SubagentManifestSchema } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { deriveOperationOutcome, type JobStepArtifactTarget } from "@agentxm/workspace-operations";

import { CreateExtension } from "../../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/new/scaffolds-for-every-configured-agent",
  title: "A new subagent is scaffolded and rendered for every configured agent",
  statement:
    "When a subagent is created, AXM shall create its manifest, content, and enabled settings entry together, shall render it for every configured agent that can represent it, and shall report the same package and declaration targets in preview and apply.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "agent-interoperability", "safe-repetition"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Creation is decided and executed inside extension-authoring over the workspace-state services; a real project directory observes the renderings an author would see without running the built CLI.",
  derivedFrom: [
    "packages/core/extension-authoring/src/create/create-extension.ts",
    "cli/skills/new/scaffolds-for-every-configured-agent",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor both render project-scope subagents into distinct directories, so two rendered files observe two configured agents.",
    "A subagent's rendered agent files are not listed as creation targets; the created package, its content, and its declaration are. Preview and apply therefore compare that set.",
  ],
  openQuestions: [],
});

const SUBAGENT = "reviewer";
const AUTHORED_ROOT = `subagents/${SUBAGENT}`;
const AGENT_RENDERINGS = [`.claude/agents/${SUBAGENT}.md`, `.cursor/agents/${SUBAGENT}.md`];

const targetPaths = (
  units: ReadonlyArray<{
    readonly artifact?: { readonly targets?: ReadonlyArray<JobStepArtifactTarget> };
  }>,
): ReadonlyArray<string> =>
  units
    .flatMap((unit) => unit.artifact?.targets ?? [])
    .map((target) => target.path)
    .sort((left, right) => left.localeCompare(right));

describe("Creating a subagent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A workspace `@acme` authors, with two agents that render subagents. */
  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({
      owner: "@acme",
      agents: ["claude-code", "cursor"],
    });
    cleanups.push(created.cleanup);
    return created;
  };

  const createSubagent = (target: AuthoringWorkspace, mode: "preview" | "apply") =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        type: "subagent",
        name: SUBAGENT,
        owner: Option.none(),
      });
      return yield* CreateExtension.previewOrApply(
        candidate,
        mode === "preview" ? previewExecution : applyExecution,
      );
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  it.effect("records the manifest, content, and enabled settings entry together", () =>
    Effect.gen(function* () {
      const created = workspace();

      const resolution = yield* createSubagent(created, "apply");

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      const manifest = Schema.decodeUnknownSync(SubagentManifestSchema)(
        JSON.parse(created.read(`${AUTHORED_ROOT}/subagent.json`) ?? "null"),
      );
      expect(manifest).toMatchObject({ owner: "@acme", type: "subagent", name: SUBAGENT });
      expect(created.read(`${AUTHORED_ROOT}/src/${SUBAGENT}.md`)).toContain(`name: ${SUBAGENT}`);
      expect(created.settings()).toMatchObject({ subagents: { [SUBAGENT]: expect.anything() } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
    }),
  );

  it.effect("renders the subagent for every configured agent", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSubagent(created, "apply");

      for (const rendering of AGENT_RENDERINGS) {
        expect(created.exists(rendering), rendering).toBe(true);
        expect(created.read(rendering)).toContain(`name: ${SUBAGENT}`);
      }
    }),
  );

  it.effect("previews exactly the targets an apply realizes", () =>
    Effect.gen(function* () {
      const created = workspace();

      const previewed = yield* createSubagent(created, "preview");
      expect(deriveOperationOutcome(previewed)).toBe("previewed");
      expect(created.exists(AUTHORED_ROOT)).toBe(false);
      for (const rendering of AGENT_RENDERINGS) {
        expect(created.exists(rendering), rendering).toBe(false);
      }

      const applied = yield* createSubagent(created, "apply");

      expect(targetPaths(applied.units)).toEqual(targetPaths(previewed.units));
    }),
  );
});
