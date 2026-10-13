import * as Schema from "effect/Schema";

/**
 * How AXM realizes an instruction target. `none` marks a configured agent
 * with no projectable convention, so nothing is written or inspected for it.
 */
export type InstructionMechanism = "native" | "symlink" | "copy" | "adapter" | "none";

export const InstructionHealthSchema = Schema.Literals([
  "ok",
  "missing-source",
  "missing-target",
  "drift",
  "broken-link",
  "unsupported",
  "stale",
]).annotate({ identifier: "InstructionHealth" });
export type InstructionHealth = typeof InstructionHealthSchema.Type;

/**
 * Ownership of whatever occupies an instruction target path. A symlink is
 * proven by resolving to the canonical source. A copy is judged against its
 * recorded projection row: `owned-current` when the recorded generation is
 * current, `owned-drift` when a recorded copy needs rewriting, and
 * `owned-unrecorded-identical` when unrecorded bytes already equal the source
 * and only need recording. `unowned` is a differing file AXM has no record of
 * writing; it is reported and modified only on explicit intent.
 */
export type InstructionTargetOwnership =
  "absent" | "owned-current" | "owned-drift" | "owned-unrecorded-identical" | "unowned";

/** The form present at a target path — what is on disk, not what sync would choose. */
export type ObservedInstructionForm =
  "none" | "symlink" | "broken-link" | "copy" | "file" | "directory";

export interface InstructionStatusItem {
  readonly root: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly sourceFile: string;
  readonly targetFile: string;
  readonly mechanism: InstructionMechanism;
  readonly health: InstructionHealth;
  readonly ownership: InstructionTargetOwnership;
  readonly observedForm: ObservedInstructionForm;
  /** How bytes a planned copy rewrite replaces compare with AXM's last write. */
  readonly lastWrite?: "matches" | "modified" | "unrecorded" | "absent";
  readonly details: string;
}
