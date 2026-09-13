import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import {
  ScriptExecutableInstaller,
  ScriptReleaseAssets,
  UpgradeExecutionObserver,
} from "../../application/index.js";
import { makeScriptExecutableInstaller } from "../../adapters/native/script-installer/index.js";
import { makeScriptReleaseAssets } from "../../adapters/native/script-installer/assets.js";
import { Subprocess } from "../../adapters/native/subprocess/subprocess.js";

export const ScriptInstallationLive = Layer.mergeAll(
  Layer.effect(
    ScriptReleaseAssets,
    Effect.gen(function* () {
      return makeScriptReleaseAssets(
        yield* HttpClient.HttpClient,
        (yield* UpgradeExecutionObserver).download,
      );
    }),
  ),
  Layer.effect(
    ScriptExecutableInstaller,
    Effect.gen(function* () {
      return makeScriptExecutableInstaller(
        yield* FileSystem.FileSystem,
        yield* Path.Path,
        yield* Subprocess,
        (yield* UpgradeExecutionObserver).command,
      );
    }),
  ),
);
