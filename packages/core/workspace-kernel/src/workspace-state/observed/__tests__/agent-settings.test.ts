/**
 * Agent-settings scanner: covers per-agent native settings files
 * (`.claude/settings.json`, etc.). Each occurrence carries
 * `agent-settings(agentId)` origins.
 */

import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentSettingsScanner } from "../scanners/agent-settings.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: typeof AGENT_DESCRIPTORS },
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeAgentSettingsScanner(
      options?.agentRegistry === undefined
        ? {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
          }
        : {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
            agentRegistry: options.agentRegistry,
          },
    );
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

layer(Path.layer, { excludeTestServices: true })("agent-settings scanner", (it) => {
  it.effect("emits no occurrences when no agent settings file exists", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }),
  );

  it.effect("emits one occurrence per agent settings.json", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "valid", contents: { theme: "dark" } },
          },
        },
      });
      const claude = occurrences.filter((o) => o.agentId === "claude-code");
      expect(claude).toHaveLength(1);
      expect(claude[0]?._tag).toBe("agent-settings");
      expect(claude[0]?.scope).toBe("project");
      expect(claude[0]?.contentLocation).toBe("/ws/.claude/settings.json");
    }),
  );

  it.effect("emits multiple occurrences when multiple agents have settings", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "valid", contents: {} },
            cursor: { _tag: "valid", contents: {} },
            codex: { _tag: "valid", contents: {} },
          },
        },
      });
      const observed = occurrences.filter((o) =>
        new Set<string>(["claude-code", "cursor", "codex"]).has(o.agentId),
      );
      expect(observed).toHaveLength(3);
      const ids = observed.map((o) => o.agentId).sort();
      expect(ids).toEqual(["claude-code", "codex", "cursor"]);
    }),
  );

  it.effect("does not parse the settings file (Phase 8 owns that)", () =>
    Effect.gen(function* () {
      // A byte-corrupt agent settings file SHALL still emit an occurrence —
      // the scanner reports presence, not validity.
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "byteCorrupt", bytes: "{ not json" },
          },
        },
      });
      const claude = occurrences.filter((o) => o.agentId === "claude-code");
      expect(claude).toHaveLength(1);
    }),
  );

  describe("agents sharing a root directory", () => {
    const sharedPath = "/ws/.qoder/settings.json";
    // Descriptors that do not opt out of native-config scanning.
    const scannedDescriptors = Object.values(AGENT_DESCRIPTORS).filter(
      (descriptor) => typeof descriptor.rootDir === "string" || !("rootDir" in descriptor),
    );

    const runRecorded = (
      project: NonNullable<Parameters<typeof buildFixture>[0]["project"]>,
      failAccessAt?: string,
    ) =>
      Effect.gen(function* () {
        const deps = yield* buildFixture({
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project,
        });
        const base: FileSystem.FileSystem =
          failAccessAt === undefined
            ? deps.fs
            : {
                ...deps.fs,
                access: (path, options) =>
                  path === failAccessAt
                    ? Effect.fail(
                        PlatformError.systemError({
                          _tag: "PermissionDenied",
                          module: "FileSystem",
                          method: "access",
                          pathOrDescriptor: path,
                        }),
                      )
                    : deps.fs.access(path, options),
              };
        const { fileSystem, recording } = makeRecordingFileSystem(base);
        const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
        recording.reset();
        const occurrences = yield* makeAgentSettingsScanner({
          fs: fileSystem,
          path: deps.path,
          workspaceRoot: WORKSPACE_ROOT,
          scope: "project",
          diagnostics: makeDiagnostics(ref),
        });
        return { occurrences, warnings: yield* Ref.get(ref), recording };
      });

    it.effect("probes a settings path declared by two agents once per scan", () =>
      Effect.gen(function* () {
        // 54 scanned descriptors declare 53 distinct settings paths: only
        // qoder and qoder-cn share one.
        expect(scannedDescriptors).toHaveLength(54);
        const { occurrences, warnings, recording } = yield* runRecorded({
          agentSettings: { qoder: { _tag: "valid", contents: {} } },
        });
        expect(recording.counts(sharedPath)).toEqual({ access: 1 });
        expect(recording.calls({ method: "access" })).toHaveLength(53);
        expect(recording.calls()).toHaveLength(53);
        expect(
          occurrences
            .filter((occurrence) => occurrence.contentLocation === sharedPath)
            .map((occurrence) => occurrence.agentId),
        ).toEqual(["qoder", "qoder-cn"]);
        expect(occurrences).toHaveLength(2);
        expect(warnings).toEqual([]);
      }),
    );

    it.effect("reports a failed shared probe once for each agent that declares it", () =>
      Effect.gen(function* () {
        const { occurrences, warnings, recording } = yield* runRecorded(
          { agentSettings: { qoder: { _tag: "valid", contents: {} } } },
          sharedPath,
        );
        expect(occurrences).toEqual([]);
        expect(warnings).toEqual([
          {
            source: "scanner",
            message: `agent-settings: cannot stat ${sharedPath}`,
            path: sharedPath,
            code: "scanner-io",
          },
          {
            source: "scanner",
            message: `agent-settings: cannot stat ${sharedPath}`,
            path: sharedPath,
            code: "scanner-io",
          },
        ]);
        expect(recording.counts(sharedPath)).toEqual({ access: 1 });
      }),
    );

    const scanTwiceAround = (workspaceRoot: string) =>
      Effect.gen(function* () {
        const settingsPath = nodePath.join(workspaceRoot, ".qoder", "settings.json");
        const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
        const path = yield* Path.Path;
        const base = yield* FileSystem.FileSystem;
        const { fileSystem, recording } = makeRecordingFileSystem(base);
        const scan = makeAgentSettingsScanner({
          fs: fileSystem,
          path,
          workspaceRoot,
          scope: "project",
          diagnostics: makeDiagnostics(ref),
        });
        const agentIds = (occurrences: ReadonlyArray<{ readonly agentId: string }>) =>
          occurrences.map((occurrence) => occurrence.agentId);

        const first = yield* scan;
        expect(recording.counts(settingsPath)).toEqual({ access: 1 });
        expect(agentIds(first)).toEqual([]);

        recording.reset();
        nodeFs.mkdirSync(nodePath.dirname(settingsPath), { recursive: true });
        nodeFs.writeFileSync(settingsPath, "{}");
        const second = yield* scan;

        expect(recording.counts(settingsPath)).toEqual({ access: 1 });
        expect(agentIds(second)).toEqual(["qoder", "qoder-cn"]);
        expect(second.map((occurrence) => occurrence.contentLocation)).toEqual([
          settingsPath,
          settingsPath,
        ]);
        expect(yield* Ref.get(ref)).toEqual([]);
      });

    it.effect("probes the shared path again in a later scan and sees a newly created file", () =>
      Effect.acquireUseRelease(
        Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "agent-settings-shared-"))),
        (workspaceRoot) => scanTwiceAround(workspaceRoot),
        (workspaceRoot) =>
          Effect.sync(() => nodeFs.rmSync(workspaceRoot, { recursive: true, force: true })),
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    );

    it.effect("an absent shared settings file yields nothing after one probe", () =>
      Effect.gen(function* () {
        const { occurrences, warnings, recording } = yield* runRecorded({});
        expect(occurrences).toEqual([]);
        expect(warnings).toEqual([]);
        expect(recording.counts(sharedPath)).toEqual({ access: 1 });
      }),
    );
  });

  it.effect("user scope is stamped onto every occurrence", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: { "claude-code": { _tag: "valid", contents: {} } },
        },
      });
      const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const occurrences = yield* makeAgentSettingsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: WORKSPACE_ROOT,
        scope: "user",
        diagnostics: makeDiagnostics(ref),
      });
      expect(occurrences.every((o) => o.scope === "user")).toBe(true);
    }),
  );
});
