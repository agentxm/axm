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
import * as ServiceMap from "effect/ServiceMap";

import { resolveAxmDataDirPure } from "../utils/index.js";

// -----------------------------------------------------------------------------
// Tagged union type
// -----------------------------------------------------------------------------

/** Installed via the install script (~/.axm/bin/ or %LOCALAPPDATA%\axm\). */
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
export const InstallMethodLiteral = Schema.Literals(["script", "homebrew", "npm"] as const);

const InstallMetaSchema = Schema.Struct({
  method: InstallMethodLiteral,
});

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
  "@axm.sh/core/InstallMethod",
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
  readonly platform: string;
  readonly localAppData: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Detection logic (pure functions operating on inputs)
// -----------------------------------------------------------------------------

const isScriptInstall = (inputs: InstallMethodInputs): Option.Option<Script> => {
  const normalized = inputs.execPath.replace(/\\/g, "/");

  // Unix: ~/.axm/bin/
  const unixPattern = `${inputs.homeDir.replace(/\\/g, "/")}/.axm/bin/`;
  if (normalized.startsWith(unixPattern)) {
    return Option.some(new Script({ execPath: inputs.execPath }));
  }

  // Windows: %LOCALAPPDATA%\axm\
  if (Option.isSome(inputs.localAppData)) {
    const winPattern = `${inputs.localAppData.value.replace(/\\/g, "/")}/axm/`;
    if (normalized.startsWith(winPattern)) {
      return Option.some(new Script({ execPath: inputs.execPath }));
    }
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

    // Priority 1: Script install (exec path in ~/.axm/bin/ or %LOCALAPPDATA%\axm\)
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
    const metaDir = resolveAxmDataDirPure(
      path.join,
      inputs.platform,
      inputs.homeDir,
      Option.isSome(inputs.localAppData) ? inputs.localAppData.value : undefined,
    );
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

    const parsed = yield* Effect.sync(() => {
      try {
        const json: unknown = JSON.parse(contentResult.value);
        return json;
      } catch {
        return null;
      }
    });
    if (parsed === null) return Option.none<string>();

    const decoded = yield* Schema.decodeUnknownEffect(InstallMetaSchema)(parsed).pipe(
      Effect.option,
    );
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

    // Capture runtime inputs once at layer construction
    const homeDir = yield* Effect.sync(() => {
      // Cross-platform home directory resolution
      // eslint-disable-next-line no-restricted-properties -- Centralized env var access for home dir
      return process.env["HOME"] ?? process.env["USERPROFILE"] ?? process.env["HOMEPATH"] ?? "/tmp";
    });
    const platform = yield* Effect.sync(() => process.platform);
    const localAppData = yield* Effect.sync(() =>
      // eslint-disable-next-line no-restricted-properties -- Centralized env var access for LOCALAPPDATA
      Option.fromUndefinedOr(process.env["LOCALAPPDATA"]),
    );

    const inputs: InstallMethodInputs = {
      execPath: process.execPath,
      importMetaUrl: import.meta.url,
      homeDir,
      platform,
      localAppData,
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
