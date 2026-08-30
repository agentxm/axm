import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { resolveTelemetryMode } from "@agentxm/extension-management/unstable/telemetry";

import { defineSpecification } from "../../support/contract.js";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

export const specification = defineSpecification({
  requirement: "system/security/telemetry-consent-and-precedence",
  title: "Telemetry collection follows only the operator's environment consent",
  class: "security",
  role: "experience",
  goals: ["privacy-and-consent"],
  methods: ["decision-table", "contract"],
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
      // The published settings contract owns no telemetry field: a committed
      // value has no place to travel, so collection decisions read only the
      // operator's environment.
      const schema: unknown = JSON.parse(
        fs.readFileSync(
          path.join(
            repoRoot,
            "packages/cli/site-content/__generated__/schemas/settings.schema.json",
          ),
          "utf8",
        ),
      );
      const rendered = JSON.stringify(schema).toLowerCase();
      expect(rendered).not.toContain("telemetry");
    }),
  );
});
