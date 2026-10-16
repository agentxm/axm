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

describe("ImportNativeExtension rollback", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

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
});
