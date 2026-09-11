import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import {
  applyInstall,
  contentUnder,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install-forms-express-same-intent",
  title: "Root install and the type command express the same durable intent",
  statement:
    "When the same extension is installed, and then reinstalled at the same constraint, through the root install form and through its type-specific install form, both forms shall produce identical workspace configuration, identical canonical content, identical agent projections, and the same reported outcome.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["model"],
  derivedFrom: ["cli/install/reinstall-is-idempotent"],
  supersedes: ["cli/install/root-and-type-forms-express-same-intent"],
  assumptions: [],
  openQuestions: [],
});

/** The root form names a locator and lets the use case detect the type. */
const rootForm = (source: string) =>
  applyInstall(installRequest({ subject: { kind: "source", source } }));

/** The type form fixes the type the command already knows. */
const typeForm = (source: string) =>
  applyInstall(installRequest({ type: "skill", subject: { kind: "source", source } }));

describe("Root and type-specific install parity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // Both workspaces declare the same Registry, so any difference in their
  // settings is a difference the two install forms made.
  const worlds = (): { readonly root: InstallWorld; readonly typed: InstallWorld } => {
    const root = makeInstallWorld();
    const typed = makeInstallWorld({ registry: root.registry });
    cleanups.push(root.cleanup, typed.cleanup);
    return { root, typed };
  };

  const expectSameRealizedState = (root: InstallWorld, typed: InstallWorld) => {
    expect(readSettings(root.workspace)).toEqual(readSettings(typed.workspace));
    for (const relative of [".claude", ".agents", "agent_extensions"]) {
      expect(contentUnder(root.workspace, relative)).toEqual(
        contentUnder(typed.workspace, relative),
      );
    }
  };

  it.effect(
    "both forms report applied and produce the same configuration and realized content",
    () => {
      const { root, typed } = worlds();
      const rootPackage = writeLocalSkillPackage(root.workspace.root, { name: "code-review" });
      const typePackage = writeLocalSkillPackage(typed.workspace.root, { name: "code-review" });
      return Effect.gen(function* () {
        const rootResolution = yield* root.workspace.provide(rootForm(rootPackage));
        const typeResolution = yield* typed.workspace.provide(typeForm(typePackage));

        for (const resolution of [rootResolution, typeResolution]) {
          expect(deriveOperationOutcome(resolution)).toBe("applied");
        }
        for (const world of [root, typed]) {
          const sourceBody = world.workspace.readFile("vendor/code-review/src/SKILL.md");
          expect(sourceBody).toContain("The code-review skill.");
          expect(
            world.workspace.readFile("agent_extensions/local/vendor/code-review/src/SKILL.md"),
          ).toBe(sourceBody);
          expect(world.workspace.readFile(".claude/skills/code-review/SKILL.md")).toBe(sourceBody);
        }
        expectSameRealizedState(root, typed);
      }).pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("repeating the install through either form reports the same no-op and state", () => {
    const { root, typed } = worlds();
    const rootPackage = writeLocalSkillPackage(root.workspace.root, { name: "code-review" });
    const typePackage = writeLocalSkillPackage(typed.workspace.root, { name: "code-review" });
    return Effect.gen(function* () {
      yield* root.workspace.provide(rootForm(rootPackage));
      yield* typed.workspace.provide(typeForm(typePackage));
      const rootRepeat = yield* root.workspace.provide(rootForm(rootPackage));
      const typeRepeat = yield* typed.workspace.provide(typeForm(typePackage));

      expect(deriveOperationOutcome(rootRepeat)).toBe("no-op");
      expect(deriveOperationOutcome(typeRepeat)).toBe("no-op");
      expectSameRealizedState(root, typed);
    }).pipe(Effect.provide(NodeServices.layer));
  });
});
