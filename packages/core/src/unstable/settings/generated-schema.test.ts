import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const generatedSchemasDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../site-content/__generated__/schemas",
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
  "command.schema.json",
  "mcp.schema.json",
  "subagent.schema.json",
  "pack.schema.json",
  "files.schema.json",
  "rule.schema.json",
  "hook.schema.json",
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

const getPropertyNamesSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
  if (isRecord(schema["propertyNames"])) {
    return schema["propertyNames"];
  }

  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    for (const entry of allOf) {
      if (isRecord(entry) && isRecord(entry["propertyNames"])) {
        return entry["propertyNames"];
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
    expect(versionRange["pattern"]).toBe("^[~^<>=*xXvV0-9A-Za-z| .-]+$");
    expect(versionRange["examples"]).toContain(">=1 <3");
  });

  it("publishes integer lockfile version constraints without special number strings", () => {
    const lockSchema = readGeneratedSchema("axm-lock.schema.json");
    const lockfileVersion = getProperty(getDefinition(lockSchema, "Lockfile"), "lockfileVersion");

    expect(lockfileVersion["type"]).toBe("integer");
    expect(lockfileVersion).not.toHaveProperty("anyOf");

    const constraints = lockfileVersion["allOf"];
    expect(Array.isArray(constraints)).toBe(true);
    if (!Array.isArray(constraints) || !isRecord(constraints[0])) {
      return;
    }
    expect(constraints[0]["minimum"]).toBe(1);
    expect(constraints[0]["default"]).toBe(2);
  });

  it("publishes common manifest field annotations", () => {
    const commandSchema = readGeneratedSchema("command.schema.json");
    const manifest = getDefinition(commandSchema, "CommandManifest");

    for (const field of ["license", "bugs", "repository", "homepage", "keywords"]) {
      const fieldSchema = getOptionalFieldExamplesRecord(
        commandSchema,
        getProperty(manifest, field),
      );
      expect(fieldSchema["examples"]).toEqual(expect.any(Array));
    }

    const repositoryDefinition = resolveRefIfPresent(
      commandSchema,
      getFirstAnyOfRecord(getProperty(manifest, "repository")),
    );
    const repositoryStringBranch = getFirstAnyOfRecord(repositoryDefinition);
    expect(repositoryStringBranch["format"]).toBe("uri-reference");
    expect(getFirstAnyOfRecord(getProperty(manifest, "homepage"))["format"]).toBe("uri");
  });

  it("publishes typed record-key patterns for settings maps", () => {
    const settingsSchema = readGeneratedSettingsSchema();

    for (const name of ["SkillsMap", "CommandsMap", "McpServersMap", "SubagentsMap", "PacksMap"]) {
      const mapSchema = getDefinition(settingsSchema, name);
      const propertyNames = getPropertyNamesSchema(mapSchema);
      expect(getStringPattern(propertyNames)).toBe("^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$");
    }
  });

  it("publishes settings usability annotations", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const settings = getDefinition(settingsSchema, "AxmSettings");
    const telemetry = getDefinition(settingsSchema, "TelemetryMode");
    const agentId = getDefinition(settingsSchema, "ConfigurableAgentId");

    expect(settingsSchema["$ref"]).toBe("#/definitions/AxmSettings");
    expect(settings["title"]).toBe("AXM Settings");
    expect(settings["examples"]).toEqual(expect.any(Array));

    for (const field of [
      "telemetry",
      "owner",
      "agents",
      "sources",
      "rulesConfig",
      "skills",
      "skillsConfig",
      "commands",
      "commandsConfig",
      "subagents",
      "subagentsConfig",
      "packs",
      "packsConfig",
      "mcpServers",
      "mcpServersConfig",
      "lint",
    ]) {
      expect(getProperty(settings, field)["description"]).toEqual(expect.any(String));
    }

    expect(telemetry["title"]).toBe("Telemetry Mode");
    expect(telemetry["examples"]).toEqual(expect.arrayContaining([true, "errors", false]));

    expect(agentId["title"]).toBe("Configurable Agent ID");
    expect(agentId["examples"]).toEqual(expect.arrayContaining(["claude-code", "codex"]));
    expect(agentId["enum"]).not.toContain("universal");

    const agents = getProperty(settings, "agents");
    expect(agents["allOf"]).toEqual(expect.arrayContaining([{ uniqueItems: true }]));
  });

  it("publishes settings entry annotations inline", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const definitions = getRecord(settingsSchema, "definitions");

    for (const name of [
      "SkillEntry",
      "CommandEntry",
      "SubagentEntry",
      "McpServerEntry",
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
    expect(definitions).not.toHaveProperty("CommandEntryObject");
    expect(definitions).not.toHaveProperty("SubagentEntryObject");
    expect(definitions).not.toHaveProperty("McpServerEntryObject");
    expect(definitions).not.toHaveProperty("PackEntryObject");
  });

  it("publishes lint rules map annotations inside settings schema", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const lintConfig = getDefinition(settingsSchema, "LintConfig");
    const rules = getProperty(lintConfig, "rules");

    expect(rules["title"]).toBe("Lint Rules Map");
    expect(rules["description"]).toContain("exact <namespace>/<name> rule ids");
  });

  it("omits null arms from settings optional fields", () => {
    const settingsSchema = readGeneratedSettingsSchema();
    const settings = getDefinition(settingsSchema, "AxmSettings");

    for (const field of ["telemetry", "owner", "skills", "lint"]) {
      const serialized = JSON.stringify(getProperty(settings, field));
      expect(serialized).not.toContain('"type":"null"');
    }
  });

  it("references named key definitions via $ref in propertyNames", () => {
    const packSchema = readGeneratedSchema("pack.schema.json");
    const dependencies = getProperty(getDefinition(packSchema, "PackManifest"), "dependencies");
    const propertyNames = getPropertyNamesSchema(dependencies);
    expect(propertyNames["$ref"]).toBe("#/definitions/NonPackExtensionFqn");

    const lockSchema = readGeneratedSchema("axm-lock.schema.json");
    for (const definitionName of ["RegistryPackLockEntry", "WorkspacePackLockEntry"]) {
      const resolvedSkills = getProperty(
        getDefinition(lockSchema, definitionName),
        "resolvedSkills",
      );
      const lockPropertyNames = getPropertyNamesSchema(resolvedSkills);
      expect(lockPropertyNames["$ref"]).toBe("#/definitions/ExtensionFqn");
    }
  });
});
