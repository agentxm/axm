import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  InstallationRecorder,
  PackageInstaller,
  UpgradeExecutionObserver,
} from "@agentxm/cli-maintenance/self-update/application";
import { InstallMeta } from "../install-meta/install-meta.js";
import { Subprocess } from "../subprocess/subprocess.js";
import {
  makeInstallationRecorder,
  makePackageInstaller,
} from "../adapters/package-installers/index.js";

import { cliUpgradeExecutionObserver } from "../adapters/execution-observer.js";

/** Select native installer protocols and metadata persistence once per invocation. */
export const PackageInstallationLive = Layer.mergeAll(
  Layer.succeed(UpgradeExecutionObserver, cliUpgradeExecutionObserver),
  Layer.effect(
    PackageInstaller,
    Effect.gen(function* () {
      return makePackageInstaller(yield* Subprocess, yield* Path.Path, yield* Ref.make(0));
    }),
  ),
  Layer.effect(InstallationRecorder, Effect.map(InstallMeta, makeInstallationRecorder)),
);
