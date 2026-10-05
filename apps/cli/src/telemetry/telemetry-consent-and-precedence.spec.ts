import * as Effect from "effect/Effect";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { SETTINGS_KEY_ORDER, SettingsSchema } from "@agentxm/workspace-kernel/workspace-state";

import { resolveProcessTelemetryOptions } from "../runtime.js";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-consent-and-precedence",
  title: "Telemetry defaults on with environment opt-outs",
  statement:
    "Telemetry shall default to usage and errors when AXM_TELEMETRY is absent, honor any nonempty DO_NOT_TRACK or DISABLE_TELEMETRY before AXM_TELEMETRY, accept only explicit all/errors/off controls, treat empty or unrecognized AXM_TELEMETRY as off, apply the same rules in CI, and read no telemetry control from committed workspace configuration.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface ConsentCase {
  readonly label: string;
  readonly doNotTrack?: string;
  readonly disableTelemetry?: string;
  readonly telemetry?: string;
  readonly preview?: string;
  readonly expected: "all" | "errors" | "off";
}

const consentCases: readonly ConsentCase[] = [
  { label: "no controls default to all", expected: "all" },
  ...["", "sometimes", "TRUE", " errors "].map((telemetry) => ({
    label: `invalid explicit value ${JSON.stringify(telemetry)} disables collection`,
    telemetry,
    expected: "off" as const,
  })),
  ...["1", "0", "false", " "].flatMap((value) => [
    {
      label: `DO_NOT_TRACK ${JSON.stringify(value)} overrides all`,
      doNotTrack: value,
      telemetry: "true",
      expected: "off" as const,
    },
    {
      label: `DISABLE_TELEMETRY ${JSON.stringify(value)} overrides errors`,
      disableTelemetry: value,
      telemetry: "errors",
      expected: "off" as const,
    },
  ]),
  {
    label: "empty standard opt-outs retain default",
    doNotTrack: "",
    disableTelemetry: "",
    expected: "all",
  },
  { label: "the operator can turn collection off", telemetry: "0", expected: "off" },
  { label: "the operator can limit collection to errors", telemetry: "errors", expected: "errors" },
  { label: "the operator can opt in fully", telemetry: "true", expected: "all" },
  {
    label: "the do-not-track convention disables collection over every other control",
    doNotTrack: "1",
    telemetry: "true",
    expected: "off",
  },
  {
    label: "an unrecognized operator value falls back to the default",
    telemetry: "sometimes",
    expected: "off",
  },
  {
    label: "preview obeys the default consent",
    preview: "1",
    expected: "all",
  },
];

describe("Telemetry consent", () => {
  it.effect.each(
    consentCases.flatMap((entry) => [undefined, "true"].map((ci) => ({ ...entry, ci }))),
  )("$label", (testCase) =>
    Effect.sync(() => {
      // The process entry resolves consent once, from the operator's
      // environment and nothing else.
      const resolved = resolveProcessTelemetryOptions({
        CI: testCase.ci,
        DO_NOT_TRACK: testCase.doNotTrack,
        DISABLE_TELEMETRY: testCase.disableTelemetry,
        AXM_TELEMETRY: testCase.telemetry,
        AXM_TELEMETRY_PREVIEW: testCase.preview,
      });
      expect(resolved.mode).toBe(testCase.expected);
      // A recognized preview request changes where payloads go, never whether
      // they are collected.
      expect(resolved.preview).toBe(testCase.preview !== undefined);
    }),
  );

  it.effect("committed workspace configuration carries no telemetry control", () =>
    Effect.sync(() => {
      // The settings contract owns no telemetry field: neither the canonical
      // key set nor the schema document it renders names one, so a committed
      // value has no place to travel and collection decisions read only the
      // operator's environment.
      expect(SETTINGS_KEY_ORDER.filter((key) => key.toLowerCase().includes("telemetry"))).toEqual(
        [],
      );
      const document = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(SettingsSchema));
      expect(JSON.stringify(document).toLowerCase()).not.toContain("telemetry");
    }),
  );
});
