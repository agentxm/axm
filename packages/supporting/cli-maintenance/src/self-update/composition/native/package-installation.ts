import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import {
  InstallationRecorder,
  PackageInstaller,
  UpgradeExecutionObserver,
} from "../../application/index.js";
import { InstallMeta } from "../../adapters/native/install-meta/install-meta.js";
import { Subprocess } from "../../adapters/native/subprocess/subprocess.js";
import {
  makeInstallationRecorder,
  makePackageInstaller,
} from "../../adapters/native/package-installers/index.js";

/** Select native installer protocols and metadata persistence once per invocation. */
export const PackageInstallationLive = Layer.mergeAll(
  Layer.effect(
    PackageInstaller,
    Effect.gen(function* () {
      return makePackageInstaller(
        yield* Subprocess,
        yield* Path.Path,
        (yield* UpgradeExecutionObserver).command,
      );
    }),
  ),
  Layer.effect(InstallationRecorder, Effect.map(InstallMeta, makeInstallationRecorder)),
);
