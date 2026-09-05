import { createRequire } from "node:module";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

// Importing the harness's lint surface loads the rule catalogs, exactly as
// the product does, so settings documents referencing registered lint rule
// identities decode the way they do inside the CLI.
import { allCatalogRuleIds, SettingsSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "settings-contract/published-settings-schema-agrees-with-accepted-input",
  title: "The published settings schema describes what the product accepts",
  statement:
    "The published settings schema shall agree with the product on every example document, lint rule identity, and severity value it admits, and shall not admit an unregistered rule, wildcard rule, or misspelled severity.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "workspace-intent-fidelity"],
  methods: ["contract", "example"],
  derivedFrom: ["settings-contract/published-schemas-agree-with-accepted-input"],
  supersedes: ["settings-contract/published-schemas-agree-with-accepted-input"],
  assumptions: [
    "The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.",
  ],
  openQuestions: [],
});

const requireFromSpec = createRequire(import.meta.url);
const decodeJsonRecord = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodeJsonArray = Schema.decodeUnknownSync(Schema.Array(Schema.Unknown));
const decodeStringArray = Schema.decodeUnknownSync(Schema.Array(Schema.String));

// The generated schema document is published package content, reachable
// through the public site-content export.
const publishedSettingsSchema = (): Record<string, unknown> => {
  const loaded: unknown = requireFromSpec(
    "axm.sh/unstable/site-content/schemas/settings.schema.json",
  );
  return decodeJsonRecord(loaded);
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> =>
  decodeJsonRecord(parent[key]);

/** Follows a definition reference so the published document's own structure leads. */
const definitionNamedBy = (
  document: Record<string, unknown>,
  reference: unknown,
): Record<string, unknown> => {
  const prefix = "#/definitions/";
  if (typeof reference !== "string" || !reference.startsWith(prefix)) {
    throw new Error(`Expected a definition reference, got ${JSON.stringify(reference)}`);
  }
  return child(child(document, "definitions"), reference.slice(prefix.length));
};

const settingsDefinition = (document: Record<string, unknown>): Record<string, unknown> =>
  definitionNamedBy(document, document["$ref"]);

const settingsExamples = (document: Record<string, unknown>): ReadonlyArray<unknown> =>
  decodeJsonArray(settingsDefinition(document)["examples"]);

/** The lint rule entries the published document admits, keyed by rule identity. */
const publishedLintRules = (document: Record<string, unknown>): Record<string, unknown> => {
  const lint = child(child(settingsDefinition(document), "properties"), "lint");
  const [lintConfigReference] = decodeJsonArray(lint["anyOf"]);
  const lintConfig = definitionNamedBy(document, decodeJsonRecord(lintConfigReference)["$ref"]);
  return child(child(child(lintConfig, "properties"), "rules"), "properties");
};

/** The severity values the published document admits for one rule entry. */
const admittedSeverities = (
  document: Record<string, unknown>,
  ruleEntry: unknown,
): ReadonlyArray<string> =>
  decodeStringArray(definitionNamedBy(document, decodeJsonRecord(ruleEntry)["$ref"])["enum"]);

const decodeSettings = Schema.decodeUnknownEffect(SettingsSchema);
const registeredRuleId = "skill/manifest-keys-recognized";

describe("Published settings schema", () => {
  it.effect(
    "every example settings document the schema publishes decodes through the product",
    () =>
      Effect.gen(function* () {
        const examples = settingsExamples(publishedSettingsSchema());
        expect(examples.length).toBeGreaterThan(0);
        for (const example of examples) {
          yield* decodeSettings(example);
        }
      }),
  );

  it.effect("example lint rules reference only rule identities the product registers", () =>
    Effect.sync(() => {
      for (const example of settingsExamples(publishedSettingsSchema())) {
        const lint = decodeJsonRecord(example)["lint"];
        if (lint === undefined) continue;
        const rules = child(decodeJsonRecord(lint), "rules");
        for (const ruleId of Object.keys(rules)) {
          expect(allCatalogRuleIds).toContain(ruleId);
        }
      }
    }),
  );

  it.effect(
    "every rule identity the published schema admits is accepted by the product at every severity it admits",
    () =>
      Effect.gen(function* () {
        const document = publishedSettingsSchema();
        const rules = publishedLintRules(document);
        expect(Object.keys(rules).length).toBeGreaterThan(0);

        for (const [ruleId, ruleEntry] of Object.entries(rules)) {
          const severities = admittedSeverities(document, ruleEntry);
          expect(severities.length).toBeGreaterThan(0);
          for (const severity of severities) {
            const decoded = yield* decodeSettings({ lint: { rules: { [ruleId]: severity } } });
            expect(decoded.lint?.rules?.[ruleId]).toBe(severity);
          }
        }
      }),
  );

  it.effect("the product registers no rule identity the published schema omits", () =>
    Effect.sync(() => {
      const publishedRuleIds = Object.keys(publishedLintRules(publishedSettingsSchema()));
      for (const ruleId of allCatalogRuleIds) {
        expect(publishedRuleIds).toContain(ruleId);
      }
    }),
  );

  it.effect(
    "a misspelled severity, a wildcard rule, and an unregistered rule are admitted by neither the published schema nor the product",
    () =>
      Effect.gen(function* () {
        const document = publishedSettingsSchema();
        const rules = publishedLintRules(document);
        expect(Object.keys(rules)).not.toContain("skill/*");
        expect(Object.keys(rules)).not.toContain("skill/not-registered");
        expect(admittedSeverities(document, rules[registeredRuleId])).not.toContain("warning");

        for (const rejected of [
          { [registeredRuleId]: "warning" },
          { "skill/*": "warn" },
          { "skill/not-registered": "warn" },
        ]) {
          yield* decodeSettings({ lint: { rules: rejected } }).pipe(Effect.flip);
        }
      }),
  );
});
