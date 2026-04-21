import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const generatedSettingsSchemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../site-content/__generated__/schemas/settings.schema.json",
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readGeneratedSettingsSchema = (): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(generatedSettingsSchemaPath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("Expected generated settings schema to contain a JSON object.");
  }
  return parsed;
};

describe("generated settings schema", () => {
  it("includes the lint configuration surface", () => {
    const schema = readGeneratedSettingsSchema();
    const definitions = schema["definitions"];
    expect(isRecord(definitions)).toBe(true);
    if (!isRecord(definitions)) {
      return;
    }

    const settingsDefinition = definitions["Settings"];
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
});
