import * as Schema from "effect/Schema";
import type { CommandCapabilities } from "./root/shared/command-capabilities.js";
import { MACHINE_OUTPUT_CONTRACT_ROWS } from "./machine-output-contracts.js";

export const OutputContractSummarySchema = Schema.Struct({
  class: Schema.Literals([
    "formatter-help",
    "structured-result",
    "json-refused",
    "external-document",
    "json-schema-document",
  ]),
  modes: Schema.Array(Schema.Literals(["query", "preview", "apply"])),
  effects: Schema.String,
  meaning: Schema.String,
  schemaCommand: Schema.String,
});
export type OutputContractSummary = typeof OutputContractSummarySchema.Type;

export const commandOutputModes = (
  capabilities: CommandCapabilities,
): ReadonlyArray<"query" | "preview" | "apply"> => {
  const effects = [capabilities.effect, ...(capabilities.modes ?? []).map((mode) => mode.effect)];
  return [
    ...(effects.includes("none") ? ["query" as const] : []),
    ...(capabilities.preview ? ["preview" as const] : []),
    ...(effects.some((effect) => effect !== "none") ? ["apply" as const] : []),
  ];
};

const commandEffects = (capabilities: CommandCapabilities): string =>
  [
    capabilities.effect === "none"
      ? "Default: read only."
      : `Default: changes ${capabilities.effect}.`,
    ...(capabilities.preview ? ["--preview: assess without applying."] : []),
    ...(capabilities.modes ?? []).map(
      (mode) => `${mode.flag}: ${mode.effect === "none" ? "read only" : `changes ${mode.effect}`}.`,
    ),
  ].join(" ");

/** One register supplies human help, machine help, and focused discovery. */
export const outputContractSummary = (
  path: string,
  capabilities?: CommandCapabilities,
): OutputContractSummary | undefined => {
  const family = MACHINE_OUTPUT_CONTRACT_ROWS.find((row) => row.path === path)?.family;
  return family === undefined
    ? undefined
    : {
        class: family.outputClass,
        modes: capabilities === undefined ? family.modes : commandOutputModes(capabilities),
        effects: capabilities === undefined ? family.effects : commandEffects(capabilities),
        meaning: family.rationale,
        schemaCommand: `axm schema${path === "axm" ? "" : ` ${path.slice(4)}`}`,
      };
};
