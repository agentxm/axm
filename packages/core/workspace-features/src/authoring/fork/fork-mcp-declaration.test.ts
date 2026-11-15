import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { FileSystemRecorder } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { applyExecution, makeAuthoringWorkspace } from "../test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { ForkExtension } from "./fork-extension.js";

describe("ForkExtension MCP declaration work", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * The one distribution the forked package's manifest offers, as install
   * selects it and in the field order the settings writer publishes it.
   */
  const selected = {
    kind: "package",
    registryType: "npm",
    registryBaseUrl: "https://registry.npmjs.org",
    identifier: "@acme/original",
    runtimeHint: "npx",
    transport: "stdio",
  } as const;

  /** The same distribution in the shorter form a person may declare it in. */
  const shorthand = {
    kind: "package",
    registryType: "npm",
    identifier: "@acme/original",
    transport: "stdio",
  } as const;

  const settingsWith = (declared: Readonly<Record<string, unknown>> | undefined) => ({
    owner: "@acme",
    agents: ["claude-code"],
    instructionFiles: {},
    ...(declared === undefined ? {} : { mcpServers: { custom: declared } }),
  });

  /** Fork an MCP package onto `custom`, then measure the settings work of applying it. */
  const forkApplied = (options: {
    readonly enable: boolean;
    readonly declared?: Readonly<Record<string, unknown>>;
  }) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.writeSettings(settingsWith(options.declared));
    const source = writeAuthoringPackage(created.root, authoringTypeFor("mcp-server"), "original");
    const settingsPath = nodePath.join(created.root, "axm.json");
    const receiptsPath = nodePath.join(created.root, ".axm", "projection-containers.json");
    const seeded = created.settings();
    return Effect.gen(function* () {
      const candidate = yield* ForkExtension.prepare({
        source,
        target: "@acme/mcps/custom",
        from: Option.none(),
        enable: options.enable,
        nonInteractive: true,
      });
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const resolution = yield* work.provide(
        ForkExtension.previewOrApply(candidate, applyExecution),
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
        seeded,
        settings: created.read("axm.json"),
      };
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  };

  /** The settings text a fork publishes, in the order its edits place each field. */
  const published = (seeded: unknown, entry: Readonly<Record<string, unknown>>) =>
    `${JSON.stringify(
      {
        ...(typeof seeded === "object" && seeded !== null ? seeded : {}),
        mcpServers: { custom: entry },
      },
      null,
      2,
    )}\n`;

  // Measured while the install an enabled fork materializes re-set the entry
  // the fork had just declared. When that entry already named the selected
  // distribution, the write read axm.json for its document and again for its
  // prior image, parsed and rendered it once, and published nothing. The
  // other cases write a different entry, or run no install, and keep exactly
  // the work measured then.
  const before = {
    declaredDistribution: {
      settingsContentReads: 25,
      priorParses: 3,
      renders: 3,
      publications: 1,
      receiptPublications: 0,
    },
    selectedDistribution: {
      settingsContentReads: 29,
      priorParses: 3,
      renders: 3,
      publications: 2,
      receiptPublications: 1,
    },
    shorthandDistribution: {
      settingsContentReads: 33,
      priorParses: 3,
      renders: 3,
      publications: 3,
      receiptPublications: 0,
    },
    disabled: {
      settingsContentReads: 22,
      priorParses: 2,
      renders: 2,
      publications: 2,
      receiptPublications: 1,
    },
  } as const;

  it.effect("does not re-set a declaration that already names the selected distribution", () =>
    Effect.gen(function* () {
      const measured = yield* forkApplied({ enable: true, declared: { distribution: selected } });
      expect(measured.outcome).toBe("applied");
      expect(measured.settings).toBe(
        published(measured.seeded, { distribution: selected, source: "workspace" }),
      );
      expect(measured.work).toEqual({
        settingsContentReads: before.declaredDistribution.settingsContentReads - 2,
        priorParses: before.declaredDistribution.priorParses - 1,
        renders: before.declaredDistribution.renders - 1,
        publications: before.declaredDistribution.publications,
        receiptPublications: before.declaredDistribution.receiptPublications,
      });
    }),
  );

  it.effect("still publishes the distribution install selects for an undeclared one", () =>
    Effect.gen(function* () {
      const measured = yield* forkApplied({ enable: true });
      expect(measured.outcome).toBe("applied");
      expect(measured.settings).toBe(
        published(measured.seeded, { source: "workspace", distribution: selected }),
      );
      expect(measured.work).toEqual(before.selectedDistribution);
    }),
  );

  // The fork's final declaration re-asserts the distribution it read while
  // preparing, so the shorthand is what remains.
  it.effect("still writes the selected form of a shorthand declared distribution", () =>
    Effect.gen(function* () {
      const measured = yield* forkApplied({ enable: true, declared: { distribution: shorthand } });
      expect(measured.outcome).toBe("applied");
      expect(measured.settings).toBe(
        published(measured.seeded, { distribution: shorthand, source: "workspace" }),
      );
      expect(measured.work).toEqual(before.shorthandDistribution);
    }),
  );

  it.effect("runs no install and gains no settings work for a disabled fork", () =>
    Effect.gen(function* () {
      const measured = yield* forkApplied({ enable: false });
      expect(measured.outcome).toBe("applied");
      expect(measured.settings).toBe(
        published(measured.seeded, { source: "workspace", enabled: false }),
      );
      expect(measured.work).toEqual(before.disabled);
    }),
  );
});
