import * as Layer from "effect/Layer";
import { UpgradeExecutionObserver } from "@agentxm/cli-maintenance/self-update/application";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { Screen, headlineDoc } from "../screen/index.js";
import { Verbosity } from "../cli-flags/index.js";
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
export const makeCliUpgradeExecutionObserver = () =>
  Effect.gen(function* () {
    const commands = yield* Ref.make(0);
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const narrate = (message: string) =>
      verbosity.level === "quiet" ? Effect.void : screen.note(headlineDoc("info", message));
    return {
      during: (stage, execution) =>
        observeUnit(
          stage.kind === "availability"
            ? { id: "availability", label: `${methodLabel(methodName(stage.method))} availability` }
            : {
                id: "upgrade",
                label: `AXM ${stage.targetVersion} via ${methodLabel(methodName(stage.method))}`,
              },
          (stage.kind === "mutation"
            ? narrate(
                `Upgrading AXM to ${stage.targetVersion} via ${methodLabel(methodName(stage.method))}`,
              )
            : Effect.void
          ).pipe(Effect.andThen(execution)),
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
          inspection.pipe(
            Effect.tap((result) =>
              narrate(
                result.method._tag === "Unknown"
                  ? "AXM installation method is undetermined"
                  : `AXM installed with ${methodLabel(methodName(result.method))}`,
              ),
            ),
          ),
        ),
      release: (version, selection) =>
        observeUnit(
          version === undefined
            ? {
                id: "resolve-release",
                label: "AXM latest release",
                resolvedLabel: (selected: SelectedRelease) =>
                  `AXM latest release - ${selected.targetVersion}`,
              }
            : { id: "resolve-version", label: `AXM ${version}` },
          selection.pipe(
            Effect.tap((selected) => narrate(`Selected AXM ${selected.targetVersion}`)),
          ),
        ),
      command: (command, execution) =>
        Effect.gen(function* () {
          const sequence = yield* Ref.getAndUpdate(commands, (value) => value + 1);
          const display = formatRecommendedCommand({ ...command, shellRequired: false });
          if (command.purpose === "delegation") yield* narrate(`Running ${display}`);
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
    } satisfies UpgradeExecutionObserverService;
  });

/** The CLI selects and owns the observer for one composed invocation. */
export const CliUpgradeObservationLive = Layer.effect(
  UpgradeExecutionObserver,
  makeCliUpgradeExecutionObserver(),
);
