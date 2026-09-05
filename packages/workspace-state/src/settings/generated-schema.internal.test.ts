import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { allLintCatalogRuleIds } from "@agentxm/registry-protocol/unstable/lint/catalog-metadata";

import { SETTINGS_KEY_ORDER } from "./schema.js";

const generatedSchemasDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../cli/site-content/__generated__/schemas",
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readGeneratedSchema = (name: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(resolve(generatedSchemasDir, name), "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`Expected generated ${name} schema to contain a JSON object.`);
  }
  return parsed;
};

const readGeneratedSettingsSchema = (): Record<string, unknown> =>
  readGeneratedSchema("settings.schema.json");

const generatedSchemaNames = [
  "axm-lock.schema.json",
  "settings.schema.json",
  "skill.schema.json",
  "mcp.schema.json",
  "subagent.schema.json",
  "pack.schema.json",
  "rule.schema.json",
  "hook.schema.json",
  "knowledge.schema.json",
  "axm-package-meta.schema.json",
] as const;

const getRecord = (record: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`Expected ${key} to contain a JSON object.`);
  }
  return value;
};

const getDefinition = (schema: Record<string, unknown>, name: string): Record<string, unknown> =>
  getRecord(getRecord(schema, "definitions"), name);

const getProperty = (definition: Record<string, unknown>, name: string): Record<string, unknown> =>
  getRecord(getRecord(definition, "properties"), name);

const getPropertyNamesSchema = (
  schema: Record<string, unknown>,
  root: Record<string, unknown> = schema,
): Record<string, unknown> => {
  if (isRecord(schema["propertyNames"])) {
    return schema["propertyNames"];
  }

  const reference = schema["$ref"];
  const definitionPrefix = "#/definitions/";
  if (typeof reference === "string" && reference.startsWith(definitionPrefix)) {
    return getPropertyNamesSchema(
      getDefinition(root, reference.slice(definitionPrefix.length)),
      root,
    );
  }

  for (const composition of ["allOf", "anyOf", "oneOf"]) {
    const entries = schema[composition];
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (isRecord(entry)) {
          try {
            return getPropertyNamesSchema(entry, root);
          } catch {
            // Continue through the remaining composition branches.
          }
        }
      }
    }
  }

  throw new Error("Expected propertyNames to contain a JSON object.");
};

const getStringPattern = (schema: Record<string, unknown>): string | undefined => {
  if (typeof schema["pattern"] === "string") {
    return schema["pattern"];
  }

  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    for (const entry of allOf) {
      if (isRecord(entry) && typeof entry["pattern"] === "string") {
        return entry["pattern"];
      }
    }
  }

  return undefined;
};

const getFirstAnyOfRecord = (schema: Record<string, unknown>): Record<string, unknown> => {
  const anyOf = schema["anyOf"];
  if (!Array.isArray(anyOf) || !isRecord(anyOf[0])) {
    throw new Error("Expected anyOf to contain an object arm.");
  }
  return anyOf[0];
};

const getAnnotatedAllOfRecord = (schema: Record<string, unknown>): Record<string, unknown> => {
  if (typeof schema["description"] === "string" && Array.isArray(schema["examples"])) {
    return schema;
  }
  const allOf = schema["allOf"];
  if (!Array.isArray(allOf)) {
    throw new Error("Expected allOf to contain annotation records.");
  }

  const annotated = allOf.find(
    (entry) =>
      isRecord(entry) &&
      typeof entry["description"] === "string" &&
      Array.isArray(entry["examples"]),
  );
  if (!isRecord(annotated)) {
    throw new Error("Expected an allOf entry with description and examples.");
  }
  return annotated;
};

const resolveRef = (rootSchema: Record<string, unknown>, ref: string): Record<string, unknown> => {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  return getDefinition(rootSchema, ref.slice(prefix.length));
};

const resolveRefIfPresent = (
  rootSchema: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> =>
  typeof schema["$ref"] === "string" ? resolveRef(rootSchema, schema["$ref"]) : schema;

const findExamplesAnnotation = (
  rootSchema: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (Array.isArray(schema["examples"])) {
    return schema;
  }
  if (typeof schema["$ref"] === "string") {
    return findExamplesAnnotation(rootSchema, resolveRef(rootSchema, schema["$ref"]));
  }
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    const annotated = allOf.find((entry) => isRecord(entry) && Array.isArray(entry["examples"]));
    if (isRecord(annotated)) {
      return annotated;
    }
  }
  const anyOf = schema["anyOf"];
  if (Array.isArray(anyOf)) {
    for (const branch of anyOf) {
      if (!isRecord(branch)) continue;
      const found = findExamplesAnnotation(rootSchema, branch);
      if (found !== undefined) return found;
    }
  }
  return undefined;
};

const getOptionalFieldExamplesRecord = (
  rootSchema: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const fieldSchema = getFirstAnyOfRecord(schema);
  const found = findExamplesAnnotation(rootSchema, fieldSchema);
  if (found !== undefined) return found;
  throw new Error("Expected an examples annotation on the optional field.");
};

describe("generated schemas", () => {
  it("omits generation comments from public schema documents", () => {
    for (const name of generatedSchemaNames) {
      expect(readGeneratedSchema(name)).not.toHaveProperty("$comment");
    }
  });

  it("includes the lint configuration surface", () => {
    const schema = readGeneratedSettingsSchema();
    const definitions = schema["definitions"];
    expect(isRecord(definitions)).toBe(true);
    if (!isRecord(definitions)) {
      return;
    }

    const settingsDefinition = definitions["AxmSettings"];
    expect(isRecord(settingsDefinition)).toBe(true);
    if (!isRecord(settingsDefinition)) {
      return;
    }

    const properties = settingsDefinition["properties"];
    expect(isRecord(properties)).toBe(true);
    if (!isRecord(properties)) {
      return;
    }

    expect(properties).toHaveProperty("lint");
  });

  it("publishes annotations and patterns for filtered string definitions", () => {
    const skillSchema = readGeneratedSchema("skill.schema.json");
    const packSchema = readGeneratedSchema("pack.schema.json");

    const packSpec = getAnnotatedAllOfRecord(getDefinition(skillSchema, "PackSpec"));
    expect(packSpec["title"]).toBe("Pack Spec");
    expect(packSpec["description"]).toContain("optional version constraint");
    expect(packSpec["pattern"]).toEqual(expect.stringContaining("@.+"));
    expect(packSpec["examples"]).toContain("@acme/packs/typescript@^1.0.0");

    const versionRange = getAnnotatedAllOfRecord(getDefinition(packSchema, "VersionRange"));
    expect(versionRange["title"]).toBe("Version Range");
    expect(versionRange["description"]).toContain("semver version range");
    expect(versionRange["pattern"]).toBe("^[~^<>=*xXvV0-9A-Za-z+| .-]+$");
    expect(versionRange["examples"]).toContain(">=1 <3");
  });

  it("publishes only the canonical lockfile version", () => {
    const lockSchema = readGeneratedSchema("axm-lock.schema.json");
    const lockfile = getDefinition(lockSchema, "Lockfile");
    const lockfileVersion = getProperty(lockfile, "lockfileVersion");

    expect(lockSchema["$ref"]).toBe("#/definitions/Lockfile");
    expect(lockfileVersion["type"]).toBe("number");
    expect(lockfileVersion["enum"]).toEqual([7]);
    expect(lockfileVersion["default"]).toBe(7);
    expect(lockfile["required"]).toEqual(["lockfileVersion", "skills"]);
  });

  it("publishes exactly the canonical settings keys at the top level", () => {
    const settings = getDefinition(readGeneratedSettingsSchema(), "AxmSettings");

    expect(Object.keys(getRecord(settings, "properties")).sort()).toEqual(
      [...SETTINGS_KEY_ORDER].sort(),
    );
  });

  it("publishes one severity property per catalog lint rule and admits no other keys", () => {
    const rules = getProperty(getDefinition(readGeneratedSettingsSchema(), "LintConfig"), "rules");
    const properties = getRecord(rules, "properties");

    expect(Object.keys(properties)).toEqual([...allLintCatalogRuleIds]);
    expect(rules["additionalProperties"]).toBe(false);
    for (const ruleId of allLintCatalogRuleIds) {
      expect(properties[ruleId]).toEqual({ $ref: "#/definitions/LintRuleSeverity" });
    }
  });

  it("publishes common manifest field annotations", () => {
    const skillSchema = readGeneratedSchema("skill.schema.json");
    const manifest = getDefinition(skillSchema, "SkillManifest");

    for (const field of ["license", "bugs", "repository", "homepage", "keywords"]) {
      const fieldSchema = getOptionalFieldExamplesRecord(skillSchema, getProperty(manifest, field));
      expect(fieldSchema["examples"]).toEqual(expect.any(Array));
    }

    const repositoryDefinition = resolveRefIfPresent(
      skillSchema,
      getFirstAnyOfRecord(getProperty(manifest, "repository")),
    );
    const repositoryStringBranch = getFirstAnyOfRecord(repositoryDefinition);
    expect(repositoryStringBranch["format"]).toBe("uri-reference");
    expect(getFirstAnyOfRecord(getProperty(manifest, "homepage"))["format"]).toBe("uri");
  });

  it("publishes typed record-key patterns for settings maps", () => {
    const settingsSchema = readGeneratedSettingsSchema();

    for (const name of ["SkillsMap", "McpServersMap", "SubagentsMap", "PacksMap"]) {
      const mapSchema = getDefinition(settingsSchema, name);
      const propertyNames = getPropertyNamesSchema(mapSchema, settingsSchema);
      expect(getStringPattern(propertyNames)).toBe("^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$");
    }
  });

  it("publishes settings usability annotations", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const settings = getDefinition(settingsSchema, "AxmSettings");
    const agentId = getDefinition(settingsSchema, "ConfigurableAgentId");

    expect(settingsSchema["$ref"]).toBe("#/definitions/AxmSettings");
    expect(settings["title"]).toBe("AXM Settings");
    expect(settings["examples"]).toEqual(expect.any(Array));

    for (const field of [
      "owner",
      "agents",
      "sources",
      "instructionFiles",
      "skills",
      "hooks",
      "knowledge",
      "knowledgeConfig",
      "subagents",
      "packs",
      "mcpServers",
      "lint",
    ]) {
      expect(getProperty(settings, field)["description"]).toEqual(expect.any(String));
    }

    expect(getRecord(settingsSchema, "definitions")).not.toHaveProperty("TelemetryMode");
    expect(getRecord(settings, "properties")).not.toHaveProperty("telemetry");

    expect(agentId["title"]).toBe("Configurable Agent ID");
    expect(agentId["examples"]).toEqual(expect.arrayContaining(["claude-code", "codex"]));
    expect(agentId["enum"]).not.toContain("universal");

    const agents = getProperty(settings, "agents");
    expect(agents["uniqueItems"]).toBe(true);
  });

  it("publishes settings entry annotations inline", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const definitions = getRecord(settingsSchema, "definitions");

    for (const name of [
      "SkillEntry",
      "SubagentEntry",
      "McpServerEntry",
      "KnowledgeEntry",
      "PackEntry",
    ]) {
      const entry = getDefinition(settingsSchema, name);
      expect(entry["title"]).toEqual(expect.any(String));
      expect(entry["description"]).toEqual(expect.any(String));
      expect(entry["examples"]).toEqual(expect.any(Array));

      const anyOf = entry["anyOf"];
      if (!Array.isArray(anyOf) || !isRecord(anyOf[1])) {
        throw new Error(`Expected ${name} anyOf to contain an object arm.`);
      }
      const sourceField = getProperty(anyOf[1], "source");
      const sourceAnnotated = getAnnotatedAllOfRecord(sourceField);
      expect(sourceAnnotated["description"]).toContain("FQN");
    }

    expect(definitions).not.toHaveProperty("SkillEntryObject");
    expect(definitions).not.toHaveProperty("SubagentEntryObject");
    expect(definitions).not.toHaveProperty("McpServerEntryObject");
    expect(definitions).not.toHaveProperty("KnowledgeEntryObject");
    expect(definitions).not.toHaveProperty("PackEntryObject");

    const knowledgeEntry = getDefinition(settingsSchema, "KnowledgeEntry");
    const knowledgeArms = knowledgeEntry["anyOf"];
    if (!Array.isArray(knowledgeArms) || !isRecord(knowledgeArms[1])) {
      throw new Error("Expected KnowledgeEntry anyOf to contain an object arm.");
    }
    expect(getProperty(knowledgeArms[1], "instructionEntry")["description"]).toContain(
      "inherit the manifest default",
    );
  });

  it("publishes the Knowledge manifest instruction-entry default", () => {
    const schema = readGeneratedSchema("knowledge.schema.json");
    const manifest = getDefinition(schema, "KnowledgeManifest");
    const instructionEntry = getProperty(manifest, "instructionEntry");

    expect(instructionEntry).toMatchObject({ type: "boolean", default: true });
  });

  it("publishes lint rules map annotations inside settings schema", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const lintConfig = getDefinition(settingsSchema, "LintConfig");
    const rules = getProperty(lintConfig, "rules");
    const severity = getDefinition(settingsSchema, "LintRuleSeverity");

    expect(rules["title"]).toBe("Lint Rules Map");
    expect(rules["description"]).toContain("exact <namespace>/<name> rule ids");
    expect(severity["enum"]).toEqual(["off", "info", "warn", "error"]);
    expect(severity["description"]).toContain("raise or lower severity");
  });

  it("omits null arms from settings optional fields", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const settings = getDefinition(settingsSchema, "AxmSettings");

    for (const field of ["owner", "skills", "lint"]) {
      const serialized = JSON.stringify(getProperty(settings, field));
      expect(serialized).not.toContain('"type":"null"');
    }
  });

  it("references named key definitions via $ref in propertyNames", () => {
    const packSchema = readGeneratedSchema("pack.schema.json");
    const dependencies = getProperty(getDefinition(packSchema, "PackManifest"), "dependencies");
    const propertyNames = getPropertyNamesSchema(dependencies, packSchema);
    expect(propertyNames["$ref"]).toBe("#/definitions/NonPackExtensionFqn");

    const lockSchema = readGeneratedSchema("axm-lock.schema.json");
    const packLockEntry = getDefinition(lockSchema, "PackLockEntry");
    expect(getRecord(packLockEntry, "properties")).toHaveProperty("manifestContentIdentity");
    expect(getRecord(packLockEntry, "properties")).not.toHaveProperty("resolvedSkills");
  });
});
