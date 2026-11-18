/**
 * Workspace location construction reads each authoritative document at most
 * once per logical scope, while every document a construction needs is still
 * read from disk and later readers of the constructed location stay fresh.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { workObservations } from "../../locations/testing.js";
import { LOCKFILE_VERSION } from "../desired/lockfile/schema.js";
import type { WorkspaceStateOptions } from "./contracts.js";
import { makeWorkspaceLocation } from "./location.js";
import { readSettingsCell } from "./state-cells.js";

const validLock = `version = ${LOCKFILE_VERSION}\n`;
const newerLock = `version = ${LOCKFILE_VERSION + 1}\n`;

/** A real project root and user home; documents are written only where a case asks. */
const fixture = (documents: {
  readonly projectSettings?: string;
  readonly projectLock?: string;
  readonly userSettings?: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temp = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "axm-location-" }));
    const projectRoot = path.join(temp, "project");
    const home = path.join(temp, "home");
    const userWorkspace = path.join(home, ".axm", "workspace");
    yield* fs.makeDirectory(projectRoot, { recursive: true });
    yield* fs.makeDirectory(userWorkspace, { recursive: true });
    const paths = {
      projectRoot,
      home,
      projectSettings: path.join(projectRoot, "axm.json"),
      projectLock: path.join(projectRoot, "axm.lock"),
      userSettings: path.join(userWorkspace, "axm.json"),
    };
    if (documents.projectSettings !== undefined)
      yield* fs.writeFileString(paths.projectSettings, documents.projectSettings);
    if (documents.projectLock !== undefined)
      yield* fs.writeFileString(paths.projectLock, documents.projectLock);
    if (documents.userSettings !== undefined)
      yield* fs.writeFileString(paths.userSettings, documents.userSettings);
    return paths;
  });

/** Construct the location with the user home configured, recording logical work. */
const construct = (
  home: string,
  options: Omit<WorkspaceStateOptions, "scope" | "projectRoot">,
  projectRoot: string,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const observations = workObservations(false);
    const exit = yield* makeWorkspaceLocation({
      ...options,
      scope: "project",
      projectRoot: decodeAbsolutePathSync(projectRoot),
    }).pipe(
      observations.provide,
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
      ),
      Effect.exit,
    );
    const work = (kind: string) => observations.facts.filter((fact) => fact.kind === kind).length;
    return { exit, recording, work };
  });

const recorded = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | FileSystemRecorder | Scope.Scope>,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

describe("workspace location construction", () => {
  it.effect(
    "reads the selected settings and lockfile once and the other scope's settings once",
    () =>
      recorded(
        Effect.gen(function* () {
          const paths = yield* fixture({
            projectSettings: JSON.stringify({ agents: ["claude-code"] }),
            projectLock: validLock,
            userSettings: JSON.stringify({ agents: ["codex"] }),
          });
          const { exit, recording, work } = yield* construct(paths.home, {}, paths.projectRoot);
          expect(exit._tag).toBe("Success");
          expect(recording.contentReads(paths.projectSettings)).toBe(1);
          expect(recording.counts(paths.projectSettings).access).toBe(1);
          expect(recording.contentReads(paths.userSettings)).toBe(1);
          expect(recording.contentReads(paths.projectLock)).toBe(1);
          expect(work("axm.parse.settings")).toBe(2);
          expect(work("axm.parse.lockfile")).toBe(1);
        }),
      ),
  );

  it.effect("reads the lockfile once when first use supplies settings", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ projectLock: validLock });
        const { exit, recording, work } = yield* construct(
          paths.home,
          { initialSettings: { agents: ["claude-code"] } },
          paths.projectRoot,
        );
        expect(exit._tag).toBe("Success");
        expect(recording.contentReads(paths.projectLock)).toBe(1);
        expect(work("axm.parse.lockfile")).toBe(1);
        expect(recording.contentReads(paths.projectSettings)).toBe(0);
      }),
    ),
  );

  it.effect("reads layout settings only when the workspace may be uninitialized", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({
          projectSettings: JSON.stringify({ agents: ["claude-code"] }),
          projectLock: validLock,
          userSettings: JSON.stringify({ agents: ["codex"] }),
        });
        const { exit, recording, work } = yield* construct(
          paths.home,
          { allowUninitialized: true },
          paths.projectRoot,
        );
        expect(exit._tag).toBe("Success");
        expect(recording.contentReads(paths.projectSettings)).toBe(1);
        expect(recording.contentReads(paths.userSettings)).toBe(1);
        expect(recording.calls({ path: paths.projectLock })).toEqual([]);
        expect(work("axm.parse.settings")).toBe(2);
        expect(work("axm.parse.lockfile")).toBe(0);
      }),
    ),
  );

  it.effect(
    "keeps project and user documents separate when their runtime directories coincide",
    () =>
      recorded(
        Effect.gen(function* () {
          const paths = yield* fixture({
            userSettings: JSON.stringify({ agents: ["claude-code"] }),
          });
          const path = yield* Path.Path;
          const userWorkspace = path.dirname(paths.userSettings);
          const { exit, recording, work } = yield* construct(paths.home, {}, userWorkspace);
          expect(exit._tag).toBe("Success");
          if (exit._tag === "Success") {
            expect(exit.value.projectRuntimeDir).toBe(exit.value.userRuntimeDir);
          }
          // One decode for the project scope and one for the user scope of the same file.
          expect(recording.contentReads(paths.userSettings)).toBe(2);
          expect(work("axm.parse.settings")).toBe(2);
        }),
      ),
  );

  it.effect("refuses an uninitialized workspace", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ projectLock: validLock });
        const { exit } = yield* construct(paths.home, {}, paths.projectRoot);
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [
              { error: { _tag: "WorkspaceNotInitialized", settingsPath: paths.projectSettings } },
            ],
          },
        });
      }),
    ),
  );

  it.effect("refuses a newer lockfile beside absent settings as a newer-version refusal", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ projectLock: newerLock });
        const { exit, recording } = yield* construct(paths.home, {}, paths.projectRoot);
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [
              {
                error: {
                  _tag: "LockfileVersionUnsupported",
                  path: paths.projectLock,
                  observedVersion: LOCKFILE_VERSION + 1,
                },
              },
            ],
          },
        });
        expect(recording.contentReads(paths.projectLock)).toBe(1);
      }),
    ),
  );

  it.effect("refuses a newer lockfile at the first read when first use supplies settings", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ projectLock: newerLock });
        const { exit, recording, work } = yield* construct(
          paths.home,
          { initialSettings: { agents: ["claude-code"] } },
          paths.projectRoot,
        );
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: { reasons: [{ error: { _tag: "LockfileVersionUnsupported" } }] },
        });
        expect(recording.contentReads(paths.projectLock)).toBe(1);
        // The refusal precedes every settings read.
        expect(recording.calls({ path: paths.projectSettings })).toEqual([]);
        expect(work("axm.parse.settings")).toBe(0);
      }),
    ),
  );

  it.effect("fails malformed selected settings with the settings read error of that file", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ projectSettings: "{", projectLock: validLock });
        const { exit } = yield* construct(paths.home, {}, paths.projectRoot);
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [{ error: { _tag: "SettingsParseError", path: paths.projectSettings } }],
          },
        });
      }),
    ),
  );

  it.effect("leaves later readers of the constructed location reading fresh documents", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const paths = yield* fixture({
          projectSettings: JSON.stringify({ agents: ["claude-code"] }),
          projectLock: validLock,
        });
        const { exit } = yield* construct(paths.home, {}, paths.projectRoot);
        if (exit._tag !== "Success") return yield* Effect.die("Expected a constructed location");
        const location = exit.value;
        yield* fs.writeFileString(paths.projectSettings, JSON.stringify({ agents: ["codex"] }));
        const settings = yield* readSettingsCell(location, location.runtimeDir);
        expect(Option.map(settings, (value) => value.agents)).toEqual(Option.some(["codex"]));
      }),
    ),
  );
});
