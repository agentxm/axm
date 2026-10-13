/**
 * The operator's whole-file projection overrides for one invocation.
 *
 * Two policies guard whole-file projections: AXM never overwrites a file at a
 * planned path that it has no record of writing, and it never deletes a
 * recorded file whose bytes changed since its last write. A command that can
 * write such a file offers `--replace-unrecorded`; a command that can delete
 * one offers `--discard-modified`. The command provides its parsed flags here
 * once, at its boundary, and every projection writer and remover it reaches
 * reads them, so no closure, plan builder, or manager contract carries them.
 *
 * A field is absent when the command does not offer that flag. Absent and
 * `false` both keep the policy; the difference is only whether a recovery may
 * name the flag, so no refusal sends a reader to a flag their command lacks.
 *
 * @experimental This API is unstable and may change without notice.
 */
import * as ServiceMap from "effect/Context";

export interface ProjectionOutputPostureValue {
  /** Overwrite a differing file at a planned path that AXM has no record of writing. */
  readonly replaceUnrecorded?: boolean;
  /** Delete recorded files even when they were modified since AXM last wrote them. */
  readonly discardModified?: boolean;
}

export const ProjectionOutputPosture = ServiceMap.Reference<ProjectionOutputPostureValue>(
  "@agentxm/workspace-kernel/projection/ProjectionOutputPosture",
  { defaultValue: () => ({}) },
);

/** The override spelling a recovery names for an unrecorded file at a planned path. */
export const REPLACE_UNRECORDED_FLAG = "--replace-unrecorded";

/** The override spelling a retention warning names for a modified recorded file. */
export const DISCARD_MODIFIED_FLAG = "--discard-modified";
