import {
  SetupOutcomeSchema,
  SetupWorkspace,
  type SetupOutcome,
} from "@agentxm/workspace-configuration";
import { agentFlag, isNonInteractive, jsonFlag, Verbosity } from "../cli-flags/index.js";
import { Screen, errorDoc, headlineDoc, successDoc, suggestionsDoc } from "../screen/index.js";
import { effectCliExit, withArgvTracking } from "../cli-runtime/index.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { resolveTelemetryMode } from "../telemetry/index.js";
import { envOption } from "../utils/index.js";
import { ExitCode } from "../app-error/index.js";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import {
  coerceConfigurationFailure,
  extensionLifecycleFailedToAppError,
} from "../feature-errors.js";
import { LearnMore, formatLearnMore } from "../formatter.js";
import { BRANDING } from "../branding/index.js";
import { ExecutionDirectory } from "../execution-directory.js";
import { withRuntime, withWorkspace } from "../runtime.js";
import { formatDisplayPath } from "./shared/display-path.js";
import { commandForScope } from "./shared/scoped-command.js";
import {
  preapprovalCapabilityFlag,
  previewCapabilityFlag,
  withCommandCapabilities,
  type CommandCapabilities,
} from "./shared/command-capabilities.js";
import { setupBrandingDoc, setupScopeSupportDoc, subagentSummaryDoc } from "./setup/view.js";
import { AXM_SKILL_VERSION } from "../__generated__/bundled-axm-skill.js";
import { installBundledAxmSkill } from "@agentxm/extension-lifecycle";

/**
 * Setup applies a documented unattended candidate when explicitly asked to,
 * and it assesses that same candidate under `--preview` without asking.
 */
const setupCapabilities = {
  preview: true,
  preapproval: {
    purpose:
      "Apply the documented unattended setup defaults with an explicit scope and explicit agents",
  },
  trust: [],
  inputs: "explicit-or-documented-defaults",
  effect: "workspace",
} satisfies CommandCapabilities;

const SetupDocumentFields = {
  result: SetupOutcomeSchema,
} satisfies Schema.Struct.Fields;
export const SetupDocumentSchema = Schema.Struct(SetupDocumentFields);
export type SetupDocument = typeof SetupDocumentSchema.Type;

const renderSetupBranding = (screen: typeof Screen.Service) =>
  Effect.gen(function* () {
    const json = yield* jsonFlag;
    if (Option.getOrElse(json, () => false)) return;
    const nonInteractive = yield* isNonInteractive;
    if (nonInteractive) return;
    const verbosity = yield* Verbosity;
    if (verbosity.level === "quiet") return;

    yield* screen.note(setupBrandingDoc(BRANDING));
  });

const setupSuggestions = (args: {
  readonly status: SetupOutcome["status"];
  readonly agentCount: number;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: WorkspaceScope;
  readonly telemetryEnabled: boolean;
}): ReadonlyArray<SuggestedAction> => {
  if (args.status === "preview") {
    const agentFlags = args.agentIds.map((id) => ` --agent ${id}`).join("");
    return [
      {
        description: "Apply setup",
        cmd: `axm setup --yes --scope ${args.scope}${agentFlags}`,
      },
    ];
  }

  if (args.status === "cancelled") return [];

  const suggestions: Array<SuggestedAction> = [
    {
      description: "Inspect configured agents",
      cmd: commandForScope("axm agents list", args.scope),
    },
    {
      description: "Preview workspace reconciliation",
      cmd: commandForScope("axm sync --preview", args.scope),
    },
    {
      description: "Lint workspace state",
      cmd: commandForScope("axm lint", args.scope),
    },
    {
      description: "List installed extensions",
      cmd: commandForScope("axm list", args.scope),
    },
  ];

  if (args.status === "already-initialized") {
    suggestions.splice(1, 0, {
      description: "Manage coding-agent membership",
      cmd: commandForScope("axm agents --help", args.scope),
    });
  }

  if (args.agentCount === 0) {
    suggestions.unshift({
      description: "Detect and configure active coding agents",
      cmd: commandForScope("axm agents add --detected", args.scope),
    });
  } else if (args.scope === "project") {
    suggestions.push({ description: "Discover recommended extensions", cmd: "axm discover" });
  }

  if (args.scope === "project") {
    suggestions.push({
      description: "Set up staged lint hooks (project-only)",
      cmd: "axm help git-hooks",
    });
  }

  if (args.telemetryEnabled) {
    suggestions.push({
      description: "Disable telemetry with AXM_TELEMETRY=0; environment help lists all controls",
    });
  }

  return suggestions;
};

const bundledSkillDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project"
    ? "agent_extensions/agentxm/@agentxm/skills/axm"
    : ".axm/workspace/agent_extensions/agentxm/@agentxm/skills/axm";

const setupSkillFootprint = (scope: WorkspaceScope, targetPaths: ReadonlyArray<string>): string => {
  const sourcePath = bundledSkillDisplayPath(scope);
  const paths = [sourcePath, ...targetPaths];
  return paths.length <= 3
    ? paths.join(", ")
    : `${sourcePath}, ${targetPaths.length} agent targets`;
};

export interface HandleSetupArgs {
  readonly scope: WorkspaceScope;
  readonly agents?: ReadonlyArray<string>;
  readonly yes?: boolean;
  readonly preview?: boolean;
  readonly scopeExplicit?: boolean;
}

export const handleSetup = Effect.fn("Setup.handle")(function* (args: HandleSetupArgs) {
  const screen = yield* Screen;
  const path = yield* Path.Path;
  const executionDirectory = yield* ExecutionDirectory;
  yield* renderSetupBranding(screen);
  const json = yield* jsonFlag;
  const machineOutput = Option.getOrElse(json, () => false);
  const nonInteractive = (yield* isNonInteractive) || machineOutput;
  const doNotTrackOpt = yield* envOption("DO_NOT_TRACK");
  const axmTelemetryOpt = yield* envOption("AXM_TELEMETRY");
  const telemetryMode = resolveTelemetryMode({
    doNotTrack: Option.getOrUndefined(doNotTrackOpt),
    telemetry: Option.getOrUndefined(axmTelemetryOpt),
  });
  const telemetryEnabled = telemetryMode !== "off";

  const prepared = yield* SetupWorkspace.prepare({
    scope: args.scope,
    ...(args.scopeExplicit === undefined ? {} : { scopeExplicit: args.scopeExplicit }),
    ...(args.agents === undefined ? {} : { agents: args.agents }),
    ...(args.yes === undefined ? {} : { yes: args.yes }),
    ...(args.preview === undefined ? {} : { preview: args.preview }),
    nonInteractive,
    projectRoot: executionDirectory.path,
    telemetryEnabled,
  }).pipe(Effect.mapError(coerceConfigurationFailure));

  if (prepared._tag === "ApprovalRequired") {
    const suggestions = [
      {
        description: "Preview the setup candidate",
        cmd: `axm setup --preview --scope ${args.scope}`,
      },
    ];
    const emitted = yield* screen.document({ result: prepared.outcome }, SetupDocumentSchema, {
      suggestions,
      ok: false,
    });
    if (!emitted) {
      yield* screen.note(errorDoc("Approval required — no changes applied", { suggestions }));
    }
    return yield* Effect.die(effectCliExit(ExitCode.Usage));
  }

  // The bundled AXM skill is a lifecycle installation, not a configuration
  // decision, so the application supplies it; setup applies it inside the
  // initialization closure so a skill that cannot be installed leaves no
  // half-initialized workspace behind.
  const transition = yield* SetupWorkspace.previewOrApply(prepared, {
    bundledSkill: installBundledAxmSkill.pipe(
      Effect.mapError(extensionLifecycleFailedToAppError),
      withWorkspace(args.scope),
    ),
  }).pipe(Effect.mapError(coerceConfigurationFailure));
  const result = yield* SetupWorkspace.report({
    candidate: prepared,
    transition,
    bundledSkill: { installed: transition.initialized, version: AXM_SKILL_VERSION },
  }).pipe(Effect.mapError(coerceConfigurationFailure));

  const suggestions = setupSuggestions({
    status: result.status,
    agentCount: result.agents.length,
    agentIds: result.agents.map((agent) => agent.id),
    scope: transition.location.scope,
    telemetryEnabled,
  });

  if (yield* screen.document({ result }, SetupDocumentSchema, { suggestions })) return;

  const message = result.message ?? "";
  if (result.status === "cancelled") {
    yield* screen.note(headlineDoc("info", message));
    return;
  }

  if (result.agents.length === 0 && result.status !== "preview") {
    yield* screen.note(
      headlineDoc(
        "warn",
        `No coding-agent targets are configured. Run \`axm agents add --detected${result.scope === "user" ? " --scope user" : ""}\` to materialize installed extensions.`,
      ),
    );
  }
  yield* screen.result(successDoc(message));

  const verbosity = yield* Verbosity;
  if (verbosity.level !== "quiet") {
    yield* screen.note(headlineDoc("info", `AXM setup (${result.scope})`));
    if (result.agents.length > 0) {
      yield* screen.note(
        headlineDoc("info", `Agents: ${result.agents.map((agent) => agent.name).join(", ")}`),
      );
    }
    yield* screen.note(
      headlineDoc(
        "info",
        `Settings: ${
          transition.location.scope === "user"
            ? formatDisplayPath(path, transition.location.settingsPath)
            : result.settingsPath
        }`,
      ),
    );
    if (result.instructions !== undefined) {
      yield* screen.note(
        headlineDoc(
          "info",
          result.instructions.enabled
            ? `Instructions: ${result.instructions.fileName ?? "AGENTS.md"}`
            : "Instructions: disabled",
        ),
      );
    }
    if (result.defaultSkillInstalled) {
      const skillStep = result.steps.find((step) => step.label === "@agentxm/skills/axm");
      const skillTargets = (skillStep?.artifact?.targets ?? [])
        .filter((target) => target.agentIds !== undefined)
        .map((target) => target.path);
      yield* screen.note(
        headlineDoc(
          "info",
          `Skill: @agentxm/skills/axm -> ${setupSkillFootprint(transition.location.scope, skillTargets)}`,
        ),
      );
    }
    yield* screen.note(setupScopeSupportDoc(transition.location.scope, result.scopeSupport));
    yield* screen.note(
      subagentSummaryDoc(result.subagentFiles ?? [], (directory) =>
        formatDisplayPath(path, directory),
      ),
    );
  }

  if (telemetryEnabled && verbosity.level !== "quiet") {
    yield* screen.note(headlineDoc("info", ""));
    yield* screen.note(headlineDoc("info", "Telemetry is enabled to help improve AXM."));
  }

  if (verbosity.level !== "quiet") {
    yield* screen.note(suggestionsDoc(suggestions));
  }
}, Effect.asVoid);

const setupConfig = {
  scope: Flag.choice("scope", ["project", "user"] as const).pipe(
    Flag.withDescription("Configuration scope: project or user (required for unattended apply)"),
    Flag.optional,
  ),
  agent: agentFlag.pipe(Flag.withDescription("Specify agents to configure (skips auto-detection)")),
  yes: preapprovalCapabilityFlag(setupCapabilities),
  preview: previewCapabilityFlag(),
} as const;

export const setupCommand = Command.make("setup", setupConfig, ({ scope, agent, yes, preview }) => {
  const resolvedScope = Option.getOrElse(scope, () => "project" as const);
  return handleSetup({
    scope: resolvedScope,
    scopeExplicit: Option.isSome(scope),
    yes,
    preview,
    ...(agent.length > 0 ? { agents: agent } : {}),
  }).pipe(withRuntime("setup"));
}).pipe(
  withArgvTracking(setupConfig),
  withCommandCapabilities(setupCapabilities),
  Command.withDescription("Set up AXM in the current project"),
  Command.withExamples([
    { command: "axm setup", description: "Preview, confirm, and initialize project setup" },
    {
      command: "axm setup --preview --scope project --json --non-interactive",
      description: "Preview the exact unattended setup candidate without writing",
    },
    {
      command: "axm setup --scope user",
      description: "Initialize the user workspace in ~/.axm/workspace/",
    },
    {
      command: "axm setup --agent claude-code --agent cursor",
      description: "Initialize with specific agents",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "How to set up and configure AXM"],
      ["axm help basic-usage", "How to use AXM"],
    ]),
  ),
);
