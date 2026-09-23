import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { SelectiveUpdate } from "../update/selective/use-case.js";
import { InstallExtensions } from "./install-extensions.js";
import { installRequest, makeInstallWorld } from "./test-helpers.js";

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
    const { workspace, cleanup } = makeInstallWorld({ settings: { sources: [registry] } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
          const original = yield* ConfigProvider.ConfigProvider;
          const provider = ConfigProvider.make((path) =>
            path[0] === "XDG_CACHE_HOME" ? Effect.fail(sourceError) : original.load(path),
          );
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();
          const failure = yield* InstallExtensions.prepare(
            installRequest({
              type,
              subject: { kind: "source", source: `test:@acme/${plural}/review` },
            }),
          ).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider), Effect.flip);
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
  },
);

it.effect.each([
  { kind: "selective-skills", plural: "skills" },
  { kind: "selective-subagents", plural: "subagents" },
] as const)("does not turn failed cache configuration into skipped $plural", ({ kind, plural }) => {
  const { workspace, cleanup } = makeInstallWorld({
    settings: {
      sources: [registry],
      [plural]: { review: `test:@acme/${plural}/review` },
    },
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
        const original = yield* ConfigProvider.ConfigProvider;
        const provider = ConfigProvider.make((path) =>
          path[0] === "XDG_CACHE_HOME" ? Effect.fail(sourceError) : original.load(path),
        );
        const before = workspace.snapshot();
        const homeBefore = workspace.homeSnapshot();
        const failure = yield* SelectiveUpdate.prepare({
          kind,
          source: Option.none(),
          nameFilters: ["review"],
          nameFilterFlag: "--name",
          ignoreVersionConstraints: false,
        }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider), Effect.flip);
        expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.homeSnapshot()).toEqual(homeBefore);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});
