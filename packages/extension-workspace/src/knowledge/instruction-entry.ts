/** Effective policy for one Knowledge bundle's compact instruction-table entry. */

export type KnowledgeInstructionEntryReason =
  | "bundle-disabled"
  | "instruction-files-disabled"
  | "knowledge-instructions-disabled"
  | "workspace-excluded"
  | "manifest-excluded"
  | "included";

export interface KnowledgeInstructionEntryResolution {
  readonly included: boolean;
  readonly reason: KnowledgeInstructionEntryReason;
}

/**
 * Resolve the ordered gates for one compact Knowledge instruction entry.
 * Concepts remain governed by bundle enablement and do not use this result.
 */
export const resolveKnowledgeInstructionEntry = (args: {
  readonly bundleEnabled: boolean;
  readonly instructionFilesEnabled: boolean;
  readonly knowledgeInstructionsEnabled: boolean;
  readonly workspaceInstructionEntry?: boolean;
  readonly manifestInstructionEntry?: boolean;
}): KnowledgeInstructionEntryResolution => {
  if (!args.bundleEnabled) return { included: false, reason: "bundle-disabled" };
  if (!args.instructionFilesEnabled) {
    return { included: false, reason: "instruction-files-disabled" };
  }
  if (!args.knowledgeInstructionsEnabled) {
    return { included: false, reason: "knowledge-instructions-disabled" };
  }
  if (args.workspaceInstructionEntry === false) {
    return { included: false, reason: "workspace-excluded" };
  }
  if (args.workspaceInstructionEntry === undefined && args.manifestInstructionEntry === false) {
    return { included: false, reason: "manifest-excluded" };
  }
  return { included: true, reason: "included" };
};
