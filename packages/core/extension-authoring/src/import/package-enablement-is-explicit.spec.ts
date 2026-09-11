import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import {
  NATIVE_MCP_FILES,
  NATIVE_MCP_KEY,
  importedRemote,
  nativeMcpDiscovery,
  readImportedMcpDeclaration,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "../test-support/native-mcp.js";
import { ImportNativeExtension } from "./import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/package-enablement-is-explicit",
  title: "Imported packages are enabled only by an explicit request",
  statement:
    "The --enable option of mcps import shall apply only to --as package conversion, enabling the converted package when supplied and leaving it disabled when omitted.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Activation is carried on the conversion request and settled by the import use case: a real project directory shows the persisted declaration and the native configurations the conversion reconciled, without a built binary.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/mcps/import.ts",
    "apps/cli/src/root/mcps/import.test.ts",
    "apps/cli-e2e/src/fork-import.e2e.test.ts",
    "cli/mcps/projects-to-every-configured-agent",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Opt-in activation of an imported MCP package", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const enabled of [false, true])
    it.effect(
      `persists ${enabled ? "enabled" : "disabled"} authored state and reconciles native entries`,
      () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({
            owner: "@acme",
            agents: ["claude-code", "cursor"],
          });
          cleanups.push(created.cleanup);
          for (const relative of NATIVE_MCP_FILES) writeNativeRemoteMcp(created, relative);
          expect(readNativeMcpServers(created)[NATIVE_MCP_KEY]).toEqual(importedRemote);

          const resolution = yield* Effect.gen(function* () {
            const candidate = yield* ImportNativeExtension.prepare({
              type: "mcp-server",
              target: "@acme/mcps/context",
              enable: enabled,
              nonInteractive: true,
              discovery: nativeMcpDiscovery(created),
            });
            return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(created.exists("mcps/context/mcp.json")).toBe(true);
          expect(readImportedMcpDeclaration(created)).toEqual({ source: "workspace", enabled });
          for (const relative of NATIVE_MCP_FILES) {
            const servers = readNativeMcpServers(created, relative);
            expect(servers, relative).not.toHaveProperty(NATIVE_MCP_KEY);
            if (enabled) expect(servers["context"], relative).toMatchObject(importedRemote);
            else expect(servers, relative).not.toHaveProperty("context");
          }
        }),
    );
});
