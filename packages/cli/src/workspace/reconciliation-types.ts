import type * as FileSystem from "@effect/platform/FileSystem";
import type * as Path from "@effect/platform/Path";
import type { CliError } from "../cli-error/index.js";
import type {
  CommandLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  SkillLockEntry,
} from "../lockfile/index.js";
import type { Settings } from "../settings/index.js";

export type ReconcileExtensionType = "skills" | "commands" | "mcp-servers" | "packs";

export type UnresolvedReason = "missing" | "invalid" | "declaration-mismatch";

export interface ReconciliationDeclaration {
  readonly extensionType: ReconcileExtensionType;
  readonly namespace: string;
  readonly name: string;
  readonly declarationSourceOrConstraint: string;
  readonly source: string;
  readonly order: number;
  readonly origin: "settings" | "pack";
}

export interface ReconciliationContext {
  readonly baseDir: string;
  readonly now: Date;
  readonly defaultNamespace: string;
  readonly agents: ReadonlyArray<string>;
  readonly settings: Settings;
}

export interface AdapterEnvironment {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

export type ReconstructedLockEntry =
  | {
      readonly extensionType: "skills";
      readonly name: string;
      readonly entry: SkillLockEntry;
    }
  | {
      readonly extensionType: "commands";
      readonly name: string;
      readonly entry: CommandLockEntry;
    }
  | {
      readonly extensionType: "mcp-servers";
      readonly name: string;
      readonly entry: McpServerLockEntry;
    }
  | {
      readonly extensionType: "packs";
      readonly name: string;
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
  readonly extensionType: ReconcileExtensionType;
  readonly scanDeclarations: (
    context: ReconciliationContext,
    env: AdapterEnvironment,
  ) => import("effect/Effect").Effect<DeclarationScanResult, CliError>;
  readonly checkDiskCompatibility: (
    declaration: ReconciliationDeclaration,
    context: ReconciliationContext,
    env: AdapterEnvironment,
  ) => import("effect/Effect").Effect<DeclarationResolution, CliError>;
}
