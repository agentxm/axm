/**
 * CliEnvConfig — centralizes application-level environment variable reads
 * using Effect Config primitives.
 *
 * Production layer (`CliEnvConfigLive`) reads from `process.env` via
 * `Config.string` / `Config.redacted` / `Config.option`.
 *
 * Test layer (`CliEnvConfig.testDefaults`) provides sensible defaults so
 * tests only need `Effect.provide(CliEnvConfig.testDefaults)`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Config from "effect/Config";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface CliEnvConfigService {
  readonly registryUrl: string;
  readonly token: Option.Option<Redacted.Redacted<string>>;
  readonly ci: boolean;
  readonly doNotTrack: Option.Option<string>;
  readonly telemetry: Option.Option<string>;
  readonly sshClient: Option.Option<string>;
  readonly sshTty: Option.Option<string>;
  readonly xdgConfigHome: Option.Option<string>;
  readonly claudeSkillsDir: Option.Option<string>;
  readonly geminiCliSkillsDir: Option.Option<string>;
  readonly installInternalSkills: Option.Option<string>;
  readonly vitest: string;
  readonly home: Option.Option<string>;
  readonly userProfile: Option.Option<string>;
  readonly homePath: Option.Option<string>;
  readonly verbose: Option.Option<string>;
  readonly debug: Option.Option<string>;
  readonly telemetryBaseUrl: Option.Option<string>;
}

export class CliEnvConfig extends ServiceMap.Service<CliEnvConfig, CliEnvConfigService>()(
  "@axm.sh/cli/CliEnvConfig",
) {
  static readonly testDefaults: Layer.Layer<CliEnvConfig> = Layer.succeed(CliEnvConfig, {
    registryUrl: "https://registry.agentxm.ai",
    token: Option.none(),
    ci: false,
    doNotTrack: Option.none(),
    telemetry: Option.none(),
    sshClient: Option.none(),
    sshTty: Option.none(),
    xdgConfigHome: Option.none(),
    claudeSkillsDir: Option.none(),
    geminiCliSkillsDir: Option.none(),
    installInternalSkills: Option.none(),
    vitest: "false",
    home: Option.none(),
    userProfile: Option.none(),
    homePath: Option.none(),
    verbose: Option.none(),
    debug: Option.none(),
    telemetryBaseUrl: Option.none(),
  } satisfies CliEnvConfigService);
}

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const CliEnvConfigLive: Layer.Layer<CliEnvConfig, Config.ConfigError> = Layer.effect(
  CliEnvConfig,
  Effect.gen(function* () {
    const registryUrl = yield* Config.string("AXM_REGISTRY_URL").pipe(
      Config.withDefault("https://registry.agentxm.ai"),
    );
    const token = yield* Config.redacted("AXM_TOKEN").pipe(Config.option);
    const ci = (yield* Config.string("CI").pipe(Config.withDefault("false"))) === "true";
    const doNotTrack = yield* Config.string("DO_NOT_TRACK").pipe(Config.option);
    const telemetry = yield* Config.string("AXM_TELEMETRY").pipe(Config.option);
    const sshClient = yield* Config.string("SSH_CLIENT").pipe(Config.option);
    const sshTty = yield* Config.string("SSH_TTY").pipe(Config.option);
    const xdgConfigHome = yield* Config.string("XDG_CONFIG_HOME").pipe(Config.option);
    const claudeSkillsDir = yield* Config.string("AXM_CLAUDE_SKILLS_DIR").pipe(Config.option);
    const geminiCliSkillsDir = yield* Config.string("AXM_GEMINI_CLI_SKILLS_DIR").pipe(
      Config.option,
    );
    const installInternalSkills = yield* Config.string("INSTALL_INTERNAL_SKILLS").pipe(
      Config.option,
    );
    const vitest = yield* Config.string("VITEST").pipe(Config.withDefault("false"));
    const home = yield* Config.string("HOME").pipe(Config.option);
    const userProfile = yield* Config.string("USERPROFILE").pipe(Config.option);
    const homePath = yield* Config.string("HOMEPATH").pipe(Config.option);
    const verbose = yield* Config.string("AXM_VERBOSE").pipe(Config.option);
    const debug = yield* Config.string("AXM_DEBUG").pipe(Config.option);
    const telemetryBaseUrl = yield* Config.string("AXM_TELEMETRY_BASE_URL").pipe(Config.option);

    return {
      registryUrl,
      token,
      ci,
      doNotTrack,
      telemetry,
      sshClient,
      sshTty,
      xdgConfigHome,
      claudeSkillsDir,
      geminiCliSkillsDir,
      installInternalSkills,
      vitest,
      home,
      userProfile,
      homePath,
      verbose,
      debug,
      telemetryBaseUrl,
    } satisfies CliEnvConfigService;
  }),
);
