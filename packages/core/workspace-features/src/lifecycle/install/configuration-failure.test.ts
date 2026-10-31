import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";

import { configuredUpdateRequest } from "../update/test-helpers.js";
import { UpdateExtensions } from "../update/update-extensions.js";
import { InstallExtensions } from "./install-extensions.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";

const registry = {
  name: "test",
  type: "registry",
  location: "https://registry.example.test",
};

it.effect.each([
  { type: "skill", plural: "skills" },
  { type: "subagent", plural: "subagents" },
  { type: "pack", plural: "packs" },
] as const)(
  "preserves cache configuration failure during $type installation",
  ({ type, plural }) => {
    const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
    const { workspace, cleanup } = makeInstallWorld({
      settings: { sources: [registry] },
      configureConfigProvider: (original) =>
        ConfigProvider.make((path) =>
          path[0] === "XDG_CACHE_HOME" ? Effect.fail(sourceError) : original.load(path),
        ),
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();
          const failure = yield* InstallExtensions.prepare(
            installRequest({
              type,
              subject: { kind: "source", source: `test:@acme/${plural}/review` },
            }),
          ).pipe(Effect.flip);
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

it.effect.each([
  { type: "skill", plural: "skills" },
  { type: "subagent", plural: "subagents" },
] as const)(
  "does not turn failed cache configuration into a blocked $plural unit",
  ({ type, plural }) => {
    const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
    const { workspace, cleanup } = makeInstallWorld({
      settings: {
        sources: [registry],
        [plural]: { review: `test:@acme/${plural}/review` },
      },
      configureConfigProvider: (original) =>
        ConfigProvider.make((path) =>
          path[0] === "XDG_CACHE_HOME" ? Effect.fail(sourceError) : original.load(path),
        ),
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();
          const failure = yield* UpdateExtensions.prepare(
            configuredUpdateRequest({ type, nameFilters: ["review"] }),
          ).pipe(Effect.flip);
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);
