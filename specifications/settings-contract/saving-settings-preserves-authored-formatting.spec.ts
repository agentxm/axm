import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { SettingsSchema, writeSettingsAtPath } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "settings-contract/saving-settings-preserves-authored-formatting",
  title: "Saving settings preserves authored formatting, ordering, and unrecognized content",
  statement:
    "When the product saves settings back to axm.json, it shall preserve the authored indentation, key order, and unrecognized content, and rewriting unchanged settings shall leave the file byte-identical.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["golden-output", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeSettings = Schema.decodeUnknownEffect(SettingsSchema);

// Authored with four-space indentation, non-canonical key order, and an
// unrecognized top-level key a newer product version could have written.
const authoredText = `{
    "skills": {
        "code-review": "@acme/skills/code-review@^1.0.0"
    },
    "futureCapability": { "enabled": true },
    "agents": ["claude-code"]
}
`;

describe("Saving settings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each([
    { label: "one newline", text: authoredText },
    { label: "no final newline", text: authoredText.trimEnd() },
    { label: "multiple final newlines", text: `${authoredText}\n\n` },
    { label: "Windows line endings", text: authoredText.replaceAll("\n", "\r\n") },
  ])("rewriting unchanged settings preserves $label byte-for-byte", ({ text }) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const settingsPath = path.join(workspace.root, "axm.json");
      fs.writeFileSync(settingsPath, text);

      const authored: unknown = JSON.parse(text);
      const settings = yield* decodeSettings(authored);
      yield* writeSettingsAtPath(settingsPath, settings).pipe(Effect.provide(workspace.layer));

      expect(fs.readFileSync(settingsPath, "utf8")).toBe(text);
    }),
  );

  it.effect("a single added entry keeps authored regions and unrecognized content intact", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const settingsPath = path.join(workspace.root, "axm.json");
      fs.writeFileSync(settingsPath, authoredText);

      const targetDocument = {
        skills: {
          "code-review": "@acme/skills/code-review@^1.0.0",
          "test-runner": "@acme/skills/test-runner@^2.0.0",
        },
        futureCapability: { enabled: true },
        agents: ["claude-code"],
      };
      const settings = yield* decodeSettings(targetDocument);
      yield* writeSettingsAtPath(settingsPath, settings).pipe(Effect.provide(workspace.layer));

      const written = fs.readFileSync(settingsPath, "utf8");
      expect(written).toContain(`"futureCapability": { "enabled": true }`);
      expect(written).toContain(`        "code-review": "@acme/skills/code-review@^1.0.0"`);
      expect(written).toContain(`"test-runner": "@acme/skills/test-runner@^2.0.0"`);
      expect(written.indexOf(`"agents"`)).toBeGreaterThan(written.indexOf(`"skills"`));
      const reparsed: unknown = JSON.parse(written);
      expect(reparsed).toEqual(targetDocument);
    }),
  );
});
