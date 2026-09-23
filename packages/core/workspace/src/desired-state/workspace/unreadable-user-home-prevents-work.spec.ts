import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

import { prepareSetupWorkspace } from "../../configuration/setup/setup-workspace.js";
import { WorkspaceLocationLive } from "../live.js";
import { WorkspaceLocation } from "./location.js";

export const specification = defineSpecification({
  requirement: "cli/workspace/unreadable-user-home-prevents-work",
  title: "Unreadable user-home configuration blocks workspace work",
  statement:
    "When AXM's user-home configuration source cannot be read, workspace location and setup preparation shall return the configuration failure before inspecting or modifying workspace files, without falling back to a different user home.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace home configuration", () => {
  for (const scope of ["project", "user"] as const) {
    it.effect(`stops ${scope} location and setup before workspace I/O`, () =>
      Effect.gen(function* () {
        const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
        const observations: string[] = [];
        const platform = Layer.mergeAll(
          Path.layer,
          ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
          FileSystem.layerNoop({
            exists: (path) =>
              Effect.sync(() => {
                observations.push(path);
                return false;
              }),
            readFileString: (path) =>
              Effect.sync(() => {
                observations.push(path);
                return "";
              }),
            makeDirectory: (path) =>
              Effect.sync(() => {
                observations.push(path);
              }),
            writeFileString: (path) =>
              Effect.sync(() => {
                observations.push(path);
              }),
          }),
        );
        const options = {
          scope,
          projectRoot: decodeAbsolutePathSync("/workspace"),
          nonInteractive: true,
          telemetryEnabled: false,
          yes: true,
          agents: ["claude-code"],
        };
        const location = WorkspaceLocation.pipe(
          Effect.provide(WorkspaceLocationLive(options)),
          Effect.asVoid,
        );
        const failures = [
          yield* location.pipe(Effect.provide(platform), Effect.flip),
          yield* prepareSetupWorkspace(options).pipe(Effect.provide(platform), Effect.flip),
        ];
        for (const failure of failures) {
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
        }
        expect(observations).toEqual([]);
      }),
    );
  }
});
