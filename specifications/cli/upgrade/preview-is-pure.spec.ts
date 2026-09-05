import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { probeFlag } from "../../support/parser-probe.js";
import { LOCAL_VERSION, TARGET_VERSION, runUpgrade } from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/preview-is-pure",
  title: "Upgrade preview resolves the installation change without performing it",
  statement:
    "When upgrade runs in preview mode against an installation with a newer promoted release, it shall report the installer, the target, and the command it would run with a previewed outcome and shall invoke no installer command, persist no install metadata, and write no update-check cache.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/upgrade/discloses-resolved-ownership-before-mutation"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Upgrade preview purity", () => {
  it.effect("a previewed upgrade touches neither the installer nor its persistent records", () =>
    Effect.gen(function* () {
      const run = yield* runUpgrade({ preview: true });

      expect(run.calls).toEqual([]);
      expect(run.installMetaWrites).toEqual([]);
      expect(run.updateCheckWrites).toEqual([]);
      expect(run.document).toMatchObject({
        ok: true,
        result: {
          outcome: "previewed",
          disposition: "previewed",
          ownership: { method: "homebrew" },
          local: { version: LOCAL_VERSION },
          target: { version: TARGET_VERSION },
          mutation: { state: "not-attempted" },
          verification: { state: "not-attempted" },
          commands: [],
          details: { messages: ["Would run brew upgrade agentxm/tap/axm"] },
        },
      });
    }),
  );

  it.effect("the same request without preview writes the records the preview left alone", () =>
    Effect.gen(function* () {
      const run = yield* runUpgrade();

      expect(run.calls.length).toBeGreaterThan(0);
      expect(run.installMetaWrites).toEqual([expect.objectContaining({ method: "homebrew" })]);
      expect(run.updateCheckWrites).toEqual([{ version: TARGET_VERSION }]);
      expect(run.document).toMatchObject({ result: { disposition: "upgraded" } });
    }),
  );

  it.effect("a previewed refused downgrade reports the refusal and still changes nothing", () =>
    Effect.gen(function* () {
      const run = yield* runUpgrade({ preview: true, reinstall: true, requestedVersion: "0.0.1" });

      expect(run.calls).toEqual([]);
      expect(run.installMetaWrites).toEqual([]);
      expect(run.updateCheckWrites).toEqual([]);
      expect(run.document).toMatchObject({
        ok: false,
        result: {
          outcome: "failed",
          disposition: "downgrade-refused",
          local: { version: LOCAL_VERSION, relation: "local-newer" },
          target: { version: "0.0.1" },
          mutation: { state: "not-attempted" },
        },
      });
    }),
  );

  it.effect("the route spells its assessment as preview and offers no preapproval", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["upgrade"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["upgrade"], "--dry-run")).toBe("unrecognized");
      expect(yield* probeFlag(["upgrade"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["upgrade"], "-y")).toBe("unrecognized");
    }),
  );
});
