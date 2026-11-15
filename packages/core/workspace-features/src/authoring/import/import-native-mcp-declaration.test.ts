import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { FileSystemRecorder } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { applyExecution, makeAuthoringWorkspace } from "../test-support/authoring-workspace.js";
import { nativeMcpDiscovery, writeNativeRemoteMcp } from "../test-support/native-mcp.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { ImportNativeExtension } from "./import-native-extension.js";

describe("ImportNativeExtension MCP declaration work", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Prepare one native MCP import, then measure the settings work of applying it. */
  const importApplied = (enable: boolean) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code", "cursor"] });
    cleanups.push(created.cleanup);
    writeNativeRemoteMcp(created);
    const discovery = nativeMcpDiscovery(created);
    const settingsPath = nodePath.join(created.root, "axm.json");
    const receiptsPath = nodePath.join(created.root, ".axm", "projection-containers.json");
    return Effect.gen(function* () {
      const candidate = yield* ImportNativeExtension.prepare({
        type: "mcp-server",
        target: "@acme/mcps/context",
        enable,
        nonInteractive: true,
        discovery,
      });
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const resolution = yield* work.provide(
        ImportNativeExtension.previewOrApply(candidate, applyExecution),
      );
      const facts = (kind: string, phase?: string) =>
        work.facts.filter(
          (fact) =>
            fact.kind === kind &&
            (phase === undefined || fact.attributes["axm.parse.phase"] === phase),
        ).length;
      return {
        outcome: deriveOperationOutcome(resolution),
        work: {
          settingsContentReads: recording.contentReads(settingsPath),
          priorParses: facts("axm.parse.settings-round-trip", "prior"),
          renders: facts("axm.render.settings"),
          publications: recording
            .calls({ method: "rename" })
            .filter((call) => call.toPath === settingsPath).length,
          receiptPublications: recording
            .calls({ method: "rename" })
            .filter((call) => call.toPath === receiptsPath).length,
        },
        settings: created.read("axm.json"),
      };
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  };

  /** The declaration an import publishes; only its activation differs between the cases. */
  const declared = (enabled: boolean) =>
    `${JSON.stringify(
      {
        owner: "@acme",
        agents: ["claude-code", "cursor"],
        mcpServers: {
          context: {
            source: "workspace",
            distribution: {
              kind: "remote",
              transport: "streamable-http",
              url: "https://mcp.example.test/context",
            },
            bindings: [
              { target: { kind: "header", name: "X-Workspace" }, value: "review-team" },
              { target: { kind: "header", name: "X-View" }, value: "complete" },
            ],
            // The deactivation edits the published text in place, so it lands last.
            ...(enabled ? {} : { enabled: false }),
          },
        },
      },
      null,
      2,
    )}\n`;

  // Measured while the install the import materializes re-set the entry the
  // import had just declared: that write read axm.json for its document and
  // again for its prior image, parsed and rendered it once, and published
  // nothing. The authored declaration and its final activation still write
  // through the settings writer, so publications and bytes are unchanged.
  const before = {
    enabled: {
      settingsContentReads: 25,
      priorParses: 3,
      renders: 3,
      publications: 1,
      receiptPublications: 0,
    },
    disabled: {
      settingsContentReads: 31,
      priorParses: 3,
      renders: 3,
      publications: 2,
      receiptPublications: 0,
    },
  } as const;

  for (const [label, enable] of [
    ["enabled", true],
    ["disabled", false],
  ] as const)
    it.effect(`does not re-set the declaration an MCP import just published (${label})`, () =>
      Effect.gen(function* () {
        const measured = yield* importApplied(enable);
        expect(measured.outcome).toBe("applied");
        expect(measured.work).toEqual({
          settingsContentReads: before[label].settingsContentReads - 2,
          priorParses: before[label].priorParses - 1,
          renders: before[label].renders - 1,
          publications: before[label].publications,
          receiptPublications: before[label].receiptPublications,
        });
        expect(measured.settings).toBe(declared(enable));
      }),
    );
});
