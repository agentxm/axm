import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { resolveRootUninstallIntent } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/rejects-versioned-root-targets",
  title: "Root uninstall requires an unversioned extension identity",
  statement:
    "Root uninstall shall accept an unversioned extension FQN. A supplied version or version constraint shall produce a usage error before workspace removal, explain the unversioned FQN grammar, and suggest the same extension without its version suffix.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Root uninstall identity", () => {
  for (const type of ["skills", "mcps", "subagents", "rules", "hooks", "knowledge", "packs"]) {
    for (const version of ["1.2.3", "^1.2.3", "*", ""]) {
      it.effect(`refuses ${type} with version suffix @${version}`, () =>
        Effect.gen(function* () {
          const fqn = `@acme/${type}/review`;
          const failure = yield* resolveRootUninstallIntent(`${fqn}@${version}`).pipe(Effect.flip);
          expect(failure.category).toBe("usage");
          expect(failure.detail).toContain("unversioned");
          expect(failure.recover).toContain("@<handle>/<plural-type>/<name>");
          expect(failure.suggestions).toEqual([
            { description: "Remove the configured extension", cmd: `axm uninstall ${fqn}` },
          ]);
        }),
      );
    }
  }
});
