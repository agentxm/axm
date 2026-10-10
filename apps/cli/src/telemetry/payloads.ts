import type { ErrorCode } from "@agentxm/workspace-kernel/operations";
/**
 * The only shapes telemetry puts on the wire. Each payload is built from an
 * allowlist of bounded facts and encoded with the published contract schema,
 * so delivery and preview carry the same sanitized value and a value outside
 * the contract's bounds is never sent.
 */
import * as Option from "effect/Option";

import type { FailureDiagnostic } from "@agentxm/workspace-kernel/operations";

import { logEvent } from "../screen/machine-events.js";
import type * as GeneratedTelemetryClient from "./__generated__/telemetry-client.js";

type TelemetryPropertyValue = string | number | boolean | null;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;
export type TelemetryFailurePhase = GeneratedTelemetryClient.TelemetryErrorReport["phase"];
type TelemetryErrorClass = GeneratedTelemetryClient.TelemetryErrorReport["failure"]["class"];
export type TelemetryPreviewFormat = "text" | "json";

/** One terminal failure, already reduced to its allowlisted diagnostic identity. */
type WireFailure = GeneratedTelemetryClient.TelemetryErrorReport["failure"];

export interface TelemetryFailureReport extends FailureDiagnostic {
  readonly eventId?: string;
  readonly occurredAt?: string;
  readonly counts?: NonNullable<WireFailure["counts"]>;
  readonly related?: ReadonlyArray<FailureDiagnostic & { readonly count: number }>;
  readonly relatedOmitted?: number;
  readonly history?: NonNullable<WireFailure["history"]>;
  readonly frames?: NonNullable<WireFailure["frames"]>;
  readonly phase: TelemetryFailurePhase;
  /** Stable identifier from the caller's enumerated failure set. */
  readonly kind: string;
  readonly category: ErrorCode;
  readonly errorClass: TelemetryErrorClass;
  /** False for a defect. */
  readonly handled: boolean;
  /** Canonical command identity when known; never arguments. */
  readonly command?: string;
  readonly activityId?: string;
}

export interface TelemetryClientIdentity {
  readonly name: string;
  readonly version: string;
}

const COMMAND_PATTERN = /^[a-z][a-z0-9:_-]*( [a-z][a-z0-9:_-]*)*$/u;
const COMMAND_MAX_LENGTH = 64;
const RUNTIME_VERSION_PATTERN = /^[0-9A-Za-z.+-]+$/u;
const RUNTIME_VERSION_MAX_LENGTH = 64;

/** The runtime's version when the contract can carry it; `unknown` otherwise. */
const boundedRuntimeVersion = (version: string | undefined): string =>
  version !== undefined &&
  version.length <= RUNTIME_VERSION_MAX_LENGTH &&
  RUNTIME_VERSION_PATTERN.test(version)
    ? version
    : "unknown";

/** Bounded facts about this client build and the host executing it. */
export const reportingClientFacts = (
  client: TelemetryClientIdentity,
  ci: boolean,
  versions: Readonly<Record<string, string | undefined>> = process.versions,
): GeneratedTelemetryClient.TelemetryReportingClient => {
  const bun = versions["bun"];
  return {
    name: client.name,
    version: client.version,
    runtime: bun === undefined ? "node" : "bun",
    runtimeVersion: boundedRuntimeVersion(bun ?? versions["node"]),
    platform: process.platform,
    architecture: process.arch,
    ci,
  };
};

/** The shared environment metadata attached to usage event batches. */
export const usageEventContext = (
  facts: GeneratedTelemetryClient.TelemetryReportingClient,
  invocationId: string,
): GeneratedTelemetryClient.TelemetryContext => ({
  client: { name: facts.name, version: facts.version },
  os: { name: facts.platform },
  runtime: { name: facts.runtime, version: facts.runtimeVersion },
  device: { arch: facts.architecture },
  ci: facts.ci,
  invocationId,
});

export const buildErrorReport = (input: {
  readonly eventId: string;
  readonly invocationId: string;
  readonly occurredAt: string;
  readonly installationId: Option.Option<string>;
  readonly client: GeneratedTelemetryClient.TelemetryReportingClient;
  readonly failure: TelemetryFailureReport;
}): GeneratedTelemetryClient.TelemetryErrorReport => {
  const { failure } = input;
  const command =
    failure.command !== undefined &&
    failure.command.length <= COMMAND_MAX_LENGTH &&
    COMMAND_PATTERN.test(failure.command)
      ? failure.command
      : undefined;
  return {
    eventId: input.eventId,
    invocationId: input.invocationId,
    occurredAt: input.occurredAt,
    ...(Option.isSome(input.installationId) ? { installationId: input.installationId.value } : {}),
    ...(failure.activityId === undefined ? {} : { activityId: failure.activityId }),
    client: input.client,
    ...(command === undefined ? {} : { command }),
    phase: failure.phase,
    failure: {
      kind: failure.kind,
      operation: failure.operation,
      ...(failure.request === undefined ? {} : { request: wireRequest(failure.request) }),
      ...(failure.counts === undefined ? {} : { counts: failure.counts }),
      ...(failure.related === undefined
        ? {}
        : {
            related: failure.related.map((entry) => ({
              kind: entry.kind,
              operation: entry.operation,
              count: entry.count,
              ...(entry.request === undefined ? {} : { request: wireRequest(entry.request) }),
            })),
          }),
      ...(failure.relatedOmitted === undefined ? {} : { relatedOmitted: failure.relatedOmitted }),
      ...(failure.history === undefined ? {} : { history: failure.history }),
      ...(failure.frames === undefined ? {} : { frames: failure.frames }),
      category: failure.category,
      class: failure.errorClass,
      handled: failure.handled,
    },
  };
};

export const buildEventsRequest = (input: {
  readonly eventId: string;
  readonly event: string;
  readonly installationId: string;
  readonly timestamp: string;
  readonly sentAt: string;
  readonly properties: TelemetryProperties;
  readonly context: GeneratedTelemetryClient.TelemetryContext;
}): GeneratedTelemetryClient.TelemetryEventsRequest => ({
  events: [
    {
      eventId: input.eventId,
      event: input.event,
      distinctId: input.installationId,
      timestamp: input.timestamp,
      properties: input.properties,
      anonymous: true,
    },
  ],
  sentAt: input.sentAt,
  context: input.context,
});

/**
 * One diagnostic line showing the encoded payload a send would carry. Machine
 * output keeps stderr NDJSON, so the line is one log event there.
 */
export const previewLine = (
  format: TelemetryPreviewFormat,
  route: string,
  encoded: unknown,
): string => {
  const message = `telemetry preview ${route} ${JSON.stringify(encoded)}`;
  return format === "json" ? JSON.stringify(logEvent("info", message)) : message;
};

const wireRequest = (
  request: NonNullable<FailureDiagnostic["request"]>,
): GeneratedTelemetryClient.TelemetryFailureRequest => ({
  service: request.service,
  ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
  ...(request.status === undefined ? {} : { status: request.status }),
  ...(request.attemptCount === undefined ? {} : { attemptCount: request.attemptCount }),
});
