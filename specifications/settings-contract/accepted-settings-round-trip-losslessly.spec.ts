import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { SettingsSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "settings-contract/accepted-settings-round-trip-losslessly",
  title: "An accepted settings document re-encodes exactly as it was authored",
  statement:
    "A settings document the product accepts shall re-encode to exactly the authored document, including entries in object form and content the product does not recognize.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["settings-contract/saving-settings-preserves-authored-formatting"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeSettings = Schema.decodeUnknownEffect(SettingsSchema);
const encodeSettings = Schema.encodeEffect(SettingsSchema);

describe("Accepted settings round-trip", () => {
  it.effect("a canonical settings document re-encodes exactly as authored", () =>
    Effect.gen(function* () {
      const fixture = {
        $schema: "https://axm.sh/schemas/settings.schema.json",
        owner: "@acme",
        agents: ["claude-code", "cursor"],
        skills: {
          "code-review": "@acme/skills/code-review@^1.0.0",
          "disabled-review": { source: "@acme/skills/disabled-review@^1.0.0", enabled: false },
        },
        futureCapability: true,
      };
      const decoded = yield* decodeSettings(fixture);
      const encoded = yield* encodeSettings(decoded);
      expect(encoded).toEqual(fixture);
    }),
  );
});
