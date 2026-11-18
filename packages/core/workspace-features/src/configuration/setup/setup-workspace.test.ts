/**
 * How often one setup run reads the project settings. Setup decides from a
 * live read whether an existing project has an instruction choice to settle;
 * where it then settles nothing under a transaction, that same read is what
 * the initialization step works from. A run that settles the choice re-reads
 * under the workspace transaction instead.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach } from "vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { Settings } from "@agentxm/workspace-kernel/workspace-state";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { bootstrapWorkspace, setupCompletesInstructionChoice } from "./initialization.js";
import { SetupWorkspace, type SetupWorkspaceRequest } from "./setup-workspace.js";
import { setupWorkspaceTestLayer } from "./test-helpers.js";

const initialized = {
  "axm.json": JSON.stringify({
    agents: ["claude-code"],
    skills: {},
    instructionFiles: { fileName: "AGENTS.md" },
  }),
  "axm.lock": "version = 1\n",
  "AGENTS.md": "# Team instructions\n",
};

/** A workspace as an unattended first install leaves it: no instruction choice recorded. */
const undecided = {
  "axm.json": JSON.stringify({ agents: ["claude-code"], skills: {} }),
  "axm.lock": "version = 1\n",
  "CLAUDE.md": "# Team instructions\n",
};

/** The native platform, with its filesystem recorded. */
const recordingPlatform = Layer.merge(
  NativePlatformTest,
  layerRecordingFileSystem(NativePlatformTest),
);

const request = (
  root: string,
  overrides: Partial<Omit<SetupWorkspaceRequest, "projectRoot">> = {},
): SetupWorkspaceRequest => ({
  scope: "project",
  scopeExplicit: true,
  yes: true,
  nonInteractive: true,
  ...overrides,
  projectRoot: decodeAbsolutePathSync(root),
  telemetryEnabled: false,
});

/**
 * Settle the request, then count only what previewOrApply does with the
 * project settings. `beforeApply` changes the directory between the two.
 */
const observeSetup = (
  fixture: SetupFixture,
  setupRequest: SetupWorkspaceRequest,
  beforeApply: () => void = () => undefined,
) =>
  fixture
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const prepared = yield* SetupWorkspace.prepare(setupRequest);
        if (prepared._tag !== "SetupWorkspace") return yield* Effect.die("approval required");
        beforeApply();
        recording.reset();
        const observations = workObservations(false);
        const transition = yield* SetupWorkspace.previewOrApply(prepared).pipe(
          observations.provide,
        );
        return {
          transition,
          settingsReads: recording.contentReads(path.join(fixture.root, "axm.json")),
          settingsCalls: recording.counts(path.join(fixture.root, "axm.json")),
          settingsParses: observations.facts.filter((fact) => fact.kind === "axm.parse.settings")
            .length,
        };
      }).pipe(Effect.provide(setupWorkspaceTestLayer(setupRequest))),
    )
    .pipe(Effect.provide(recordingPlatform));

describe("setup settings reads", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixtureWith = (files?: Record<string, string>) => {
    const fixture = makeSetupFixture(files === undefined ? {} : { files });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("an initialized project is decided from one settings read", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(initialized);
      const before = fixture.snapshot();
      const observed = yield* observeSetup(fixture, request(fixture.root));
      expect(observed).toMatchObject({
        settingsReads: 1,
        settingsParses: 1,
        transition: { initialized: false, wouldInitialize: false, completed: false },
      });
      expect(observed.transition.settings.instructionFiles).toEqual({ fileName: "AGENTS.md" });
      expect(fixture.snapshot()).toEqual(before);
    }),
  );

  it.effect("a preview of an open instruction choice reads the settings once", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(undecided);
      const before = fixture.snapshot();
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(observed).toMatchObject({
        settingsReads: 1,
        settingsParses: 1,
        transition: { initialized: false, wouldInitialize: true, completed: false },
      });
      expect(observed.transition.settings.instructionFiles).toEqual({ fileName: "AGENTS.md" });
      expect(fixture.snapshot()).toEqual(before);
    }),
  );

  it.effect("settling an open instruction choice re-reads under the transaction", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(undecided);
      const observed = yield* observeSetup(fixture, request(fixture.root));
      // The decision read, then the transaction's own reads of the file.
      expect(observed).toMatchObject({
        settingsReads: 5,
        settingsParses: 2,
        transition: { initialized: false, completed: true },
      });
      expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
        instructionFiles: { fileName: "AGENTS.md" },
      });
    }),
  );

  it.effect("a first initialization keeps its own settings reads", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith();
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { agents: ["claude-code"] }),
      );
      expect(observed).toMatchObject({
        settingsReads: 1,
        settingsParses: 0,
        transition: { initialized: true },
      });
      expect(fixture.exists("axm.json")).toBe(true);
    }),
  );

  it.effect("settings removed after preparation are read again, not assumed", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(initialized);
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }), () =>
        fs.rmSync(path.join(fixture.root, "axm.json")),
      );
      // Each read checks for the file on its own; none is carried forward.
      expect(observed).toMatchObject({
        settingsCalls: { access: 2 },
        settingsReads: 0,
        settingsParses: 0,
        transition: { initialized: false, wouldInitialize: true },
      });
      expect(fixture.exists("axm.json")).toBe(false);
    }),
  );

  /** Run initialization over observed settings, counting its own reads of the file. */
  const bootstrapObserved = (
    fixture: SetupFixture,
    observe: (settings: Settings) => { readonly settingsPath: string; readonly settings: Settings },
  ) => {
    const options = request(fixture.root, { preview: true });
    const settingsPath = path.join(fixture.root, "axm.json");
    return fixture
      .provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          const decision = yield* setupCompletesInstructionChoice(options);
          expect(decision.completes).toBe(true);
          const settings = Option.getOrThrow(decision.settings);
          const copy = structuredClone(settings);
          recording.reset();
          const settled = yield* bootstrapWorkspace(options, observe(settings));
          return {
            settled,
            settings,
            copy,
            settingsReads: recording.contentReads(settingsPath),
          };
        }).pipe(Effect.provide(setupWorkspaceTestLayer(options))),
      )
      .pipe(Effect.provide(recordingPlatform));
  };

  it.effect("initialization leaves the observed settings value unchanged", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(undecided);
      const observed = yield* bootstrapObserved(fixture, (settings) => ({
        settingsPath: path.join(fixture.root, "axm.json"),
        settings,
      }));
      expect(observed.settingsReads).toBe(0);
      expect(observed.settled.settings.instructionFiles).toEqual({ fileName: "AGENTS.md" });
      expect(observed.settings).toEqual(observed.copy);
      expect(observed.settings.instructionFiles).toBeUndefined();
    }),
  );

  it.effect("settings observed at another path are read again", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith(undecided);
      const observed = yield* bootstrapObserved(fixture, (settings) => ({
        settingsPath: path.join(fixture.root, "nested", "axm.json"),
        settings: { ...settings, agents: ["cursor"] },
      }));
      expect(observed.settingsReads).toBe(1);
      expect(observed.settled.settings.agents).toEqual(["claude-code"]);
    }),
  );
});

describe("setup preparation over an observed settings absence", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const emptyFixture = () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);
    return fixture;
  };
  const projectSettingsPath = (fixture: SetupFixture) => path.join(fixture.root, "axm.json");
  const userSettingsPath = (fixture: SetupFixture) =>
    path.join(fixture.home, ".axm", "workspace", "axm.json");

  /** Prepare only, counting the filesystem calls naming the settings file. */
  const prepareCounting = (
    fixture: SetupFixture,
    setupRequest: SetupWorkspaceRequest,
    settingsPath: string,
  ) =>
    fixture
      .provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const prepared = yield* SetupWorkspace.prepare(setupRequest);
          if (prepared._tag !== "SetupWorkspace") return yield* Effect.die("approval required");
          return {
            settingsExist: prepared.settingsExist,
            settingsPath: prepared.settingsPath,
            settingsCalls: recording.counts(settingsPath),
          };
        }).pipe(Effect.provide(setupWorkspaceTestLayer(setupRequest))),
      )
      .pipe(Effect.provide(recordingPlatform));

  /** A first-use request: interactive, nothing approved in advance. */
  const firstUseRequest = (
    root: string,
    overrides: Partial<Omit<SetupWorkspaceRequest, "projectRoot">> = {},
  ): SetupWorkspaceRequest => ({
    scope: "project",
    agents: ["codex"],
    nonInteractive: false,
    ...overrides,
    projectRoot: decodeAbsolutePathSync(root),
    telemetryEnabled: false,
  });

  it.effect("takes the absence observed at the same project path instead of probing", () =>
    Effect.gen(function* () {
      const fixture = emptyFixture();
      const settingsPath = projectSettingsPath(fixture);
      const prepared = yield* prepareCounting(
        fixture,
        firstUseRequest(fixture.root, { observedSettings: { settingsPath, exists: false } }),
        settingsPath,
      );
      expect(prepared).toEqual({ settingsExist: false, settingsPath, settingsCalls: {} });
    }),
  );

  it.effect("takes the absence observed at the same user path instead of probing", () =>
    Effect.gen(function* () {
      const fixture = emptyFixture();
      const settingsPath = userSettingsPath(fixture);
      const prepared = yield* prepareCounting(
        fixture,
        firstUseRequest(fixture.root, {
          scope: "user",
          observedSettings: { settingsPath, exists: false },
        }),
        settingsPath,
      );
      expect(prepared).toEqual({ settingsExist: false, settingsPath, settingsCalls: {} });
    }),
  );

  it.effect("probes the settings when no absence was observed", () =>
    Effect.gen(function* () {
      const fixture = emptyFixture();
      const settingsPath = projectSettingsPath(fixture);
      const prepared = yield* prepareCounting(fixture, firstUseRequest(fixture.root), settingsPath);
      expect(prepared).toEqual({
        settingsExist: false,
        settingsPath,
        settingsCalls: { access: 1 },
      });
    }),
  );

  it.effect("probes the settings when the absence was observed at another path", () =>
    Effect.gen(function* () {
      const fixture = fixtureWithSettings();
      const settingsPath = projectSettingsPath(fixture);
      const prepared = yield* prepareCounting(
        fixture,
        firstUseRequest(fixture.root, {
          observedSettings: {
            settingsPath: path.join(fixture.root, "nested", "axm.json"),
            exists: false,
          },
        }),
        settingsPath,
      );
      // The existing settings are found, not assumed absent.
      expect(prepared).toEqual({ settingsExist: true, settingsPath, settingsCalls: { access: 1 } });
    }),
  );

  it.effect("keeps every settings check of the setup transaction", () =>
    Effect.gen(function* () {
      const run = (observe: boolean) =>
        Effect.gen(function* () {
          const fixture = emptyFixture();
          const settingsPath = projectSettingsPath(fixture);
          const setupRequest = request(fixture.root, {
            agents: ["codex"],
            ...(observe ? { observedSettings: { settingsPath, exists: false as const } } : {}),
          });
          return yield* fixture
            .provide(
              Effect.gen(function* () {
                const recording = yield* FileSystemRecorder;
                recording.reset();
                const prepared = yield* SetupWorkspace.prepare(setupRequest);
                if (prepared._tag !== "SetupWorkspace")
                  return yield* Effect.die("approval required");
                const transition = yield* SetupWorkspace.previewOrApply(prepared);
                return {
                  initialized: transition.initialized,
                  settingsCalls: recording.counts(settingsPath),
                  settings: JSON.parse(fixture.readFile("axm.json")),
                };
              }).pipe(Effect.provide(setupWorkspaceTestLayer(setupRequest))),
            )
            .pipe(Effect.provide(recordingPlatform));
        });
      const probed = yield* run(false);
      const observed = yield* run(true);

      expect(observed.initialized).toBe(true);
      expect(observed.settings).toEqual(probed.settings);
      expect(observed.settings.agents).toEqual(["codex"]);
      // Only preparation's probe is gone; the transaction's own checks stay.
      expect(observed.settingsCalls).toEqual({
        ...probed.settingsCalls,
        access: (probed.settingsCalls.access ?? 0) - 1,
      });
    }),
  );

  const fixtureWithSettings = () => {
    const fixture = makeSetupFixture({ files: initialized });
    cleanups.push(fixture.cleanup);
    return fixture;
  };
});
