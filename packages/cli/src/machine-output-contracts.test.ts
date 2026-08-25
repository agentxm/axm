import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";

import { JsonHelpDocSchema, JsonVersionDocSchema } from "@agentxm/client-core/unstable/cli-runtime";
import { LoginDocumentSchema } from "@agentxm/client-core/unstable/auth";
import {
  VisibilityEvaluationSchema,
  VisibilityMutationResultSchema,
} from "@agentxm/client-core/unstable/publish";
import { ExtensionInventorySchema } from "@agentxm/client-core/unstable/workspace";

import {
  captureHelpDoc,
  collectCommandAliases,
  collectHelpFiles,
} from "./command-tree-test-helpers.js";
import { makeAxmFormatter } from "./formatter.js";
import { PublishResultSchema } from "./json-output.js";
import { PlanResolutionDocumentSchema } from "./operation-output.js";
import {
  FORMATTER_VERSION_CONTRACT,
  MACHINE_OUTPUT_CONTRACT_ROWS,
} from "./machine-output-contracts.js";
import { AgentCapabilitiesOutputSchema } from "./root/agents/capabilities.js";
import { AgentsListOutputSchema } from "./root/agents/list.js";
import { LoginNoOpDocumentSchema } from "./root/auth/login.js";
import { LogoutDocumentSchema } from "./root/auth/logout.js";
import {
  CreatedTokenDocumentSchema,
  RevokeTokenDocumentSchema,
  TokenDocumentSchema,
  TokenListDocumentSchema,
} from "./root/auth/token.js";
import { WhoamiDocumentSchema } from "./root/auth/whoami.js";
import {
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
} from "./root/cache/command.js";
import { DiscoverOutputSchema } from "./root/discover/handler.js";
import { HelpIndexResultSchema, HelpTopicResultSchema } from "./root/help/command.js";
import { KnowledgeLintQueryResultSchema } from "./root/knowledge/lint.js";
import { KnowledgeListQueryResultSchema } from "./root/knowledge/list.js";
import {
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptStatusOutputSchema,
} from "./root/knowledge/concepts/schemas.js";
import { LintResultDocumentSchema } from "./root/lint/handler.js";
import { LifecycleTransitionOutputSchema } from "./root/lifecycle/command.js";
import { ExtensionListDocumentSchema } from "./root/list/command.js";
import { PackShowResultSchema } from "./root/packs/show.js";
import { InstructionsStatusOutputSchema } from "./root/instructions.js";
import { SetupDocumentSchema } from "./root/setup.js";
import { ExtensionShowResultSchema } from "./root/shared/extension-show.js";
import { UpgradeDocumentSchema } from "./root/upgrade/handler.js";
import { ViewDocumentSchema, ViewFieldValueSchema } from "./root/view/handler.js";

const sorted = (values: Iterable<string>): ReadonlyArray<string> => [...values].sort();

const NAMED_MACHINE_OUTPUT_SCHEMAS: Readonly<Record<string, Schema.Top>> = {
  AgentCapabilitiesOutputSchema,
  AgentsListOutputSchema,
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
  CreatedTokenDocumentSchema,
  DiscoverOutputSchema,
  ExtensionInventorySchema,
  ExtensionShowResultSchema,
  HelpIndexResultSchema,
  HelpTopicResultSchema,
  InstructionsStatusOutputSchema,
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  KnowledgeLintQueryResultSchema,
  KnowledgeListQueryResultSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptStatusOutputSchema,
  LifecycleTransitionOutputSchema,
  LintResultDocumentSchema,
  LoginDocumentSchema,
  LoginNoOpDocumentSchema,
  LogoutDocumentSchema,
  ExtensionListDocumentSchema,
  PackShowResultSchema,
  PlanResolutionDocumentSchema,
  PublishResultSchema,
  RevokeTokenDocumentSchema,
  SetupDocumentSchema,
  TokenDocumentSchema,
  TokenListDocumentSchema,
  UpgradeDocumentSchema,
  ViewDocumentSchema,
  ViewFieldValueSchema,
  VisibilityEvaluationSchema,
  VisibilityMutationResultSchema,
  WhoamiDocumentSchema,
};

describe("machine-output contract register", () => {
  it.effect("classifies every registered command path exactly once", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const aliases = yield* collectCommandAliases();
      const registeredPaths = sorted([...helpFiles.keys(), ...aliases.keys()]);
      const contractPaths = sorted(MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => row.path));

      expect(contractPaths).toStrictEqual(registeredPaths);
      expect(new Set(contractPaths).size).toBe(contractPaths.length);
    }),
  );

  it.effect("assigns every alias the same schema family as its canonical path", () =>
    Effect.gen(function* () {
      const aliases = yield* collectCommandAliases();
      const familyByPath = new Map(
        MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => [row.path, row.family.id]),
      );

      for (const [aliasPath, canonicalPath] of aliases) {
        expect(familyByPath.get(aliasPath), aliasPath).toBe(familyByPath.get(canonicalPath));
      }
    }),
  );

  it("keeps every row deliberate, documented, and connected to coverage", () => {
    for (const row of [...MACHINE_OUTPUT_CONTRACT_ROWS, FORMATTER_VERSION_CONTRACT]) {
      expect(row.family.id).not.toBe("");
      expect(["orientation", "query", "mutation", "mixed"]).toContain(row.family.humanOutputKind);
      expect(["immediate", "progress"]).toContain(row.family.liveness);
      expect(row.family.livenessCoverage.length).toBeGreaterThan(0);
      expect(row.family.schemaNames.length).toBeGreaterThan(0);
      expect(row.family.requiredEnvelopeKeys.length).toBeGreaterThan(0);
      expect(row.family.requiredTopLevelKeys.length).toBeGreaterThan(0);
      expect(row.family.scenarios.length).toBeGreaterThan(0);
      expect(row.family.rationale).not.toBe("");
      expect(row.family.centralizedCoverage.length).toBeGreaterThan(0);
      expect(row.family.documentation.length).toBeGreaterThan(0);
      expect(row.helpSchemaName).toBe("JsonHelpDocSchema");
    }
  });

  it("keeps every repository coverage pointer connected to an existing file", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
    const coveragePointers = new Set(
      [...MACHINE_OUTPUT_CONTRACT_ROWS, FORMATTER_VERSION_CONTRACT].flatMap((row) => [
        ...row.family.commandCoverage,
        ...row.family.livenessCoverage,
      ]),
    );

    for (const pointer of coveragePointers) {
      if (!pointer.startsWith("packages/")) continue;
      expect(fs.existsSync(path.join(repositoryRoot, pointer)), pointer).toBe(true);
    }
  });

  it("uses one result envelope key for every ordinary structured command", () => {
    for (const row of MACHINE_OUTPUT_CONTRACT_ROWS) {
      if (row.family.outputClass !== "structured-result") continue;
      expect(row.family.requiredEnvelopeKeys, row.path).toStrictEqual(["ok", "result"]);
    }
  });

  it("resolves every declared schema name to a named Effect Schema export", () => {
    const declaredNames = new Set(
      [...MACHINE_OUTPUT_CONTRACT_ROWS, FORMATTER_VERSION_CONTRACT].flatMap(
        (row) => row.family.schemaNames,
      ),
    );

    expect(sorted(declaredNames)).toStrictEqual(sorted(Object.keys(NAMED_MACHINE_OUTPUT_SCHEMAS)));
    for (const schema of Object.values(NAMED_MACHINE_OUTPUT_SCHEMAS)) {
      expect(Schema.isSchema(schema)).toBe(true);
    }
  });

  it("keeps declared required payload keys aligned with every family schema", () => {
    const families = new Map(
      MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => [row.family.id, row.family]),
    );

    for (const family of families.values()) {
      if (family.outputClass !== "structured-result") continue;
      const requiredPayloadKeys = family.requiredTopLevelKeys.filter((key) => key !== "ok");
      if (requiredPayloadKeys.length === 0) continue;

      for (const schemaName of family.schemaNames) {
        const schema = NAMED_MACHINE_OUTPUT_SCHEMAS[schemaName];
        expect(schema, schemaName).toBeDefined();
        const fields = schema === undefined ? undefined : Reflect.get(schema, "fields");
        expect(fields, `${schemaName} must be a struct for required-key inspection`).toBeDefined();
        const fieldKeys = typeof fields === "object" && fields !== null ? Object.keys(fields) : [];
        for (const requiredKey of requiredPayloadKeys) {
          expect(fieldKeys, `${family.id}/${schemaName}`).toContain(requiredKey);
        }
      }
    }
  });

  it.effect("runtime-encodes every registered --help document with JsonHelpDocSchema", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const formatter = makeAxmFormatter({ json: true, colors: false });

      for (const [path, doc] of helpFiles) {
        const output = formatter.formatHelpDoc(doc);
        const parsed: unknown = JSON.parse(output);

        expect(() => Schema.decodeUnknownSync(JsonHelpDocSchema)(parsed), path).not.toThrow();
        expect(parsed, path).toMatchObject({ type: "help" });
      }
    }),
  );

  it.effect("runtime-encodes --help through every alias path", () =>
    Effect.gen(function* () {
      const aliases = yield* collectCommandAliases();
      const formatter = makeAxmFormatter({ json: true, colors: false });

      for (const aliasPath of aliases.keys()) {
        const doc = yield* captureHelpDoc(aliasPath.split(" ").slice(1));
        const parsed: unknown = JSON.parse(formatter.formatHelpDoc(doc));

        expect(() => Schema.decodeUnknownSync(JsonHelpDocSchema)(parsed), aliasPath).not.toThrow();
      }
    }),
  );

  it("runtime-encodes the formatter-owned --version document", () => {
    const formatter = makeAxmFormatter({ json: true, colors: false });
    const parsed: unknown = JSON.parse(formatter.formatVersion("axm", "1.2.3"));

    expect(() => Schema.decodeUnknownSync(JsonVersionDocSchema)(parsed)).not.toThrow();
    expect(parsed).toStrictEqual({ type: "version", name: "axm", version: "1.2.3" });
  });
});
