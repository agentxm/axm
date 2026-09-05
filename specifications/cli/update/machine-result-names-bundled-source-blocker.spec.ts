import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  PlanResolutionDocumentSchema,
  handleSkillsInstall,
  handleUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/update/machine-result-names-bundled-source-blocker",
  title:
    "Machine update output names the bundled source as the blocker with every effect unchanged",
  statement:
    "When a targeted update of a bundled-source extension is blocked in machine output mode, the result document shall satisfy the published plan-result schema and shall report the targeted-update context with direct-only ownership, enabled activation, blocked authority, a bundled direct source, the bundled-source blocker, and every effect unchanged, in preview and apply alike.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract"],
  derivedFrom: ["cli/update/bundled-source-routes-to-recovery"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);

const modes = [{ mode: "preview" }, { mode: "apply" }] as const;

describe("Machine result of a blocked bundled-source update", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(modes)("names the bundled-source blocker in $mode", ({ mode }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* handleSkillsInstall(
        { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));

      yield* handleUpdate({
        source: Option.some("@agentxm/skills/axm"),
        force: false,
        preview: mode === "preview",
      }).pipe(Effect.provide(workspace.layer));

      const document = yield* decodeDocument(workspace.rendererState.results.at(-1)?.data);
      expect(document.result.outcome).toBe("blocked");
      expect(document.result.targetedUpdate).toMatchObject({
        ownership: "direct-only",
        activation: "enabled",
        authority: "blocked",
        direct: { source: "bundled", enabled: true },
        blocker: "bundled-source",
        effects: {
          settings: "unchanged",
          acceptedResolution: "unchanged",
          canonical: "unchanged",
          projection: "unchanged",
          packRoot: "unchanged",
          packManifest: "unchanged",
        },
      });
    }),
  );
});
