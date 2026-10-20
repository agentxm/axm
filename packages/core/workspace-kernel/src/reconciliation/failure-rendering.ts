/**
 * The kernel failure rendering: every typed failure the workspace kernel
 * constructs or carries renders into the one `StepFailure` a plan step settles
 * with and the application boundary projects, so a failure reads the same on
 * both paths.
 *
 * Each family's classes and wording live once, beside their owner; this
 * module only lists the kernel's families and routes a failure to the family
 * that recognizes it. A failure an extension kind constructs renders
 * structurally from the rendering data its brand carries, so the kernel names
 * no kind. Feature families render beside their features, and the
 * application composes them with this rendering into its one catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
} from "@agentxm/registry-client";

import { NativeLocationError } from "../locations/index.js";
import {
  configFailures,
  workspaceRestorationFailures,
  workspaceStateFailures,
  workspaceStateReadFailures,
  workspaceTransactionFailures,
} from "../workspace-state/index.js";
import {
  agentIntegrationFailures,
  isExtensionKindFailure,
  materializationFailures,
} from "../materialization/index.js";
import {
  InstallSelectionUnavailable,
  StepFailure,
  defineFailureFamily,
  makeStepFailure,
  operationRefusals,
  type FailureFamily,
  type FailureOf,
  type FailureRendering,
} from "../operations/index.js";
import { WriteBackupRetained } from "../agent-adapters/index.js";
import { projectionFailures } from "../projection/index.js";
import { planExecutionFailures, resolutionFailures } from "../planning/index.js";

import { registryFailureDiagnostic } from "./failure-diagnostic.js";
import { registryAccessFailures } from "./registry-access-step-failure.js";

/** A rendered failure passes through unchanged. */
const renderedFailures = defineFailureFamily({
  classes: () => [StepFailure] as const,
  render: (failure: StepFailure) => failure,
});

const nativeLocationFailures = defineFailureFamily({
  classes: () => [NativeLocationError] as const,
  render: (failure: NativeLocationError) =>
    makeStepFailure({
      category: failure.reason === "unreadable" ? "unavailable" : "conflict",
      detail: `Native location ${failure.target} could not be used: ${failure.reason}`,
      cause: failure,
    }),
});

const installSelectionFailures = defineFailureFamily({
  classes: () => [InstallSelectionUnavailable] as const,
  render: (failure: InstallSelectionUnavailable) =>
    makeStepFailure({
      category: "usage",
      detail: "Unable to obtain an extension selection",
      recover:
        "Name the extensions with their per-type flags, take them all with --all, or use an interactive terminal.",
      cause: failure.cause,
    }),
});

/** A retained write backup reads as its inner failure plus where the original survives. */
const writeBackupFailures = defineFailureFamily({
  classes: () => [WriteBackupRetained] as const,
  render: (failure: WriteBackupRetained, rendering: FailureRendering): StepFailure => {
    const inner = renderKernelFailure(failure.cause, rendering);
    return makeStepFailure({
      category: inner.category,
      title: inner.title,
      detail: `${inner.detail}\nOriginal file backup retained at: ${failure.backupPath}`,
      problem: inner.problem,
      metadata: inner.metadata,
      retryable: inner.retryable,
      inputs: inner.inputs,
      suggestions: inner.suggestions,
      cause: inner.cause,
    });
  },
});

/**
 * Every family the kernel renders. The list is read when a failure is
 * recognized, not at module load: several of these families render through
 * this module, so they are read only after every module has loaded. Families
 * are disjoint, so the order only decides which family is asked first.
 */
const kernelFailureFamilies = () =>
  [
    renderedFailures,
    nativeLocationFailures,
    configFailures,
    workspaceStateReadFailures,
    workspaceStateFailures,
    workspaceTransactionFailures,
    workspaceRestorationFailures,
    planExecutionFailures,
    materializationFailures,
    agentIntegrationFailures,
    writeBackupFailures,
    projectionFailures,
    resolutionFailures,
    registryAccessFailures,
    operationRefusals,
    installSelectionFailures,
  ] as const;

/** Every typed failure the workspace kernel constructs or carries. */
export type KernelFailure = FailureOf<ReturnType<typeof kernelFailureFamilies>[number]>;

const familyOf = (failure: unknown): FailureFamily<unknown> | undefined => {
  const families: ReadonlyArray<FailureFamily<unknown>> = kernelFailureFamilies();
  return families.find((family) => family.is(failure));
};

/** Whether an untyped failure is one the workspace kernel renders. */
export const isKernelFailure = (failure: unknown): failure is KernelFailure =>
  familyOf(failure) !== undefined;

/**
 * Render one kernel failure within a composer's rendering. Every kernel
 * failure belongs to a family; a value that only claims the type renders as
 * the internal failure the boundary reports for anything it does not
 * recognize.
 */
const renderKernelFailureDetails = (
  failure: KernelFailure,
  rendering: FailureRendering,
): StepFailure =>
  familyOf(failure)?.render(failure, rendering) ??
  makeStepFailure({ category: "internal", cause: failure });

/** The sentence a kernel failure reads with, or none for a failure the kernel does not render. */
export const kernelFailureDetail = (failure: unknown): string | undefined =>
  isKernelFailure(failure) ? kernelFailureToStepFailure(failure).detail : undefined;

/**
 * Render one kernel failure on its own, where the kernel's families are every
 * failure the caller can carry.
 */
export const kernelFailureToStepFailure = (failure: KernelFailure): StepFailure =>
  renderKernelFailure(failure, { detailOf: kernelFailureDetail });

/** Keep the known producer identity on every serialized and direct rendering. */
export const renderKernelFailure = (
  failure: KernelFailure,
  rendering: FailureRendering,
): StepFailure => {
  const rendered = renderKernelFailureDetails(failure, rendering);
  if (rendered.diagnostic !== undefined)
    return failure instanceof StepFailure
      ? rendered
      : new StepFailure({ ...rendered, cause: failure });
  const registry =
    failure instanceof RegistryProblem ||
    failure instanceof RegistryRequestFailed ||
    failure instanceof RegistryOperationFailed
      ? registryFailureDiagnostic(failure)
      : undefined;
  const kind = isExtensionKindFailure(failure)
    ? "extension.kind-failure"
    : "_tag" in failure && typeof failure._tag === "string"
      ? failure._tag.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase()
      : "diagnostic.unclassified";
  return new StepFailure({
    ...rendered,
    cause: failure instanceof StepFailure ? failure.cause : failure,
    diagnostic: registry ?? {
      kind: failure instanceof StepFailure ? "diagnostic.unclassified" : kind,
      operation: "workspace.operation",
    },
  });
};
