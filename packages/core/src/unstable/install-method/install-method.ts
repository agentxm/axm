/**
 * InstallMethod service — detects how axm was installed.
 *
 * Provides a `detect()` method returning a tagged union (`Script | Homebrew | Npm | Unknown`)
 * using a precedence chain of runtime signals.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";

import { AXM_DIR_NAME } from "../workspace/constants.js";
import { getUserScopeDir } from "../workspace/paths.js";

// -----------------------------------------------------------------------------
// Tagged union type
// -----------------------------------------------------------------------------

/** Installed via the install script (~/.axm/bin/ or %USERPROFILE%\.axm\bin\). */
export class Script extends Data.TaggedClass("Script")<{
  readonly execPath: string;
}> {}

/** Installed via Homebrew (/Cellar/ in realpath of execPath). */
export class Homebrew extends Data.TaggedClass("Homebrew")<{
  readonly execPath: string;
}> {}

/** Installed via npm/pnpm/yarn (node_modules in import URL). */
export class Npm extends Data.TaggedClass("Npm")<{
  readonly importUrl: string;
}> {}

/** Install method could not be determined. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TaggedClass with no fields requires empty type parameter
export class Unknown extends Data.TaggedClass("Unknown")<{}> {}

/** Tagged union of all known install methods. */
export type InstallMethodType = Script | Homebrew | Npm | Unknown;

// -----------------------------------------------------------------------------
// Install metadata schema
// -----------------------------------------------------------------------------

/** Literal schema for valid install method names. */
export const InstallMethodLiteral = Schema.Literals([
  "script",
  "homebrew",
  "npm",
] as const).annotate({
  identifier: "InstallMethodLiteral",
  title: "Install Method",
  description: "How axm was installed: script, homebrew, or npm.",
});

const InstallMetaSchema = Schema.Struct({
  method: InstallMethodLiteral.pipe(
    Schema.annotateKey({ messageMissingKey: "method is required" }),
  ),
}).annotate({
  identifier: "InstallMeta",
  title: "Install Meta",
  description: "How axm was installed on this machine.",
});

const decodeInstallMetaFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(InstallMetaSchema),
);

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface InstallMethodService {
  readonly detect: () => Effect.Effect<InstallMethodType>;
}

/**
 * Effect service tag for install method detection.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InstallMethod extends ServiceMap.Service<InstallMethod, InstallMethodService>()(
  "@agentxm/client-core/unstable/install-method/install-method/InstallMethod",
) {}

// -----------------------------------------------------------------------------
// Configurable inputs for testability
// -----------------------------------------------------------------------------

/**
 * Runtime inputs that the detection logic needs.
 * Abstracted for testability — production uses real values, tests inject fakes.
 */
export interface InstallMethodInputs {
  readonly execPath: string;
  readonly importMetaUrl: string;
  readonly homeDir: string;
  readonly axmDataDir?: string;
}

// -----------------------------------------------------------------------------
// Detection logic (pure functions operating on inputs)
// -----------------------------------------------------------------------------

const isScriptInstall = (inputs: InstallMethodInputs): Option.Option<Script> => {
  const normalized = inputs.execPath.replace(/\\/g, "/");

  // Script installer: ~/.axm/bin/ on Unix, %USERPROFILE%\.axm\bin\ on Windows.
  const scriptPattern = `${inputs.homeDir.replace(/\\/g, "/")}/.axm/bin/`;
  if (normalized.startsWith(scriptPattern)) {
    return Option.some(new Script({ execPath: inputs.execPath }));
  }

  return Option.none();
};

const isHomebrewInstall = (realExecPath: string): Option.Option<Homebrew> => {
  if (realExecPath.includes("/Cellar/")) {
    return Option.some(new Homebrew({ execPath: realExecPath }));
  }
  return Option.none();
};

const isNpmInstall = (importMetaUrl: string): Option.Option<Npm> => {
  if (importMetaUrl.includes("node_modules")) {
    return Option.some(new Npm({ importUrl: importMetaUrl }));
  }
  return Option.none();
};

const metaMethodToType = (method: string, inputs: InstallMethodInputs): InstallMethodType => {
  switch (method) {
    case "script":
      return new Script({ execPath: inputs.execPath });
    case "homebrew":
      return new Homebrew({ execPath: inputs.execPath });
    case "npm":
      return new Npm({ importUrl: inputs.importMetaUrl });
    default:
      return new Unknown();
  }
};

// -----------------------------------------------------------------------------
// Core detection effect
// -----------------------------------------------------------------------------

/**
 * Detect install method from the given inputs.
 * Exposed for testability — the live layer calls this with real values.
 */
export const detectFromInputs = (inputs: InstallMethodInputs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Priority 1: Script install (exec path in ~/.axm/bin/)
    const scriptResult = isScriptInstall(inputs);
    if (Option.isSome(scriptResult)) return scriptResult.value;

    // Priority 2: Homebrew (realpath of execPath contains /Cellar/)
    const realExecPath = yield* fs
      .realPath(inputs.execPath)
      .pipe(Effect.catch(() => Effect.succeed(inputs.execPath)));
    const homebrewResult = isHomebrewInstall(realExecPath);
    if (Option.isSome(homebrewResult)) return homebrewResult.value;

    // Priority 3: npm (node_modules in import.meta.url)
    const npmResult = isNpmInstall(inputs.importMetaUrl);
    if (Option.isSome(npmResult)) return npmResult.value;

    // Priority 4: install-meta.json fallback
    const metaDir = inputs.axmDataDir ?? path.join(inputs.homeDir, AXM_DIR_NAME);
    const metaPath = path.join(metaDir, "install-meta.json");
    const metaResult = yield* readInstallMeta(fs, metaPath);
    if (Option.isSome(metaResult)) {
      return metaMethodToType(metaResult.value, inputs);
    }

    // Priority 5: Unknown
    return new Unknown();
  });

const readInstallMeta = (fs: FileSystem.FileSystem, metaPath: string) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(metaPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<string>();

    const contentResult = yield* fs.readFileString(metaPath).pipe(Effect.option);
    if (Option.isNone(contentResult)) return Option.none<string>();

    const decoded = yield* decodeInstallMetaFromJsonString(contentResult.value).pipe(Effect.option);
    if (Option.isNone(decoded)) return Option.none<string>();

    return Option.some(decoded.value.method);
  });

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const InstallMethodLive = Layer.effect(
  InstallMethod,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    const axmDataDir = yield* getUserScopeDir();
    const homeDir = pathService.dirname(axmDataDir);

    const inputs: InstallMethodInputs = {
      execPath: process.execPath,
      importMetaUrl: import.meta.url,
      homeDir,
      axmDataDir,
    };

    const detect: InstallMethodService["detect"] = () =>
      detectFromInputs(inputs).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, pathService),
      );

    return { detect } satisfies InstallMethodService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

/**
 * Create an InstallMethod layer for testing with configurable inputs.
 */
export const InstallMethodTest = (inputs: InstallMethodInputs) =>
  Layer.effect(
    InstallMethod,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;

      const detect: InstallMethodService["detect"] = () =>
        detectFromInputs(inputs).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, pathService),
        );

      return { detect } satisfies InstallMethodService;
    }),
  );
