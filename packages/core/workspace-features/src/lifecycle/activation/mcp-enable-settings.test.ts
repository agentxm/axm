/**
 * Settings work applying an MCP server enable does once.
 *
 * Enabling a sourced MCP server publishes its activated settings entry, then
 * reinstalls the connection inside the same transaction. When the entry the
 * install would set is the one it reads live, that entry is not set a second
 * time: the activation's publication left `axm.json` at the settings writer's
 * fixed point, so the second publication was a no-op. Counts are exact for
 * these fixtures over a real temporary workspace and a `file://` Registry.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { EnableExtension } from "./set-activation.js";
import { applyActivationAcceptingExecutionChanges } from "./test-helpers.js";

const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const acceptingExecutionChanges = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["enable"], arguments: [] },
});

/**
 * Install `context`, disable it, run `between`, prepare its enable, then
 * count the `axm.json` work applying that enable does.
 */
const measureEnableApply = (world: InstallWorld, between: Effect.Effect<void> = Effect.void) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const installed = yield* applyInstallAcceptingExecutionChanges(
      installRequest({
        type: "mcp-server",
        subject: { kind: "source", source: "test:@acme/mcps/context" },
      }),
    );
    expect(deriveOperationOutcome(installed)).toBe("applied");
    yield* applyActivationAcceptingExecutionChanges({
      type: "mcp-server",
      name: "context",
      enabled: false,
    });
    yield* between;
    const candidate = yield* EnableExtension.prepare({ type: "mcp-server", name: "context" });
    if (candidate._tag !== "SetActivation") throw new Error("Expected an activation change");
    const settingsPath = nodePath.join(world.workspace.root, "axm.json");
    recording.reset();
    const work = workObservations(false);
    const resolution = yield* EnableExtension.previewOrApply(
      candidate,
      acceptingExecutionChanges,
    ).pipe(work.provide);
    return {
      outcome: deriveOperationOutcome(resolution),
      settings: world.workspace.readFile("axm.json"),
      counts: {
        contentReads: recording.contentReads(settingsPath),
        probes: recording.counts(settingsPath).access ?? 0,
        priorParses: work.facts.filter(
          (fact) =>
            fact.kind === "axm.parse.settings-round-trip" &&
            fact.attributes["axm.parse.phase"] === "prior",
        ).length,
        publications: recording
          .calls({ method: "rename" })
          .filter((call) => call.toPath === settingsPath).length,
      },
    };
  }).pipe(world.workspace.provide, Effect.provide(recordedNodeServices));

/** The distribution the install selects and records for `context`. */
const distribution = {
  kind: "package",
  registryType: "npm",
  registryBaseUrl: "https://registry.npmjs.org",
  identifier: "@acme/context",
  runtimeHint: "npx",
  transport: "stdio",
} as const;

describe("Applying an MCP server enable sets its settings entry once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    created.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return created;
  };

  it.effect(
    "does not set again the entry the activation just published",
    () => {
      const created = world();
      return Effect.gen(function* () {
        const measured = yield* measureEnableApply(created);
        expect(measured.outcome).toBe("applied");
        expect(JSON.parse(measured.settings)).toMatchObject({
          mcpServers: {
            context: { source: "test:@acme/mcps/context", distribution, bindings: [] },
          },
        });
        // Repeated: 17 content reads, 12 presence probes and 2 prior parses of
        // `axm.json`. The activation's publication, the install's live reads
        // of the entry and the transaction's readback keep theirs.
        expect(measured.counts).toEqual({
          contentReads: 15,
          probes: 10,
          priorParses: 1,
          publications: 1,
        });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "leaves the activation's format-preserving publication as the final text",
    () => {
      const created = world();
      const location = created.registry.source.location;
      // The disabled entry, reordered and indented as the writer would not write it.
      const handAuthored = Effect.sync(() =>
        created.workspace.writeFile(
          "axm.json",
          `${JSON.stringify(
            {
              agents: ["claude-code"],
              owner: "@acme",
              defaultRegistry: "test",
              sources: [created.registry.source],
              mcpServers: {
                context: {
                  enabled: false,
                  bindings: [],
                  distribution,
                  source: "test:@acme/mcps/context",
                },
              },
            },
            null,
            4,
          )}\n`,
        ),
      );
      return Effect.gen(function* () {
        const measured = yield* measureEnableApply(created, handAuthored);
        expect(measured.outcome).toBe("applied");
        expect(measured.counts.publications).toBe(1);
        expect(measured.settings).toBe(
          [
            "{",
            '    "agents": [',
            '        "claude-code"',
            "    ],",
            '    "owner": "@acme",',
            '    "defaultRegistry": "test",',
            '    "sources": [',
            "        {",
            '            "name": "test",',
            '            "type": "registry",',
            `            "location": "${location}"`,
            "        }",
            "    ],",
            '    "mcpServers": {',
            '        "context": {',
            '          "bindings": [],',
            '            "distribution": {',
            '                "kind": "package",',
            '                "registryType": "npm",',
            '                "registryBaseUrl": "https://registry.npmjs.org",',
            '                "identifier": "@acme/context",',
            '                "runtimeHint": "npx",',
            '                "transport": "stdio"',
            "            },",
            '            "source": "test:@acme/mcps/context"',
            "        }",
            "    }",
            "}",
            "",
          ].join("\n"),
        );
      });
    },
    { timeout: 60_000 },
  );
});
