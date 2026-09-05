import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { extensionName, getAppError, handleSkillsNew } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/skills/new/preview-is-pure",
  title: "Skill creation preview describes the scaffold without creating any state",
  statement:
    "When skills new runs in preview mode with an owner the workspace authors, it shall report the manifest, content, settings entry, and agent locations it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["cli/skills/new/scaffolds-for-every-configured-agent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "review-helper";

describe("Skill creation preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace whose settings name `@acme` as the authoring owner. */
  const workspace = () => {
    const created = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme", agents: ["claude-code"] },
    });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("a previewed creation changes no protected state", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = snapshotProtectedState(created.root);
      created.writes.splice(0);
      created.rendererState.results.splice(0);

      yield* handleSkillsNew({
        name: extensionName(SKILL),
        owner: Option.none(),
        preview: true,
      }).pipe(Effect.provide(created.layer));

      expectProtectedStateUntouched({ root: created.root, before, writes: created.writes });
      expect(created.exists(`skills/${SKILL}`)).toBe(false);
      expect(created.exists(`.claude/skills/${SKILL}`)).toBe(false);
      expect(JSON.stringify(created.readSettings())).not.toContain(SKILL);
      expect(created.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = created.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: `@acme/skills/${SKILL}`, state: "ready" })],
        },
      });
    }),
  );

  it.effect(
    "a previewed creation for an owner the workspace does not author is refused and changes nothing",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const before = snapshotProtectedState(created.root);
        created.writes.splice(0);

        const error = yield* handleSkillsNew({
          name: extensionName(SKILL),
          owner: Option.some("@other"),
          preview: true,
        }).pipe(Effect.provide(created.layer), Effect.flip);

        expect(getAppError(error).code).toBe("conflict");
        expect(getAppError(error).detail).toContain("@other");
        expectProtectedStateUntouched({ root: created.root, before, writes: created.writes });
        expect(created.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["skills", "new"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["skills", "new"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["skills", "new"], "-y")).toBe("unrecognized");
    }),
  );
});
