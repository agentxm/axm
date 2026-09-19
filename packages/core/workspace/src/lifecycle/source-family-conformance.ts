/**
 * Total lifecycle support policy by extension type, source family, and operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as EffectRecord from "effect/Record";

import {
  extensionSourceFamilies,
  extensionTypes,
  type ExtensionSourceFamily,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";

/** Operations covered by the type-by-source-family lifecycle contract. */
export const SOURCE_FAMILY_LIFECYCLE_OPERATIONS = [
  "list",
  "install",
  "reinstall-from-lock",
  "update",
  "inspect",
  "enable",
  "disable",
  "sync",
  "uninstall",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type SourceFamilyLifecycleOperation = (typeof SOURCE_FAMILY_LIFECYCLE_OPERATIONS)[number];

/** A source-family lifecycle cell is implemented and expected to succeed. */
export interface SupportedLifecycleCell {
  readonly outcome: "supported";
}

/** A lifecycle operation deliberately does not apply to a source family. */
export interface UnsupportedLifecycleCell {
  readonly outcome: "unsupported-by-design";
  /** Stable public design reason, not an implementation gap. */
  readonly decision: string;
}

/** A required lifecycle cell whose implementation has not landed yet. */
export interface BlockedLifecycleCell {
  readonly outcome: "blocked";
  readonly reason: string;
}

/** The recorded result required for every type, family, and operation cell. */
export type SourceFamilyLifecycleOutcome =
  SupportedLifecycleCell | UnsupportedLifecycleCell | BlockedLifecycleCell;

/** One executable row of the source-family lifecycle decision table. */
export interface SourceFamilyLifecycleCell {
  readonly type: ExtensionType;
  readonly family: ExtensionSourceFamily;
  readonly operation: SourceFamilyLifecycleOperation;
  readonly result: SourceFamilyLifecycleOutcome;
}

const supported: SupportedLifecycleCell = { outcome: "supported" };

const externalFamilyOperations: Record<
  SourceFamilyLifecycleOperation,
  SourceFamilyLifecycleOutcome
> = EffectRecord.fromEntries(
  SOURCE_FAMILY_LIFECYCLE_OPERATIONS.map((operation) => [operation, supported]),
);

const workspaceFamilyOperations: Record<
  SourceFamilyLifecycleOperation,
  SourceFamilyLifecycleOutcome
> = {
  ...externalFamilyOperations,
  "reinstall-from-lock": {
    outcome: "unsupported-by-design",
    decision:
      "docs/architecture/workspace/lockfile.md#non-responsibilities — workspace-authored content has no external-resolution row",
  },
  update: {
    outcome: "unsupported-by-design",
    decision:
      "docs/architecture/commands/update.md#responsibilities — workspace-authored targets do not advance through source update",
  },
};

/**
 * Source-family lifecycle outcomes shared by every extension type.
 *
 * Source-specific behavior ends at the accepted reference. Once installed,
 * inspection, activation, reconciliation, and retirement are deliberately
 * type-driven rather than family-driven. Workspace-authored packages are the
 * two explicit exceptions: they have no lock resolution to reacquire and are
 * advanced by editing their authored content before sync.
 */
export const SOURCE_FAMILY_LIFECYCLE_OUTCOMES: Record<
  ExtensionSourceFamily,
  Record<SourceFamilyLifecycleOperation, SourceFamilyLifecycleOutcome>
> = EffectRecord.fromEntries(
  extensionSourceFamilies.map((family) => [
    family,
    family === "workspace" ? workspaceFamilyOperations : externalFamilyOperations,
  ]),
);

/**
 * The complete executable decision table. Deriving its type axis from the
 * canonical extension table makes a newly added extension type add its whole
 * source-family lifecycle row automatically.
 */
export const SOURCE_FAMILY_LIFECYCLE_CELLS: ReadonlyArray<SourceFamilyLifecycleCell> =
  extensionTypes.flatMap((type) =>
    extensionSourceFamilies.flatMap((family) =>
      SOURCE_FAMILY_LIFECYCLE_OPERATIONS.map((operation) => ({
        type,
        family,
        operation,
        result: SOURCE_FAMILY_LIFECYCLE_OUTCOMES[family][operation],
      })),
    ),
  );
