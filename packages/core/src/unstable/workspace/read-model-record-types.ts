/**
 * Read-model record row shape returned by `WorkspaceReadModelRecords.rows`.
 *
 * One row union covers every extension type; the `lifecycle` discriminant
 * carries whether the row is declared in settings (`configured`), installed
 * indirectly through a pack or lockfile entry (`implicit`), or observed on
 * disk without a claim (`unmanaged`). Narrowing helpers live in
 * `read-model-record-rows.ts`.
 *
 * @internal
 */

import type * as Option from "effect/Option";

export type PackagingKind = "native" | "non-native";

export type ReadModelRecordRow =
  | {
      readonly type: string;
      readonly name: string;
      readonly source: string;
      readonly enabled: boolean;
      readonly packagingKind: PackagingKind;
      readonly lifecycle: "configured";
    }
  | {
      readonly type: string;
      readonly name: string;
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly lifecycle: "implicit";
    }
  | {
      readonly type: string;
      readonly name: string;
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly locations: ReadonlyArray<string>;
      readonly agents: ReadonlyArray<string>;
      readonly ownershipEvidence: ReadonlyArray<string>;
      readonly lifecycle: "unmanaged";
    };
