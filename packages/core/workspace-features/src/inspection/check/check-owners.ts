import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { LintJsonFinding } from "@agentxm/extension-content/lint";
import type {
  NativeDirectoryInputs,
  NativeLocationOutcome,
} from "@agentxm/workspace-kernel/locations";
import type { MaterializationTransition } from "@agentxm/workspace-kernel/operations";
import type { SyncSelection } from "@agentxm/workspace-kernel/reconciliation";
import type { DesiredStateGraph } from "@agentxm/workspace-kernel/workspace-state";
import type { CheckSubject } from "./check-scope.js";

/** Assessment owners are composed by the application; feature slices stay independent. */
export interface LocalCheckOwners<
  LintError,
  LintRequirements,
  ConvergenceError,
  ConvergenceRequirements,
> {
  readonly lint: (args: {
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
    readonly platform: { readonly fs: FileSystem.FileSystem; readonly path: Path.Path };
    readonly workspaceRoot: string;
    readonly userHome: string;
    readonly scope: "project" | "user";
    readonly desiredState: DesiredStateGraph;
    readonly subjects: ReadonlyArray<CheckSubject>;
  }) => Effect.Effect<
    {
      readonly findings: ReadonlyArray<LintJsonFinding>;
      readonly observedPackages: ReadonlyArray<CheckSubject & { readonly observed: boolean }>;
      readonly inlineSubjects: ReadonlyArray<CheckSubject>;
    },
    LintError,
    LintRequirements
  >;
  readonly convergence: (selection: SyncSelection) => Effect.Effect<
    {
      readonly cleanupSafe: boolean;
      readonly unassessed: ReadonlyArray<CheckSubject & { readonly reason: string }>;
      readonly steps: ReadonlyArray<{
        readonly key: string | undefined;
        readonly label: string;
        readonly readiness: "ready" | "warn" | "error";
        readonly message: string | undefined;
        readonly transitions: ReadonlyArray<MaterializationTransition>;
        readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
      }>;
    },
    ConvergenceError,
    ConvergenceRequirements
  >;
}
