import type { FindingSubject } from "../doctor/types.js";

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
