import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applyInstall, installRequest, makeInstallWorld } from "../install/test-helpers.js";
import { writeLocalSkillPackage } from "../testing.js";
import { UninstallExtensions } from "./uninstall-extensions.js";
import { applyUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/is-idempotent",
  title: "Uninstalling an extension the workspace does not desire is a safe no-op",
  statement:
    "When uninstall targets an extension the workspace does not desire, whether never installed or already uninstalled, it shall report a no-op and shall change no configuration, resolution, canonical content, or agent projection.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface AbsentCase {
  readonly label: string;
  readonly prepare: "nothing" | "install-then-uninstall";
}

const absentCases: readonly AbsentCase[] = [
  {
    label: "uninstalling an extension that was never desired reports a no-op",
    prepare: "nothing",
  },
  {
    label: "repeating a completed uninstall reports a no-op",
    prepare: "install-then-uninstall",
  },
];

const TARGET = "@acme/skills/code-review";

describe("Uninstall of an absent extension is safe to repeat", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(absentCases)("$label", ({ prepare }) => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          const removal = uninstallRequest({ selector: TARGET });
          if (prepare === "install-then-uninstall") {
            const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
            yield* applyInstall(installRequest({ subject: { kind: "source", source } }));
            yield* applyUninstall(removal);
          }
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();

          // The root form reads the type from the FQN and settles on the name
          // it addresses, whether or not the workspace still desires it.
          const candidate = yield* UninstallExtensions.prepare(removal);
          expect(candidate.type).toBe("skill");
          expect(candidate.names).toEqual(["code-review"]);

          const resolution = yield* applyUninstall(removal);

          // Nothing was withdrawn, so no unit changed state and the operation
          // resolves as a no-op.
          expect(deriveOperationOutcome(resolution)).toBe("no-op");
          expect(resolution.units.length).toBeGreaterThan(0);
          expect(resolution.units.map((unit) => unit.state)).toEqual(
            resolution.units.map(() => "unchanged"),
          );
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
