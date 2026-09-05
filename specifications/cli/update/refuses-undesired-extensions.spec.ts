import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/update/refuses-undesired-extensions",
  title: "Update is blocked for an extension the workspace does not desire",
  statement:
    "When an update names an extension the workspace does not desire, the update shall be blocked as an unmet precondition before any change and shall leave configuration, lock state, and acquired content untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/update/advances-resolution-within-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Update an extension the workspace does not desire", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("is blocked as an unmet precondition and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const lockfileBefore = workspace.readLockfileText();

      yield* handleUpdate({
        source: Option.some("@acme/skills/absent"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "blocked",
          blocking: { class: "precondition-unmet" },
          units: [],
        },
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockfileBefore);
      expect(workspace.snapshotTree("agent_extensions")).toEqual([]);
    }),
  );
});
