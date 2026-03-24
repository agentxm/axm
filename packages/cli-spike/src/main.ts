#!/usr/bin/env bun
// ==========================================================================
// main.ts — CLI entry point and runtime wiring
//
// Reference implementation for an Effect v4 CLI using @axm.sh/core services.
// Demonstrates:
//   1. Global flags: nonInteractiveFlag + outputFormatFlag from core
//   2. Per-command flags (yes, force, preview) from core — NOT global
//   3. Output/Activity services provided via withRuntime()
//   4. Three-channel error handling via core cli-runtime
//   5. Graceful shutdown with fiber interruption
// ==========================================================================
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";

import { nonInteractiveFlag, outputFormatFlag } from "@axm.sh/core/unstable/cli-flags";
import {
  handleError,
  resolveFormatFromArgv,
  type CliTelemetryConfigService,
  withCliRuntime,
  withGracefulShutdown,
} from "@axm.sh/core/unstable/cli-runtime";
import { resolveTelemetryMode } from "@axm.sh/core/unstable/telemetry";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

import { FakeSkillsManagerLive } from "./fake-skills-manager.js";
import { skillsCommand } from "./commands/skills/command.js";
import { telemetryCommand } from "./commands/telemetry/command.js";

// ---------------------------------------------------------------------------
// Global flags — truly global, available to every command
//
// Both flags come from @axm.sh/core (shared across all CLIs).
//
// IMPORTANT: yes/force/preview are NOT global — they are per-command flags
// imported from @axm.sh/core/unstable/cli-flags by commands that need them.
// This matches the project convention: only truly cross-cutting concerns
// are global.
// ---------------------------------------------------------------------------

const globalFlags = [nonInteractiveFlag, outputFormatFlag] as const;

const telemetryEnabledInTest = () => process.env["AXM_TELEMETRY_ENABLE_IN_TEST"] === "true";

const ROOT_COMMAND = "axm-spike";
const VERSION = "0.0.1";

// ---------------------------------------------------------------------------
// Runtime layer helper — resolves format and provides Output + Activity
//
// Commands call withRuntime() to get format-aware services. The format
// drives which layer variant is provided:
//   text        → OutputLive + ActivityLive (interactive clack prompts)
//   json/stream → OutputStructured + ActivityStructured (NDJSON events)
//
// This replaces the old pattern of manually branching on format in every
// handler. Commands just use Output.result() and Activity.withSpinner()
// and the services handle format differences transparently.
// ---------------------------------------------------------------------------

const telemetryBaseUrl = process.env["AXM_TELEMETRY_BASE_URL"];

const spikeCliTelemetryConfig = {
  mode: resolveTelemetryMode(
    {
      doNotTrack: process.env["DO_NOT_TRACK"],
      telemetry: process.env["AXM_TELEMETRY"],
    },
    {},
  ),
  client: { name: ROOT_COMMAND, version: VERSION },
  runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
  ci: process.env["CI"] === "true",
  test: process.env["VITEST"] === "true" && !telemetryEnabledInTest(),
  ...(telemetryBaseUrl !== undefined && { baseUrl: telemetryBaseUrl }),
} satisfies CliTelemetryConfigService;

type WithRuntimeOptions = {
  readonly command?: string;
  readonly isLongRunning?: boolean;
};

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: WithRuntimeOptions,
) =>
  withCliRuntime(program, {
    command: options?.command,
    isLongRunning: options?.isLongRunning,
    ci: spikeCliTelemetryConfig.ci,
    telemetryConfig: spikeCliTelemetryConfig,
    programLayer: FakeSkillsManagerLive,
  });

// ---------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------

const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription("Effect v4 CLI spike — proving out idiomatic command/flag patterns."),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List installed skills" },
    { command: "axm-spike skills install owner/repo", description: "Install skills from GitHub" },
    {
      command: "axm-spike telemetry handled",
      description: "Send a handled AppError to telemetry",
    },
  ]),
  Command.withSubcommands([skillsCommand, telemetryCommand]),
  Command.withGlobalFlags(globalFlags),
);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  const format = resolveFormatFromArgv(args);
  try {
    await Effect.runPromise(
      withGracefulShutdown(
        Command.runWith(rootCommand, { version: VERSION })(args).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
        ),
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

void run();
