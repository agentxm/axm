import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/unstable/http/HttpClient";
import {
  ScriptExecutableInstaller,
  ScriptReleaseAssets,
} from "@agentxm/cli-maintenance/self-update/application";
import { makeScriptExecutableInstaller } from "../adapters/script-installer/index.js";
import { makeScriptReleaseAssets } from "../adapters/script-installer/assets.js";
import { Subprocess } from "../subprocess/subprocess.js";

export const ScriptInstallationLive = Layer.mergeAll(
  Layer.effect(ScriptReleaseAssets, Effect.map(HttpClient.HttpClient, makeScriptReleaseAssets)),
  Layer.effect(
    ScriptExecutableInstaller,
    Effect.gen(function* () {
      return makeScriptExecutableInstaller(
        yield* FileSystem.FileSystem,
        yield* Path.Path,
        yield* Subprocess,
        yield* Ref.make(0),
      );
    }),
  ),
);
