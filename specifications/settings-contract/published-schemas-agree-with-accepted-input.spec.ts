import { createRequire } from "node:module";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

// Importing the harness's lint surface loads the rule catalogs, exactly as
// the product does, so settings documents referencing registered lint rule
// identities decode the way they do inside the CLI.
import {
  allCatalogRuleIds,
  LOCKFILE_VERSION,
  LockfileSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "settings-contract/published-schemas-agree-with-accepted-input",
  title: "The published settings and lockfile schemas describe what the product accepts",
  statement:
    "The published settings and lockfile schemas shall agree with the product on every example document, top-level key, lint rule identity, severity value, and lockfile version, and shall not admit an unregistered rule, wildcard rule, misspelled severity, or other lockfile version.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "workspace-intent-fidelity"],
  status: "accepted",
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.",
  ],
  openQuestions: [],
});

const requireFromSpec = createRequire(import.meta.url);
const decodeJsonRecord = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodeJsonArray = Schema.decodeUnknownSync(Schema.Array(Schema.Unknown));

// The generated schema documents are published package content, reachable
// through the public site-content export.
const readPublishedSchema = (name: string): Record<string, unknown> => {
  const loaded: unknown = requireFromSpec(`axm.sh/unstable/site-content/schemas/${name}`);
  return decodeJsonRecord(loaded);
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> =>
  decodeJsonRecord(parent[key]);

const settingsExamples = (): ReadonlyArray<unknown> => {
  const document = readPublishedSchema("settings.schema.json");
  return decodeJsonArray(child(child(document, "definitions"), "AxmSettings")["examples"]);
};

const lintRulesDefinition = (): Record<string, unknown> => {
  const document = readPublishedSchema("settings.schema.json");
  const lintConfig = child(child(document, "definitions"), "LintConfig");
  return child(child(lintConfig, "properties"), "rules");
};

const severityValues = ["off", "info", "warn", "error"];
const registeredRuleId = "skill/manifest-keys-recognized";

describe("Published settings schema", () => {
  it.effect("the settings document is rooted at the workspace settings shape", () =>
    Effect.sync(() => {
      expect(readPublishedSchema("settings.schema.json")["$ref"]).toBe("#/definitions/AxmSettings");
    }),
  );

  it.effect("the published top-level fields are exactly the canonical settings keys", () =>
    Effect.sync(() => {
      const document = readPublishedSchema("settings.schema.json");
      const properties = child(child(child(document, "definitions"), "AxmSettings"), "properties");
      expect(Object.keys(properties).sort()).toEqual([...SETTINGS_KEY_ORDER].sort());
    }),
  );

  it.effect("every example settings document in the schema decodes through the product", () =>
    Effect.gen(function* () {
      const examples = settingsExamples();
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        yield* Schema.decodeUnknownEffect(SettingsSchema)(example);
      }
    }),
  );

  it.effect("example lint rules reference only rule identities the product registers", () =>
    Effect.sync(() => {
      for (const example of settingsExamples()) {
        const lint = decodeJsonRecord(example)["lint"];
        if (lint === undefined) continue;
        const rules = child(decodeJsonRecord(lint), "rules");
        for (const ruleId of Object.keys(rules)) {
          expect(allCatalogRuleIds).toContain(ruleId);
        }
      }
    }),
  );

  it.effect("the published schema exposes exactly the runtime lint rule identities", () =>
    Effect.sync(() => {
      const rules = lintRulesDefinition();
      const properties = child(rules, "properties");
      expect(Object.keys(properties)).toEqual(allCatalogRuleIds);
      expect(rules["additionalProperties"]).toBe(false);

      for (const ruleId of allCatalogRuleIds) {
        expect(properties[ruleId]).toEqual({
          $ref: "#/definitions/LintRuleSeverity",
        });
      }
    }),
  );

  it.effect("the published and runtime contracts accept every rule at every lint severity", () =>
    Effect.gen(function* () {
      const document = readPublishedSchema("settings.schema.json");
      const severity = child(child(document, "definitions"), "LintRuleSeverity");
      expect(severity["enum"]).toEqual(severityValues);

      for (const ruleId of allCatalogRuleIds) {
        for (const value of severityValues) {
          const decoded = yield* Schema.decodeUnknownEffect(SettingsSchema)({
            lint: { rules: { [ruleId]: value } },
          });
          expect(decoded.lint?.rules?.[ruleId]).toBe(value);
        }
      }
    }),
  );

  it.effect("runtime settings reject finding spelling, wildcards, and unknown rule ids", () =>
    Effect.gen(function* () {
      for (const rules of [
        { [registeredRuleId]: "warning" },
        { "skill/*": "warn" },
        { "skill/not-registered": "warn" },
      ]) {
        yield* Schema.decodeUnknownEffect(SettingsSchema)({ lint: { rules } }).pipe(Effect.flip);
      }
    }),
  );
});

describe("Published lockfile schema", () => {
  it.effect("the lockfile document pins exactly the accepted lockfile version", () =>
    Effect.sync(() => {
      const document = readPublishedSchema("axm-lock.schema.json");
      expect(document["$ref"]).toBe("#/definitions/Lockfile");
      const lockfile = child(child(document, "definitions"), "Lockfile");
      const versionProperty = child(child(lockfile, "properties"), "lockfileVersion");
      expect(versionProperty["enum"]).toEqual([LOCKFILE_VERSION]);
      expect(versionProperty["default"]).toBe(LOCKFILE_VERSION);
      expect(lockfile["required"]).toEqual(expect.arrayContaining(["lockfileVersion", "skills"]));
    }),
  );

  it.effect(
    "a minimal lockfile at the accepted version decodes, and any other version is refused",
    () =>
      Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(LockfileSchema)({
          lockfileVersion: LOCKFILE_VERSION,
          skills: {},
        });
        yield* Schema.decodeUnknownEffect(LockfileSchema)({
          lockfileVersion: LOCKFILE_VERSION - 1,
          skills: {},
        }).pipe(Effect.flip);
      }),
  );
});
