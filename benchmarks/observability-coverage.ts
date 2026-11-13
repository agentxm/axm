/** Coverage follows the executable's existing public help; no second command registry. */
import { fixtureFailure, type OperationCoverage } from "./observability-contract.js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface ObservabilityCommand {
  readonly command: string;
  readonly preview: boolean;
  readonly group: boolean;
  readonly fix: boolean;
}

export const discoverObservabilityRoutes = Effect.fnUntraced(function* (
  readHelp: (route: string) => Effect.Effect<string, unknown>,
) {
  const Help = Schema.fromJsonString(
    Schema.Struct({
      type: Schema.Literal("help"),
      flags: Schema.Array(Schema.Struct({ name: Schema.String })),
      subcommands: Schema.optional(
        Schema.Array(
          Schema.Struct({
            commands: Schema.Array(
              Schema.Struct({
                name: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/)),
              }),
            ),
          }),
        ),
      ),
    }),
  );
  const pending = [""];
  const commands: ObservabilityCommand[] = [];
  for (let index = 0; index < pending.length; index++) {
    const route = pending[index];
    if (route === undefined || pending.length > 512 || route.split(" ").length > 8)
      return yield* fixtureFailure(
        "The public command inventory exceeded its explicit traversal bound.",
      );
    const help = yield* Schema.decodeUnknownEffect(Help)(yield* readHelp(route));
    commands.push({
      command: route,
      group: (help.subcommands ?? []).some((group) => group.commands.length > 0),
      preview: help.flags.some(({ name }) => name === "preview"),
      fix: help.flags.some(({ name }) => name === "fix"),
    });
    for (const group of help.subcommands ?? [])
      for (const child of group.commands) {
        const next = route === "" ? child.name : route + " " + child.name;
        if (pending.includes(next))
          return yield* fixtureFailure("Duplicate public command route: " + next);
        pending.push(next);
      }
  }
  return commands;
});

export const makeObservabilityCoverage = (
  scenarios: ReadonlyArray<{
    readonly id: string;
    readonly command: string;
    readonly args: ReadonlyArray<string>;
    readonly expectedExitCode?: number;
  }>,
  commands: ReadonlyArray<ObservabilityCommand> = [],
): ReadonlyArray<OperationCoverage> =>
  commands.flatMap(({ command, preview, fix, group }) =>
    ["default", ...(preview ? ["preview"] : []), ...(fix ? ["fix"] : [])].map(
      (variant): OperationCoverage => {
        const selected = scenarios
          .filter(
            (scenario) =>
              scenario.command === command &&
              (scenario.expectedExitCode ?? 0) === 0 &&
              (group ||
                !scenario.args.some(
                  (argument) =>
                    argument === "--help" || argument === "-h" || argument === "--version",
                )) &&
              (variant === "preview"
                ? scenario.args.includes("--preview") && (!fix || scenario.args.includes("--fix"))
                : !scenario.args.includes("--preview") &&
                  scenario.args.includes("--fix") === (variant === "fix")),
          )
          .map((scenario) => scenario.id);
        return {
          command,
          variant,
          scenarios: selected,
          status: selected.length > 0 ? "implemented" : "pending",
          ...(selected.length > 0
            ? {}
            : { reason: "A successful isolated fixture for this command mode is missing." }),
        };
      },
    ),
  );

/** These cases add distinct paths to one default case per route; no Cartesian product. */
export const observabilityRiskScenarios = [
  "group/version-output",
  "maintenance/already-current",
  "installed/adopt-enabled-native-refusal",
  "registry/1/sync-noop/warm/baseline",
  "registry/1/sync-restore/warm/baseline",
  "registry/10/list/warm/baseline",
  "registry/10/sync-restore/cold/baseline",
  "registry/50/sync-restore/cold/baseline",
  "registry/1/install/cold/slow",
  "path/cold-sync",
  "git/cold-sync",
  "git/update",
] as const;
