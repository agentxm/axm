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
 * Ownership of whatever occupies an instruction target path, proven by
 * inspection alone: a symlink that resolves to the canonical source, or an
 * `axm:file` banner. Nothing is remembered between commands. `unowned` is a
 * collision with content AXM did not produce; it is reported and never
 * modified.
 */
export type InstructionTargetOwnership = "absent" | "owned-current" | "owned-drift" | "unowned";

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
  readonly details: string;
}
