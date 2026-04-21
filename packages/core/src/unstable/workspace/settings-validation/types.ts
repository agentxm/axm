/**
 * Subject a blocker is attributed to. Inlined from the former
 * `workspace/doctor/types` module; the doctor command was removed in the
 * lint-engine migration, but the settings-validation blocker types continue
 * to share this shape with sync-less consumers (e.g. `previewOrApplyPlan`'s
 * readiness reports).
 */
export interface FindingSubject {
  readonly kind: "extension" | "agent" | "file" | "workspace";
  readonly ref: string;
}

export type SettingsEntryBlockerReason =
  | "entry-malformed"
  | "source-not-found"
  | "source-multiple-matches"
  | "source-resolution-failed"
  | "source-timeout";

export interface SettingsEntryBlocker {
  readonly reason: SettingsEntryBlockerReason;
  readonly subject: FindingSubject;
  readonly message: string;
  readonly hint: string;
}

export type LockfileBlockerReason =
  | "lockfile-entry-missing"
  | "lockfile-entry-stale"
  | "lockfile-entry-orphaned";

export interface LockfileBlocker {
  readonly reason: LockfileBlockerReason;
  readonly subject: FindingSubject;
  readonly message: string;
  readonly hint: string;
}
