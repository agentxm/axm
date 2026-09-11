import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
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
  writeNativeRemoteMcp,
} from "../test-support/native-mcp.js";
import { ImportNativeExtension } from "./import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/creates-authored-package-from-native-server",
  title: "A native MCP server can become an authored package",
  statement:
    "Given one unmanaged native server defined by an HTTP URL and optional non-secret literal headers, mcps import --as shall create a workspace-authored MCP package under the supplied fully qualified MCP name with the same URL and headers.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Reading the native definition, writing a schema-valid manifest under the supplied identity, and recording the workspace declaration are all decisions of the import use case; a real project directory observes each one without a built binary.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/mcps/import.ts",
    "apps/cli-e2e/src/fork-import.e2e.test.ts",
    "cli/creation-uses-configured-workspace-ownership",
    "cli/authoring-uses-project-workspace",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which native transports and configuration fields beyond the represented HTTP URL and headers must package conversion support without loss?",
    "What selection or refusal behavior is required when discovery finds no eligible server, several distinct servers, or conflicting definitions?",
    "How must package conversion preserve existing input references and credentials? The MCP secret owner governs managed secret storage; these examples use only non-secret literal headers.",
    "May a conversion replace an existing configured connection under the target name, and how should existing authored content be treated? The current configured-source transition is an observation, not a new fallback policy.",
  ],
  limitations: [
    {
      limitation:
        "These examples verify conversion of connection configuration without contacting the remote MCP service or exercising credentials.",
      retirementCondition:
        "Add evidence under accepted transport and credential obligations when those additional conversion conditions are decided.",
    },
  ],
});

describe("Converting a native MCP server into an authored package", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const targetName of [NATIVE_MCP_KEY, "context"])
    it.effect(
      `creates the requested ${targetName} package with the complete remote definition`,
      () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({
            owner: "@acme",
            agents: ["claude-code", "cursor"],
          });
          cleanups.push(created.cleanup);
          // Identical declarations in two agent files represent the same server.
          for (const relative of NATIVE_MCP_FILES) writeNativeRemoteMcp(created, relative);

          const resolution = yield* Effect.gen(function* () {
            const candidate = yield* ImportNativeExtension.prepare({
              type: "mcp-server",
              target: `@acme/mcps/${targetName}`,
              enable: true,
              nonInteractive: true,
              discovery: nativeMcpDiscovery(created),
            });
            return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          const manifest = Schema.decodeUnknownSync(McpServerManifestSchema)(
            JSON.parse(created.read(`mcps/${targetName}/mcp.json`) ?? "null"),
          );
          expect(manifest).toMatchObject({ owner: "@acme", type: "mcp-server", name: targetName });
          expect(manifest.server.remotes).toHaveLength(1);
          const remote = manifest.server.remotes?.[0];
          if (remote === undefined) throw new Error("Expected the converted remote definition");
          expect(remote.url).toBe(importedRemote.url);
          expect(
            Object.fromEntries((remote.headers ?? []).map(({ name, value }) => [name, value])),
          ).toEqual(importedRemote.headers);

          expect(readImportedMcpDeclaration(created, targetName).source).toBe("workspace");
        }),
    );
});
