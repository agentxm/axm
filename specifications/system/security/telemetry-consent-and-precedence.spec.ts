import * as Effect from "effect/Effect";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  resolveTelemetryMode,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-consent-and-precedence",
  title: "Telemetry collection follows only the operator's environment consent",
  statement:
    "Telemetry collection shall follow only the operator's environment, collecting by default, honoring the telemetry control to disable collection or limit it to errors, giving the do-not-track convention precedence over every other control, and reading no telemetry control from committed workspace configuration.",
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
  readonly telemetry?: string;
  readonly expected: "all" | "errors" | "off";
}

const consentCases: readonly ConsentCase[] = [
  { label: "no controls collect by default", expected: "all" },
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
    expected: "all",
  },
];

describe("Telemetry consent", () => {
  it.effect.each(consentCases)("$label", (testCase) =>
    Effect.sync(() => {
      expect(
        resolveTelemetryMode({
          doNotTrack: testCase.doNotTrack,
          telemetry: testCase.telemetry,
        }),
      ).toBe(testCase.expected);
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
