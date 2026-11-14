/**
 * Registry selection reads the project and user settings once: the documents
 * its own workspace location construction decoded are the snapshot.
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
import * as Result from "effect/Result";

import * as Schema from "effect/Schema";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { workObservations } from "../locations/testing.js";
import { SettingsSchema, type SourceHostConfig } from "./desired/settings/index.js";
import { readProjectSourceConfiguration } from "./live.js";
import { selectRegistry } from "./workspace/registry-selection.js";

const builtInSources: ReadonlyArray<SourceHostConfig> = [
  {
    name: "agentxm",
    type: "registry",
    location: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
  },
];

const corp = { name: "corp", type: "registry", location: "https://registry.corp.test/" };

const decoded = (value: unknown) => Schema.decodeUnknownSync(SettingsSchema)(value);

const fixture = (documents: { readonly project?: unknown; readonly user?: unknown }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temp = yield* fs.realPath(
      yield* fs.makeTempDirectoryScoped({ prefix: "axm-selection-" }),
    );
    const projectRoot = path.join(temp, "project");
    const home = path.join(temp, "home");
    const userWorkspace = path.join(home, ".axm", "workspace");
    yield* fs.makeDirectory(projectRoot, { recursive: true });
    yield* fs.makeDirectory(userWorkspace, { recursive: true });
    const paths = {
      projectRoot,
      home,
      projectSettings: path.join(projectRoot, "axm.json"),
      userSettings: path.join(userWorkspace, "axm.json"),
    };
    if (documents.project !== undefined)
      yield* fs.writeFileString(
        paths.projectSettings,
        typeof documents.project === "string"
          ? documents.project
          : JSON.stringify(documents.project),
      );
    if (documents.user !== undefined)
      yield* fs.writeFileString(paths.userSettings, JSON.stringify(documents.user));
    return paths;
  });

const readSelection = (paths: { readonly projectRoot: string; readonly home: string }) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const observations = workObservations(false);
    const exit = yield* readProjectSourceConfiguration({
      projectRoot: decodeAbsolutePathSync(paths.projectRoot),
      builtInSources,
    }).pipe(
      observations.provide,
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: paths.home } })),
      ),
      Effect.exit,
    );
    const parses = observations.facts.filter((fact) => fact.kind === "axm.parse.settings").length;
    return { exit, recording, parses };
  });

const recorded = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | FileSystemRecorder | Scope.Scope>,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

describe("readProjectSourceConfiguration", () => {
  it.effect("reads project settings once and probes absent user settings once", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: { agents: ["claude-code"] } });
        const { exit, recording, parses } = yield* readSelection(paths);
        expect(exit._tag).toBe("Success");
        if (exit._tag === "Success") {
          expect(exit.value).toEqual({
            project: { path: paths.projectSettings, settings: { agents: ["claude-code"] } },
            user: { path: paths.userSettings, settings: {} },
            builtInSources,
          });
        }
        expect(recording.contentReads(paths.projectSettings)).toBe(1);
        expect(recording.counts(paths.userSettings).access).toBe(1);
        expect(recording.contentReads(paths.userSettings)).toBe(0);
        expect(parses).toBe(1);
      }),
    ),
  );

  it.effect("reads present user settings once", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({
          project: { agents: ["claude-code"] },
          user: { defaultRegistry: "corp", sources: [corp] },
        });
        const { exit, recording, parses } = yield* readSelection(paths);
        expect(exit._tag).toBe("Success");
        if (exit._tag === "Success") {
          expect(exit.value.user).toEqual({
            path: paths.userSettings,
            settings: decoded({ defaultRegistry: "corp", sources: [corp] }),
          });
        }
        expect(recording.contentReads(paths.projectSettings)).toBe(1);
        expect(recording.contentReads(paths.userSettings)).toBe(1);
        expect(parses).toBe(2);
      }),
    ),
  );

  it.effect("fails malformed project settings with that file's settings read error", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: "{", user: {} });
        const { exit, recording } = yield* readSelection(paths);
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [{ error: { _tag: "SettingsParseError", path: paths.projectSettings } }],
          },
        });
        // The project document fails first; the user document is not read.
        expect(recording.calls({ path: paths.userSettings })).toEqual([]);
      }),
    ),
  );

  it.effect("selects the default Registry from project, then user, then built-in settings", () =>
    recorded(
      Effect.gen(function* () {
        const cases = [
          {
            documents: {
              project: { defaultRegistry: "corp", sources: [corp] },
              user: { defaultRegistry: "agentxm" },
            },
            reason: "project-default",
          },
          {
            documents: { project: {}, user: { defaultRegistry: "corp", sources: [corp] } },
            reason: "user-default",
          },
          { documents: {}, reason: "built-in" },
        ];
        for (const { documents, reason } of cases) {
          const paths = yield* fixture(documents);
          const { exit } = yield* readSelection(paths);
          if (exit._tag !== "Success") return yield* Effect.die("Expected a selection snapshot");
          const bound = selectRegistry(exit.value, Option.none());
          expect(Result.map(bound, (value) => value.reason)).toEqual(Result.succeed(reason));
        }
      }),
    ),
  );
});
