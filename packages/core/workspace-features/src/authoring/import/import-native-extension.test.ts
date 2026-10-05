import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { NativeWriteAuthority, NativeWriteRefused } from "@agentxm/workspace-kernel/agent-adapters";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { ImportNativeExtension } from "./import-native-extension.js";
import { nativeMcpDiscovery, writeNativeRemoteMcp } from "../test-support/native-mcp.js";

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

  it.effect(
    "restores an authored MCP package and its new parent after a late native write failure",
    () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({
          owner: "@acme",
          agents: ["claude-code", "cursor"],
        });
        cleanups.push(created.cleanup);
        writeNativeRemoteMcp(created);
        const discovery = nativeMcpDiscovery(created);
        const before = created.snapshot();
        const injected = yield* Ref.make(false);
        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* ImportNativeExtension.prepare({
            type: "mcp-server",
            target: "@acme/mcps/context",
            enable: true,
            nonInteractive: true,
            discovery,
          });
          const authority = yield* NativeWriteAuthority;
          return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution).pipe(
            Effect.provideService(NativeWriteAuthority, {
              ...authority,
              protect: (target) =>
                target === nodePath.join(created.root, ".cursor/mcp.json")
                  ? Effect.gen(function* () {
                      expect(created.exists("mcps/context/mcp.json")).toBe(true);
                      yield* Ref.set(injected, true);
                      return yield* new NativeWriteRefused({
                        path: target,
                        cause: "injected-native-write-failure",
                      });
                    })
                  : authority.protect(target),
            }),
          );
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(yield* Ref.get(injected)).toBe(true);
        expect(deriveOperationOutcome(resolution)).toBe("failed");
        expect(
          resolution.footprint?.some(
            (entry) => entry.path === "mcps/context" && entry.change === "created",
          ),
        ).toBe(true);
        expect(resolution.atomicity.applied).toBe("closure-atomic");
        expect(resolution.recovery).toBeUndefined();
        expect(created.snapshot()).toEqual(before);
      }),
  );

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
              ...(type === "subagent" ? { sourceAgent: "claude-code" as const } : {}),
            });
            return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

          expect(deriveOperationOutcome(resolution), JSON.stringify(resolution)).toBe("applied");
          expect(created.snapshot("native")).toEqual(before);
          expect(JSON.parse(created.read(`${plural}/custom/${type}.json`) ?? "null")).toMatchObject(
            { owner: "@acme", type, name: "custom", version: "0.1.0" },
          );
          const content = created.read(
            `${plural}/custom/${type === "skill" ? "src/SKILL.md" : "native/claude-code/reviewer.md"}`,
          );
          expect(content).toBe(body);
          expect(content).toContain("Keep every recommendation evidence backed.");
          expect(
            created.exists(
              type === "skill" ? ".claude/skills/original" : ".claude/agents/original.md",
            ),
          ).toBe(enable);
        }),
      );
});
