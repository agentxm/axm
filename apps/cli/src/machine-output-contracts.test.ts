import { NAMED_MACHINE_OUTPUT_SCHEMAS } from "./machine-output-schemas.js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";

import { JsonHelpDocSchema, JsonVersionDocSchema } from "./cli-runtime/index.js";

import {
  captureHelpDoc,
  collectCommandAliases,
  collectHelpFiles,
} from "./test-support/command-tree-test-helpers.js";
import { makeAxmFormatter } from "./formatter.js";
import {
  FORMATTER_VERSION_CONTRACT,
  MACHINE_OUTPUT_CONTRACT_ROWS,
} from "./machine-output-contracts.js";

const sorted = (values: Iterable<string>): ReadonlyArray<string> => [...values].sort();

const structFieldSets = (schema: unknown): ReadonlyArray<ReadonlyArray<string>> => {
  if (!Schema.isSchema(schema)) throw new Error("Expected an Effect Schema");
  const fields: unknown = Reflect.get(schema, "fields");
  if (typeof fields === "object" && fields !== null) return [Object.keys(fields)];
  const members: unknown = Reflect.get(schema, "members");
  if (Array.isArray(members) && members.length > 0) return members.flatMap(structFieldSets);
  throw new Error("Expected a struct or union of structs for required-key inspection");
};

describe("machine-output contract register", () => {
  it("registers the formatter help required and optional keys exactly as its schema", () => {
    const family = MACHINE_OUTPUT_CONTRACT_ROWS.find(
      (row) => row.family.id === "formatter-help",
    )?.family;
    expect(family).toBeDefined();
    const jsonSchema = Schema.toJsonSchemaDocument(JsonHelpDocSchema).schema;
    expect(sorted(family?.requiredTopLevelKeys ?? [])).toEqual(
      sorted(
        Array.isArray(jsonSchema["required"])
          ? jsonSchema["required"].filter((key): key is string => typeof key === "string")
          : [],
      ),
    );
    expect(
      sorted([...(family?.requiredTopLevelKeys ?? []), ...(family?.optionalTopLevelKeys ?? [])]),
    ).toEqual(sorted(Object.keys(JsonHelpDocSchema.fields)));
  });

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
      expect(row.family.humanCoverage.length, row.path).toBeGreaterThan(0);
      for (const coverage of row.family.humanCoverage) {
        expect(coverage.scenarios.length, coverage.file).toBeGreaterThan(0);
      }
      expect(row.family.schemaNames.length).toBeGreaterThan(0);
      expect(row.family.requiredEnvelopeKeys.length).toBeGreaterThan(0);
      expect(
        row.family.requiredTopLevelKeys.length + row.family.optionalTopLevelKeys.length,
        row.path,
      ).toBeGreaterThan(0);
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
        ...row.family.centralizedCoverage,
        ...row.family.humanCoverage.map((coverage) => coverage.file),
      ]),
    );

    const repositoryPointer = /^(?:apps|packages|tools|specifications)\//u;
    for (const pointer of coveragePointers) {
      if (!repositoryPointer.test(pointer)) continue;
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
        for (const fieldKeys of structFieldSets(schema)) {
          for (const requiredKey of requiredPayloadKeys) {
            expect(fieldKeys, `${family.id}/${schemaName}`).toContain(requiredKey);
          }
        }
      }
    }
  });

  it.effect("runtime-encodes every registered --help document with JsonHelpDocSchema", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const formatter = makeAxmFormatter();

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
      const formatter = makeAxmFormatter();

      for (const aliasPath of aliases.keys()) {
        const doc = yield* captureHelpDoc(aliasPath.split(" ").slice(1));
        const parsed: unknown = JSON.parse(formatter.formatHelpDoc(doc));

        expect(() => Schema.decodeUnknownSync(JsonHelpDocSchema)(parsed), aliasPath).not.toThrow();
      }
    }),
  );

  it("runtime-encodes the formatter-owned --version document", () => {
    const formatter = makeAxmFormatter();
    const parsed: unknown = JSON.parse(formatter.formatVersion("axm", "1.2.3"));

    expect(() => Schema.decodeUnknownSync(JsonVersionDocSchema)(parsed)).not.toThrow();
    expect(parsed).toStrictEqual({ type: "version", name: "axm", version: "1.2.3" });
  });
});
