import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { ImportNativeExtension } from "./import-native-extension.js";

/**
 * Exhaustive per-type coverage behind
 * `cli/native-imports-preserve-content-and-source`: the activation table is
 * the rule, and this sweep verifies the conversion is the same for both types
 * of native content the import accepts.
 */
describe("ImportNativeExtension across native content types", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const body =
    "---\nname: original\ndescription: Review code carefully\n---\n\nKeep every recommendation evidence backed.\n";

  for (const type of ["skill", "subagent"] as const)
    for (const enable of [false, true])
      it.effect(`imports a native ${type} with enable=${enable}`, () =>
        Effect.gen(function* () {
          const plural = type === "skill" ? "skills" : "subagents";
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
          cleanups.push(created.cleanup);
          const relative = type === "skill" ? "native/SKILL.md" : "native/reviewer.md";
          created.write(relative, body);
          const before = created.snapshot("native");

          const resolution = yield* Effect.gen(function* () {
            const candidate = yield* ImportNativeExtension.prepare({
              type,
              source: nodePath.join(created.root, type === "skill" ? "native" : relative),
              target: `@acme/${plural}/custom`,
              enable,
            });
            return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(created.snapshot("native")).toEqual(before);
          expect(JSON.parse(created.read(`${plural}/custom/${type}.json`) ?? "null")).toMatchObject(
            { owner: "@acme", type, name: "custom", version: "0.1.0" },
          );
          const content = created.read(
            `${plural}/custom/src/${type === "skill" ? "SKILL.md" : "custom.md"}`,
          );
          expect(content).toContain("name: custom");
          expect(content).toContain("Keep every recommendation evidence backed.");
          expect(
            created.exists(type === "skill" ? ".claude/skills/custom" : ".claude/agents/custom.md"),
          ).toBe(enable);
        }),
      );
});
