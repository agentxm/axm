import * as Layer from "effect/Layer";
import { UpgradeExecutionObserver } from "@agentxm/cli-maintenance/self-update/application";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  makeThrottledUnitProgress,
  observeChildUnit,
  observeUnit,
} from "@agentxm/workspace/transitions/planning";
import { methodName } from "@agentxm/cli-maintenance/self-update/domain";
import {
  formatRecommendedCommand,
  methodLabel,
} from "@agentxm/cli-maintenance/self-update/adapters/cli";
import type {
  CommandRecord,
  InspectedInstallation,
  SelectedRelease,
  UpgradeExecutionObserverService,
} from "@agentxm/cli-maintenance/self-update/application";

/** CLI labels, progress timing, and command identities live for one composed invocation. */
export const makeCliUpgradeExecutionObserver = (): Effect.Effect<UpgradeExecutionObserverService> =>
  Effect.map(Ref.make(0), (commands) => ({
    during: (stage, execution) =>
      observeUnit(
        stage.kind === "availability"
          ? { id: "availability", label: `${methodLabel(methodName(stage.method))} availability` }
          : {
              id: "upgrade",
              label: `AXM ${stage.targetVersion} via ${methodLabel(methodName(stage.method))}`,
            },
        execution,
      ),
    installation: (inspection) =>
      observeUnit(
        {
          id: "detect-install-method",
          label: "AXM installation method",
          resolvedLabel: (result: InspectedInstallation) =>
            result.method._tag === "Unknown"
              ? "AXM installation method - undetermined"
              : `AXM installed with ${methodLabel(methodName(result.method))}`,
        },
        inspection,
      ),
    release: (version, selection) =>
      observeUnit(
        version === undefined
          ? {
              id: "resolve-channel",
              label: "AXM stable channel",
              resolvedLabel: (selected: SelectedRelease) =>
                `AXM stable channel - ${selected.targetVersion}`,
            }
          : { id: "resolve-version", label: `AXM ${version}` },
        selection,
      ),
    command: (command, execution) =>
      Effect.gen(function* () {
        const sequence = yield* Ref.getAndUpdate(commands, (value) => value + 1);
        const display = formatRecommendedCommand({ ...command, shellRequired: false });
        return yield* observeChildUnit(
          {
            id: `command-${String(sequence)}`,
            label: display,
            resolvedLabel: (record: CommandRecord) => {
              const outcome =
                record.executionState === "not-started"
                  ? "did not start"
                  : record.executionState === "timed-out"
                    ? "timed out"
                    : record.exitCode === 0
                      ? null
                      : `exit ${record.exitCode === null ? "unavailable" : String(record.exitCode)}`;
              return outcome === null ? display : `${display}, ${outcome}`;
            },
          },
          execution,
        );
      }),
    download: (binaryName, read) =>
      observeChildUnit(
        { id: "download-binary", label: `Download ${binaryName}` },
        Effect.flatMap(makeThrottledUnitProgress({ unit: "bytes", intervalMs: 250 }), read),
      ),
  }));

/** The CLI selects and owns the observer for one composed invocation. */
export const CliUpgradeObservationLive = Layer.effect(
  UpgradeExecutionObserver,
  makeCliUpgradeExecutionObserver(),
);
