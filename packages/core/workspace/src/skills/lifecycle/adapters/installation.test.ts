import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { createDefaultSettings } from "../../../desired-state/index.js";
import { WorkspaceReadTest } from "../../../desired-state/testing.js";
import { skillInstallationFacts } from "./installation.js";

it.effect("does not treat failed cache configuration as absent release-age evidence", () =>
  Effect.gen(function* () {
    const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
    let requests = 0;
    const name = decodeExtensionNameSync("review");
    const failure = yield* skillInstallationFacts
      .releaseAge({
        type: "skill",
        refType: "registry",
        owner: decodeHandleSync("@example"),
        name,
        version: decodeVersionSync("1.2.0"),
        integrity: Option.none(),
        publisherBindingId: "hbnd_example",
        packages: [],
        source: {
          type: "registry",
          name: "example",
          location: new URL("https://registry.example.test"),
          owner: Option.none(),
        },
        skill: { name, description: Option.none(), metadata: Option.none() },
      })
      .pipe(
        Effect.provide(
          Layer.mergeAll(
            Path.layer,
            FileSystem.layerNoop({}),
            WorkspaceReadTest({
              baseDir: "/workspace",
              settings: { ...createDefaultSettings(), minimumReleaseAge: "24h" },
            }),
            ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make(() =>
                Effect.sync(() => {
                  requests += 1;
                }).pipe(Effect.andThen(Effect.die("Unexpected request"))),
              ),
            ),
          ),
        ),
        Effect.flip,
      );
    expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
    expect(requests).toBe(0);
  }),
);
