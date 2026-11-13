/** Reuse successful operation fixtures for assessment; keep state assertions at the process boundary. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { UpgradeAssessmentResultSchema } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import { fixtureFailure } from "./observability-contract.js";
import { observabilityRiskScenarios, type ObservabilityCommand } from "./observability-coverage.js";
import { copyTemplate, type ObservabilityScenario } from "./observability-fixtures.js";
import { digest, projectComparisonField } from "./observability-process.js";
import { prepareStartupObservabilityFixtures } from "./observability-startup-fixtures.js";
import { verifyStagedNativeImport } from "./observability-typed-fixtures.js";

const { outcome: upgradeOutcome, ...upgradeResultFields } = UpgradeAssessmentResultSchema.fields;

const lintObservation = Schema.Struct({
  repaired: Schema.Array(Schema.Unknown),
  normalization: Schema.optional(
    Schema.Struct({
      mode: Schema.Literal("preview"),
      changes: Schema.Array(Schema.Struct({ path: Schema.String, change: Schema.String })),
    }),
  ),
});

const previewVerification: NonNullable<ObservabilityScenario["verify"]> = ({ stdout }) =>
  Effect.gen(function* () {
    yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          ok: Schema.Literal(true),
          mode: Schema.Literal("preview"),
          outcome: Schema.Literal("previewed"),
          result: Schema.Record(Schema.String, Schema.Unknown),
        }),
      ),
    )(stdout);
    return {
      assertions: [
        "Successful machine result reports preview; full preflight independently protects workspace, non-cache home and external product state.",
      ],
    };
  });

const upgradePreviewVerification: NonNullable<ObservabilityScenario["verify"]> = ({
  stdout,
  startedAtMillis,
  endedAtMillis,
}) =>
  Effect.gen(function* () {
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(stdout);
    const doc = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        ok: Schema.Literal(true),
        mode: Schema.Literal("preview"),
        outcome: upgradeOutcome,
        result: Schema.Struct(upgradeResultFields),
      }),
    )(raw);
    const epoch = Date.parse(doc.result.canonical.validatedAt);
    if (
      doc.outcome !== "previewed" ||
      epoch < startedAtMillis ||
      epoch > endedAtMillis ||
      !Number.isFinite(epoch)
    )
      return yield* fixtureFailure(
        "Upgrade preview must report a validation within its invocation and perform no installation.",
      );
    return {
      assertions: [
        "Upgrade reports preview and an independently bounded validation time; preflight protects the manager version and installation metadata.",
      ],
      stdoutComparison: JSON.stringify(
        projectComparisonField(
          raw,
          ["result", "canonical", "validatedAt"],
          doc.result.canonical.validatedAt,
          "<validated-during-invocation>",
        ),
      ),
    };
  });

export const prepareObservabilityModeFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly scenarios: ReadonlyArray<ObservabilityScenario>;
  readonly commands: ReadonlyArray<ObservabilityCommand>;
  readonly invoke: import("./observability-fixtures.js").PrepareInvocation;
}) {
  const selected: ObservabilityScenario[] = [];
  const defaults = new Map<string, ObservabilityScenario>();
  const preferred: Readonly<Record<string, string>> = {
    "": "group/root",
    upgrade: "maintenance/changed",
    adopt: "installed/adopt-disabled",
    list: "registry/1/list/warm/baseline",
    view: "registry/1/view/cold/baseline",
    install: "registry/1/install/cold/baseline",
    update: "registry/1/update/warm/baseline",
    sync: "registry/1/sync-restore/cold/baseline",
    logout: "auth/logout",
    "token show": "auth/token-show",
  };
  for (const entry of options.commands) {
    const candidates = options.scenarios.filter(
      (scenario) => scenario.command === entry.command && (scenario.expectedExitCode ?? 0) === 0,
    );
    const wanted = preferred[entry.command];
    const chosen =
      wanted === undefined ? candidates[0] : candidates.find((scenario) => scenario.id === wanted);
    if (chosen === undefined)
      return yield* fixtureFailure("Missing successful default-mode fixture: " + entry.command);
    defaults.set(entry.command, chosen);
    selected.push(chosen);
  }
  for (const id of observabilityRiskScenarios) {
    const scenario = options.scenarios.find((candidate) => candidate.id === id);
    if (scenario === undefined || selected.some((candidate) => candidate.id === id))
      return yield* fixtureFailure("Missing or overlapping declared risk fixture: " + id);
    selected.push(scenario);
  }
  const lint = defaults.get("lint");
  if (lint === undefined)
    return yield* fixtureFailure("The lint route needs a default query fixture.");
  const lintTemplate = copyTemplate(lint.template, path.join(options.root, "lint-repair"));
  const rawSettings = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
  )(fs.readFileSync(path.join(lintTemplate.workspace, "axm.json"), "utf8"));
  fs.writeFileSync(
    path.join(lintTemplate.workspace, "axm.json"),
    JSON.stringify({
      ...rawSettings,
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    }) + "\n",
  );
  fs.writeFileSync(path.join(lintTemplate.workspace, "AGENTS.md"), "# Benchmark instructions\n");
  fs.writeFileSync(
    path.join(lintTemplate.workspace, "unrelated.txt"),
    "Preserve unrelated bytes.\n",
  );
  fs.rmSync(path.join(lintTemplate.workspace, "CLAUDE.md"), { force: true });
  const settingsHash = digest(fs.readFileSync(path.join(lintTemplate.workspace, "axm.json")));
  const verifyLint =
    (preview: boolean): NonNullable<ObservabilityScenario["verify"]> =>
    ({ fixture, stdout }) =>
      Effect.gen(function* () {
        const document = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ ok: Schema.Boolean, result: lintObservation })),
        )(stdout);
        const alias = path.join(fixture.workspace, "CLAUDE.md");
        if (
          digest(fs.readFileSync(path.join(fixture.workspace, "axm.json"))) !== settingsHash ||
          fs.readFileSync(path.join(fixture.workspace, "AGENTS.md"), "utf8") !==
            "# Benchmark instructions\n" ||
          fs.readFileSync(path.join(fixture.workspace, "unrelated.txt"), "utf8") !==
            "Preserve unrelated bytes.\n"
        )
          return yield* fixtureFailure("Lint normalization changed protected inputs.");
        if (preview) {
          if (
            fs.existsSync(alias) ||
            document.result.repaired.length !== 0 ||
            document.result.normalization?.mode !== "preview" ||
            !document.result.normalization.changes.some(
              (change) => change.path === alias && change.change === "created",
            )
          )
            return yield* fixtureFailure(
              "Lint fix-preview did not describe the determined missing alias without applying it.",
            );
        } else if (
          !fs.lstatSync(alias).isSymbolicLink() ||
          fs.readlinkSync(alias) !== "AGENTS.md" ||
          document.result.repaired.length === 0 ||
          document.result.normalization !== undefined
        )
          return yield* fixtureFailure(
            "Lint fix did not restore the determined instruction alias.",
          );
        return {
          assertions: [
            preview
              ? "Missing instruction alias is described and remains absent."
              : "Missing instruction alias is restored as the exact intended symlink.",
            "Settings, authored instructions and unrelated bytes remain unchanged.",
          ],
        };
      });
  const repair: ObservabilityScenario = {
    ...lint,
    id: "local/lint-fix",
    args: ["lint", "--fix"],
    template: lintTemplate,
    verify: verifyLint(false),
  };
  selected.push(repair);
  for (const entry of options.commands.filter((entry) => entry.preview)) {
    const source = entry.fix ? repair : defaults.get(entry.command);
    if (source === undefined)
      return yield* fixtureFailure("Missing preview source fixture: " + entry.command);
    // Preview never acquires artifacts; preserve its unscoped I/O detail instead
    // of inheriting the applying fixture's acquisition-only selection.
    const { detailPhase: _detailPhase, ...previewSource } = source;
    selected.push({
      ...previewSource,
      id: "preview/" + entry.command.replaceAll(" ", "-"),
      args: [...source.args, "--preview"],
      preserveState: true,
      verify: entry.fix
        ? verifyLint(true)
        : entry.command === "upgrade"
          ? upgradePreviewVerification
          : source.id === "typed/skills/import"
            ? ({ stdout }) => verifyStagedNativeImport("skills", "preview", stdout)
            : source.id === "typed/subagents/import"
              ? ({ stdout }) => verifyStagedNativeImport("subagents", "preview", stdout)
              : previewVerification,
    });
  }
  const view = defaults.get("view");
  if (view === undefined)
    return yield* fixtureFailure(
      "Startup observation needs the successful Registry query fixture.",
    );
  selected.push(
    ...(yield* prepareStartupObservabilityFixtures({
      root: path.join(options.root, "startup"),
      view,
      invoke: options.invoke,
    })),
  );
  return selected;
});
