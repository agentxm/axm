import type * as FileSystem from "effect/FileSystem";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import type { ExtensionName, ExtensionTypePlural } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import type {
  CommandLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { Settings } from "../settings/index.js";

export type ReconcileExtensionType = Extract<
  ExtensionTypePlural,
  "skills" | "commands" | "mcp-servers" | "subagents" | "packs"
>;

export type UnresolvedReason = "missing" | "invalid" | "declaration-mismatch";

export interface ReconciliationDeclaration {
  readonly type: ReconcileExtensionType;
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly declarationSourceOrConstraint: string;
  readonly source: string;
  readonly order: number;
  readonly origin: "settings" | "pack";
}

export interface ReconciliationContext {
  readonly baseDir: string;
  readonly now: Date;
  /**
   * Configured workspace owner used as the fallback for declarations whose
   * source does not parse as a registry FQN. `Option.none` when no owner is
   * configured; adapters surface a warning and skip the declaration.
   */
  readonly configuredOwner: Option.Option<Handle>;
  readonly agents: ReadonlyArray<string>;
  readonly settings: Settings;
}

/**
 * Adapter-facing runtime dependencies.
 *
 * The reconciliation flow resolves shared Effect services at the orchestration
 * boundary and passes them into adapters explicitly so the adapter contract
 * does not need to expose FileSystem/Path in its own `R` type.
 */
export interface AdapterEnvironment {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

export type ReconstructedLockEntry =
  | {
      readonly type: "skills";
      readonly name: ExtensionName;
      readonly entry: SkillLockEntry;
    }
  | {
      readonly type: "commands";
      readonly name: ExtensionName;
      readonly entry: CommandLockEntry;
    }
  | {
      readonly type: "mcp-servers";
      readonly name: ExtensionName;
      readonly entry: McpServerLockEntry;
    }
  | {
      readonly type: "subagents";
      readonly name: ExtensionName;
      readonly entry: SubagentLockEntry;
    }
  | {
      readonly type: "packs";
      readonly name: ExtensionName;
      readonly entry: PackLockEntry;
    };

export type DeclarationResolution =
  | {
      readonly _tag: "Compatible";
      readonly reconstructed: ReconstructedLockEntry;
    }
  | {
      readonly _tag: "Unresolved";
      readonly declaration: ReconciliationDeclaration;
      readonly reason: UnresolvedReason;
    };

export interface DeclarationScanResult {
  readonly declarations: ReadonlyArray<ReconciliationDeclaration>;
  readonly warnings: ReadonlyArray<string>;
}

export interface ReconciliationAdapter {
  readonly type: ReconcileExtensionType;
  readonly scanDeclarations: (
    context: ReconciliationContext,
    env: AdapterEnvironment,
  ) => import("effect/Effect").Effect<DeclarationScanResult, AppError>;
  readonly checkDiskCompatibility: (
    declaration: ReconciliationDeclaration,
    context: ReconciliationContext,
    env: AdapterEnvironment,
  ) => import("effect/Effect").Effect<DeclarationResolution, AppError>;
}
