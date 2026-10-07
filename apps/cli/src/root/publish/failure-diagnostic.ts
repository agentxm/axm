import type { PublishResult } from "@agentxm/workspace-features/publishing";
import type { FailureDiagnostic } from "@agentxm/workspace-kernel/operations";
import type { AppErrorCode } from "../../app-error/index.js";
import type { CommandSettlementFailure } from "../../cli-runtime/telemetry.js";
import type { TelemetryFailureReport } from "../../telemetry/payloads.js";

/** Every distinct failed mechanism survives; labels and extension content stay local. */
export const publishResultFailure = (
  result: PublishResult,
  fallbackCode: AppErrorCode,
): CommandSettlementFailure => {
  const root = result.execution.failure;
  const failures = [
    ...(root === undefined ? [] : [{ code: root.code, diagnostic: root.diagnostic }]),
    ...result.execution.outcomes.flatMap((item) =>
      item.cause === undefined
        ? []
        : [
            {
              code: item.cause.code,
              diagnostic: item.cause.diagnostic,
            },
          ],
    ),
  ];
  const summaries: Array<NonNullable<TelemetryFailureReport["related"]>[number]> = [];
  for (const failure of failures) {
    const diagnostic = failure.diagnostic;
    const existing = summaries.findIndex(
      (entry) => entry.kind === diagnostic.kind && entry.operation === diagnostic.operation,
    );
    const current = summaries[existing];
    if (current === undefined) summaries.push({ ...diagnostic, count: 1 });
    else summaries[existing] = { ...current, count: current.count + 1 };
  }
  const first = failures[0];
  const [summary] = summaries;
  const diagnostic: FailureDiagnostic =
    summary === undefined
      ? { kind: "diagnostic.unclassified", operation: "publish.execution" }
      : summaries.length === 1
        ? {
            kind: summary.kind,
            operation: summary.operation,
            ...(summary.request === undefined ? {} : { request: summary.request }),
          }
        : { kind: "publish.multiple-failures", operation: "publish.execution" };
  return {
    ...diagnostic,
    code:
      first !== undefined && failures.every((entry) => entry.code === first.code)
        ? first.code
        : fallbackCode,
    phase: "command",
    handled: true,
    counts: {
      confirmed: result.counts.published + result.counts.alreadyPublished,
      failed: result.counts.failed,
      blocked: result.counts.blocked,
      unattempted: result.counts.pending,
      unknown: result.counts.unknown,
    },
    ...(summaries.length > 0
      ? { related: summaries.slice(0, 8), relatedOmitted: Math.max(0, summaries.length - 8) }
      : {}),
  };
};
