/**
 * Install ownership detection for AXM.
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

import { envOption } from "../utils/index.js";
import { resolveUserScopeDirPure } from "../workspace/paths.js";

export type DetectionSource =
  | "executable-path"
  | "resolved-executable-path"
  | "module-url"
  | "package-layout"
  | "package-manager-query"
  | "install-metadata"
  | "conflicting"
  | "unknown";

interface DetectionFields {
  readonly detectionSource?: DetectionSource;
  readonly evidence?: ReadonlyArray<string>;
  readonly confidence?: "high" | "medium" | "low";
  readonly managerOwnedExecutable?: string;
}

export class Script extends Data.TaggedClass("Script")<
  DetectionFields & { readonly execPath: string }
> {}

export class Homebrew extends Data.TaggedClass("Homebrew")<
  DetectionFields & { readonly execPath: string }
> {}

export class Npm extends Data.TaggedClass("Npm")<
  DetectionFields & { readonly importUrl: string }
> {}

export class Pnpm extends Data.TaggedClass("Pnpm")<
  DetectionFields & { readonly importUrl: string }
> {}

export class Yarn extends Data.TaggedClass("Yarn")<
  DetectionFields & {
    readonly importUrl: string;
    readonly managerMajorVersion?: number;
    readonly supported: boolean;
  }
> {}

export type UnknownReason = "ambiguous" | "conflicting" | "unsupported" | "unknown";

export class Unknown extends Data.TaggedClass("Unknown")<
  DetectionFields & { readonly reason?: UnknownReason }
> {
  constructor(props: DetectionFields & { readonly reason?: UnknownReason } = {}) {
    super(props);
  }
}

export type InstallMethodType = Script | Homebrew | Npm | Pnpm | Yarn | Unknown;

export const InstallMethodLiteral = Schema.Literals([
  "script",
  "homebrew",
  "npm",
  "pnpm",
  "yarn",
] as const).annotate({
  identifier: "InstallMethodLiteral",
  title: "Install Method",
  description: "The installer or package manager that owns AXM.",
});
export type InstallMethodName = typeof InstallMethodLiteral.Type;

const InstallMetaSchema = Schema.Struct({
  schemaVersion: Schema.optional(Schema.Number),
  method: InstallMethodLiteral,
  managerMajorVersion: Schema.optional(Schema.Number),
  executablePath: Schema.optional(Schema.String),
});
type DetectionMeta = typeof InstallMetaSchema.Type;

const decodeInstallMetaFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(InstallMetaSchema),
);

export interface InstallMethodService {
  readonly detect: () => Effect.Effect<InstallMethodType>;
}

export class InstallMethod extends ServiceMap.Service<InstallMethod, InstallMethodService>()(
  "@agentxm/client-core/unstable/install-method/install-method/InstallMethod",
) {}

export interface InstallMethodInputs {
  readonly execPath: string;
  readonly importMetaUrl: string;
  readonly homeDir: string;
  readonly platform: string;
  readonly packageManager?: "npm" | "pnpm" | "yarn";
  readonly packageManagerVersion?: string;
  readonly managerOwnedExecutable?: string;
}

const normalizedPath = (value: string): string => value.replace(/\\/gu, "/");

const comparablePath = (value: string, platform: string): string => {
  const normalized = normalizedPath(value).replace(/\/+$/u, "");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
};

const isWithinDirectory = (value: string, directory: string, platform: string): boolean =>
  comparablePath(value, platform).startsWith(`${comparablePath(directory, platform)}/`);

const managerMajor = (version: string | undefined): number | undefined => {
  if (version === undefined) return undefined;
  const first = version.split(".")[0];
  if (first === undefined || !/^\d+$/u.test(first)) return undefined;
  return Number(first);
};

const methodName = (method: InstallMethodType): InstallMethodName | null => {
  switch (method._tag) {
    case "Script":
      return "script";
    case "Homebrew":
      return "homebrew";
    case "Npm":
      return "npm";
    case "Pnpm":
      return "pnpm";
    case "Yarn":
      return "yarn";
    case "Unknown":
      return null;
  }
};

const methodFromName = (
  method: InstallMethodName,
  inputs: InstallMethodInputs,
  source: DetectionSource,
  meta?: DetectionMeta,
): InstallMethodType => {
  const metadataExecutable = source === "install-metadata" ? meta?.executablePath : undefined;
  const ownedExecutable = inputs.managerOwnedExecutable ?? metadataExecutable;
  const fields = {
    detectionSource: source,
    evidence: [`${source}:${method}`],
    confidence: source === "install-metadata" ? ("medium" as const) : ("high" as const),
    ...(ownedExecutable === undefined ? {} : { managerOwnedExecutable: ownedExecutable }),
  };
  switch (method) {
    case "script":
      return new Script({ ...fields, execPath: metadataExecutable ?? inputs.execPath });
    case "homebrew":
      return new Homebrew({ ...fields, execPath: metadataExecutable ?? inputs.execPath });
    case "npm":
      return new Npm({ ...fields, importUrl: inputs.importMetaUrl });
    case "pnpm":
      return new Pnpm({ ...fields, importUrl: inputs.importMetaUrl });
    case "yarn": {
      const major = meta?.managerMajorVersion ?? managerMajor(inputs.packageManagerVersion);
      return new Yarn({
        ...fields,
        importUrl: inputs.importMetaUrl,
        ...(major === undefined ? {} : { managerMajorVersion: major }),
        supported: major === 1,
      });
    }
  }
};

const methodFromManagerEvidence = (inputs: InstallMethodInputs): InstallMethodType | null => {
  if (inputs.packageManager !== undefined) {
    return methodFromName(inputs.packageManager, inputs, "package-manager-query");
  }
  const modulePath = normalizedPath(inputs.importMetaUrl).toLowerCase();
  if (modulePath.includes("/.pnpm/") || modulePath.includes("/pnpm/global/")) {
    return methodFromName("pnpm", inputs, "package-layout");
  }
  if (modulePath.includes("/yarn/global/") || modulePath.includes("/.yarn/")) {
    return methodFromName("yarn", inputs, "package-layout");
  }
  return null;
};

const directMethod = (
  inputs: InstallMethodInputs,
  realExecPath: string,
  scriptBinPath: string,
  realScriptBinPath: string,
): InstallMethodType | null => {
  if (isWithinDirectory(inputs.execPath, scriptBinPath, inputs.platform)) {
    return new Script({
      execPath: inputs.execPath,
      detectionSource: "executable-path",
      evidence: [`executable:${inputs.execPath}`],
      confidence: "high",
    });
  }
  if (isWithinDirectory(realExecPath, realScriptBinPath, inputs.platform)) {
    return new Script({
      execPath: realExecPath,
      detectionSource: "resolved-executable-path",
      evidence: [`resolved-executable:${realExecPath}`],
      confidence: "high",
    });
  }
  if (normalizedPath(realExecPath).includes("/Cellar/")) {
    return new Homebrew({
      execPath: realExecPath,
      detectionSource:
        realExecPath === inputs.execPath ? "executable-path" : "resolved-executable-path",
      evidence: [`resolved-executable:${realExecPath}`],
      confidence: "high",
    });
  }
  return null;
};

type InstallMetaRead =
  | { readonly status: "found"; readonly value: DetectionMeta }
  | { readonly status: "missing" | "unreadable" | "invalid" };

const withoutUtf8Bom = (value: string): string =>
  value.startsWith("\uFEFF") ? value.slice(1) : value;

const readInstallMeta = (fs: FileSystem.FileSystem, metaPath: string) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(metaPath).pipe(Effect.option);
    if (Option.isNone(exists)) return { status: "unreadable" } satisfies InstallMetaRead;
    if (!exists.value) return { status: "missing" } satisfies InstallMetaRead;

    const content = yield* fs.readFileString(metaPath).pipe(Effect.option);
    if (Option.isNone(content)) return { status: "unreadable" } satisfies InstallMetaRead;

    return yield* decodeInstallMetaFromJsonString(withoutUtf8Bom(content.value)).pipe(
      Effect.map((value) => ({ status: "found", value }) satisfies InstallMetaRead),
      Effect.catch(() => Effect.succeed({ status: "invalid" } satisfies InstallMetaRead)),
    );
  });

const conflicting = (evidence: ReadonlyArray<string>): Unknown =>
  new Unknown({
    reason: "conflicting",
    detectionSource: "conflicting",
    evidence,
    confidence: "low",
  });

export const detectFromInputs = (inputs: InstallMethodInputs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const realExecPath = yield* fs
      .realPath(inputs.execPath)
      .pipe(Effect.catch(() => Effect.succeed(inputs.execPath)));
    const userScopeDir = resolveUserScopeDirPure(path.join, inputs.homeDir);
    const scriptBinPath = path.join(userScopeDir, "bin");
    const realScriptBinPath = yield* fs
      .realPath(scriptBinPath)
      .pipe(Effect.catch(() => Effect.succeed(scriptBinPath)));
    const direct = directMethod(inputs, realExecPath, scriptBinPath, realScriptBinPath);
    const manager = methodFromManagerEvidence(inputs);
    const metaPath = path.join(userScopeDir, "install-meta.json");
    const meta = yield* readInstallMeta(fs, metaPath);
    const metaMethod =
      meta.status === "found"
        ? methodFromName(meta.value.method, inputs, "install-metadata", meta.value)
        : null;

    const strong = direct ?? manager;
    if (direct !== null && manager !== null && methodName(direct) !== methodName(manager)) {
      return conflicting([...(direct.evidence ?? []), ...(manager.evidence ?? [])]);
    }
    if (strong !== null && metaMethod !== null && methodName(strong) !== methodName(metaMethod)) {
      return conflicting([...(strong.evidence ?? []), ...(metaMethod.evidence ?? [])]);
    }
    if (strong !== null) return strong;
    if (metaMethod !== null) return metaMethod;

    if (normalizedPath(inputs.importMetaUrl).includes("node_modules")) {
      return new Unknown({
        reason: "ambiguous",
        detectionSource: "module-url",
        evidence: [
          `module-url:${inputs.importMetaUrl}`,
          "executable-path:miss",
          `install-metadata:${meta.status}`,
        ],
        confidence: "low",
      });
    }
    return new Unknown({
      reason: "unknown",
      detectionSource: "unknown",
      evidence: ["executable-path:miss", `install-metadata:${meta.status}`],
      confidence: "low",
    });
  });

const selectHomeDir = (
  platform: string,
  axmUserHome: Option.Option<string>,
  home: Option.Option<string>,
  userProfile: Option.Option<string>,
  homePath: Option.Option<string>,
): string => {
  if (Option.isSome(axmUserHome)) return axmUserHome.value;
  if (platform === "win32") {
    if (Option.isSome(userProfile)) return userProfile.value;
    if (Option.isSome(home)) return home.value;
    if (Option.isSome(homePath)) return homePath.value;
    return "/tmp";
  }
  if (Option.isSome(home)) return home.value;
  if (Option.isSome(userProfile)) return userProfile.value;
  if (Option.isSome(homePath)) return homePath.value;
  return "/tmp";
};

const parseUserAgent = (
  userAgent: Option.Option<string>,
): Pick<InstallMethodInputs, "packageManager" | "packageManagerVersion"> => {
  if (Option.isNone(userAgent)) return {};
  const [managerWithVersion] = userAgent.value.split(/\s+/u);
  const [manager, version] = managerWithVersion?.split("/") ?? [];
  if (manager !== "npm" && manager !== "pnpm" && manager !== "yarn") return {};
  return {
    packageManager: manager,
    ...(version === undefined ? {} : { packageManagerVersion: version }),
  };
};

export const InstallMethodLive = Layer.effect(
  InstallMethod,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const platform = yield* Effect.sync(() => process.platform);
    const axmUserHome = yield* envOption("AXM_USER_HOME");
    const home = yield* envOption("HOME");
    const userProfile = yield* envOption("USERPROFILE");
    const homePath = yield* envOption("HOMEPATH");
    const userAgent = yield* envOption("npm_config_user_agent");
    const inputs: InstallMethodInputs = {
      execPath: process.execPath,
      importMetaUrl: import.meta.url,
      homeDir: selectHomeDir(platform, axmUserHome, home, userProfile, homePath),
      platform,
      ...parseUserAgent(userAgent),
    };
    return {
      detect: () =>
        detectFromInputs(inputs).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, pathService),
        ),
    } satisfies InstallMethodService;
  }),
);

export const InstallMethodTest = (inputs: InstallMethodInputs) =>
  Layer.effect(
    InstallMethod,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;
      return {
        detect: () =>
          detectFromInputs(inputs).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, pathService),
          ),
      } satisfies InstallMethodService;
    }),
  );
