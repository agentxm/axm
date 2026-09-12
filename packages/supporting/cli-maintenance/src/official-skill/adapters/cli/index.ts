/** CLI presentation of official-skill compatibility and its recovery outcome. */
import * as Schema from "effect/Schema";
import {
  AxmSkillCompatibilityRecoverySchema,
  AxmSkillCompatibilitySchema,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityRecovery,
} from "../../domain/index.js";

export const AXM_SKILL_BUNDLED_PREVIEW_COMMAND =
  "axm skills install @agentxm/skills/axm --bundled --preview";
export const AXM_SKILL_BUNDLED_APPLY_COMMAND = "axm skills install @agentxm/skills/axm --bundled";
export const AXM_SKILL_REGISTRY_PREVIEW_COMMAND = "axm skills update --name axm --preview";
export const AXM_SKILL_REGISTRY_APPLY_COMMAND = "axm skills update --name axm";

export const AxmSkillCompatibilityRecoveryStepSchema = Schema.Struct({
  boundary: Schema.Literals(["executable", "workspace", "verification"] as const),
  command: Schema.String,
  preview: Schema.Boolean,
});
export type AxmSkillCompatibilityRecoveryStep = typeof AxmSkillCompatibilityRecoveryStepSchema.Type;

export const formatAxmSkillCompatibilityTarget = (target: {
  readonly targetCliVersion: string | null;
  readonly targetSkillVersion: string | null;
}): string =>
  `AXM CLI ${target.targetCliVersion ?? "unknown"} + official AXM skill ${target.targetSkillVersion ?? "unknown"}`;

export const CliAxmSkillRecoverySchema = Schema.Struct({
  ...AxmSkillCompatibilityRecoverySchema.fields,
  nextAction: Schema.NullOr(Schema.String),
  steps: Schema.Array(AxmSkillCompatibilityRecoveryStepSchema),
});
export type CliAxmSkillRecovery = typeof CliAxmSkillRecoverySchema.Type;
export const CliAxmSkillCompatibilitySchema = Schema.Struct({
  ...AxmSkillCompatibilitySchema.fields,
  recovery: CliAxmSkillRecoverySchema,
});
export type CliAxmSkillCompatibility = typeof CliAxmSkillCompatibilitySchema.Type;

const step = (
  boundary: AxmSkillCompatibilityRecoveryStep["boundary"],
  command: string,
  preview = false,
): AxmSkillCompatibilityRecoveryStep => ({ boundary, command, preview });

/** Choose commands only after the domain has selected the recovery action. */
export const renderAxmSkillRecovery = (
  recovery: AxmSkillCompatibilityRecovery,
): CliAxmSkillRecovery => {
  const steps = (() => {
    switch (recovery.action) {
      case "none":
        return [];
      case "inspect-cli":
        return [step("verification", "axm --version"), step("verification", "axm lint")];
      case "upgrade-cli":
        return [step("executable", "axm upgrade"), step("verification", "axm lint")];
      case "preserve-authored-skill":
        return [step("verification", "axm help upgrade")];
      case "install-bundled-skill":
        return [
          step("workspace", AXM_SKILL_BUNDLED_PREVIEW_COMMAND, true),
          step("workspace", AXM_SKILL_BUNDLED_APPLY_COMMAND),
          step("verification", "axm lint"),
        ];
      case "update-registry-skill":
        return [
          step("workspace", AXM_SKILL_REGISTRY_PREVIEW_COMMAND, true),
          step("workspace", AXM_SKILL_REGISTRY_APPLY_COMMAND),
          step("verification", "axm lint"),
        ];
    }
  })();
  return { ...recovery, nextAction: steps[0]?.command ?? null, steps };
};

export const renderAxmSkillCompatibility = (
  compatibility: AxmSkillCompatibility,
): CliAxmSkillCompatibility => ({
  ...compatibility,
  recovery: renderAxmSkillRecovery(compatibility.recovery),
});
