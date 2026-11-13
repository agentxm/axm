import { fixtureFailure } from "./observability-contract.js";
/** Actual CLI upgrade orchestration at the package-manager executable boundary. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { UpgradeAssessmentResultSchema } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import type {
  ObservabilityScenario,
  PrepareInvocation,
  WorkspaceTemplate,
} from "./observability-fixtures.js";
import { digest, normalizeObservation, projectComparisonField } from "./observability-process.js";

const { outcome: upgradeOutcome, ...upgradeResultFields } = UpgradeAssessmentResultSchema.fields;

const CommandRecord = Schema.Struct({
  executable: Schema.Literals(["npm", "axm"]),
  args: Schema.Array(Schema.String),
});
const InstallMetadata = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  method: Schema.Literal("npm"),
  installedAt: Schema.String,
  packageName: Schema.Literal("axm.sh"),
  executablePath: Schema.String,
});
const fixedInstalledAt = "2026-01-01T00:00:00.000Z";

export const prepareMaintenanceObservabilityFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly base: WorkspaceTemplate;
  readonly invoke: PrepareInvocation;
  readonly copy: (source: WorkspaceTemplate, destination: string) => WorkspaceTemplate;
}) {
  fs.mkdirSync(options.root, { recursive: true });
  const reported = yield* options.invoke(options.base, ["--version"]);
  const local = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({ type: Schema.Literal("version"), version: Schema.String }),
    ),
  )(reported.stdout);
  const tools = path.join(options.root, "manager");
  fs.mkdirSync(tools);
  const versionPath = path.join(tools, "version.txt");
  const recordsPath = path.join(tools, "commands.jsonl");
  // The seam is an external executable. This does not stand in for npm publication or its service.
  const program = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.AXM_BENCH_MANAGER_ROOT;
if (!root) process.exit(64);
const executable = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify({executable,args}) + '\\n');
if (executable === 'axm' && args.length === 1 && args[0] === '--version') {
 process.stdout.write(fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim() + '\\n');
} else if (executable === 'npm' && args.length === 4 && args[0] === 'view' && /^axm\\.sh@\\d+\\.\\d+\\.\\d+$/.test(args[1]) && args[2] === 'version' && args[3] === '--json') {
 process.stdout.write(JSON.stringify(args[1].slice(7)) + '\\n');
} else if (executable === 'npm' && args.length === 3 && args[0] === 'install' && args[1] === '-g' && /^axm\\.sh@\\d+\\.\\d+\\.\\d+$/.test(args[2])) {
 fs.writeFileSync(path.join(root, 'version.txt'), args[2].slice(7) + '\\n');
} else { process.stderr.write('Unsupported fixture manager invocation.\\n'); process.exit(64); }
`;
  for (const name of ["npm", "axm"])
    fs.writeFileSync(path.join(tools, name), program, { mode: 0o755 });
  const template = options.copy(options.base, path.join(options.root, "template"));
  fs.mkdirSync(path.join(template.home, ".axm"), { recursive: true });
  fs.writeFileSync(
    path.join(template.home, ".axm/install-meta.json"),
    JSON.stringify({
      schemaVersion: 2,
      method: "npm",
      installedAt: fixedInstalledAt,
      packageName: "axm.sh",
      executablePath: path.join(tools, "axm"),
    }) + "\n",
  );
  const records = () =>
    fs
      .readFileSync(recordsPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(CommandRecord))(line));
  const external = {
    reset: Effect.sync(() => {
      fs.writeFileSync(versionPath, local.version + "\n");
      fs.writeFileSync(recordsPath, "");
    }),
    protectedState: () => fs.readFileSync(versionPath, "utf8").trim(),
    snapshot: () => ({ version: fs.readFileSync(versionPath, "utf8").trim(), commands: records() }),
  };
  const scenarios: ObservabilityScenario[] = [];
  for (const item of [
    { name: "already-current", target: local.version, outcome: "no-op" },
    { name: "changed", target: "999.0.0", outcome: "applied" },
  ] as const) {
    scenarios.push({
      id: "maintenance/" + item.name,
      command: "upgrade",
      args: ["upgrade", item.target],
      template,
      condition: {
        source: "local",
        extensions: 0,
        cache: "not-applicable",
        network: "not-applicable",
        archiveBodyDelayMillis: 0,
      },
      environment: {
        PATH: tools + path.delimiter + (process.env["PATH"] ?? ""),
        AXM_BENCH_MANAGER_ROOT: tools,
      },
      external,
      workExpectations: () =>
        ["axm.process.run", "axm.process.spawn"].map((kind) => ({
          kind,
          count: records().length,
          executed: records().length,
        })),
      verify: ({ fixture, stdout, startedAtMillis, endedAtMillis }) =>
        Effect.gen(function* () {
          const rawDocument = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Unknown),
          )(stdout);
          const document = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              ok: Schema.Literal(true),
              mode: Schema.Literal("apply"),
              outcome: upgradeOutcome,
              result: Schema.Struct(upgradeResultFields),
            }),
          )(rawDocument);
          const require = (condition: boolean, message: string) =>
            condition ? Effect.void : Effect.fail(fixtureFailure(message));
          const timestampInInvocation = (value: string) =>
            Number.isFinite(Date.parse(value)) &&
            Date.parse(value) >= startedAtMillis &&
            Date.parse(value) <= endedAtMillis;
          yield* require(document.outcome ===
            item.outcome, "Upgrade did not report the expected successful disposition.");
          yield* require(timestampInInvocation(
            document.result.canonical.validatedAt,
          ), "Canonical version validation timestamp is outside the observed invocation.");
          const calls = records();
          const installations = calls.filter(
            (call) => call.executable === "npm" && call.args[0] === "install",
          );
          yield* require(installations.length ===
            (item.outcome === "applied"
              ? 1
              : 0), "Package-manager mutation count differs from the independent oracle.");
          yield* require(external.snapshot().version ===
            item.target, "The manager-owned executable state does not match the requested version.");
          const rawMetadata = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Unknown),
          )(fs.readFileSync(path.join(fixture.home, ".axm/install-meta.json"), "utf8"));
          const metadata = yield* Schema.decodeUnknownEffect(InstallMetadata)(rawMetadata);
          yield* require(metadata.executablePath ===
            path.join(tools, "axm"), "The recorded owner executable changed unexpectedly.");
          if (item.outcome === "applied") {
            yield* require(timestampInInvocation(
              metadata.installedAt,
            ), "Installation metadata timestamp is outside the observed invocation.");
            yield* require(calls.filter(
              (call) => call.executable === "axm" && call.args[0] === "--version",
            ).length >=
              2, "The changed installation was not independently probed through both executable roles.");
          } else
            yield* require(metadata.installedAt ===
              fixedInstalledAt, "A no-op rewrote installation metadata.");
          return {
            assertions: [
              "Actual compiled CLI ownership, package-manager delegation and executable verification; the manager fixture does not establish real npm or release-service behavior.",
              "Only schema-validated canonical.validatedAt and changed install metadata installedAt are projected, after checking each against the independently observed invocation interval.",
            ],
            stdoutComparison: JSON.stringify(
              projectComparisonField(
                rawDocument,
                ["result", "canonical", "validatedAt"],
                document.result.canonical.validatedAt,
                "<validated-during-invocation>",
              ),
            ),
            fileComparisons:
              item.outcome !== "applied"
                ? []
                : [
                    {
                      container: "home" as const,
                      path: ".axm/install-meta.json",
                      sha256: digest(
                        JSON.stringify(
                          normalizeObservation(
                            projectComparisonField(
                              rawMetadata,
                              ["installedAt"],
                              metadata.installedAt,
                              "<installed-during-invocation>",
                            ),
                            [fixture.workspace, fixture.home],
                          ),
                        ),
                      ),
                      reason:
                        "Validated installation timestamp within this successful mutation interval; raw metadata is retained under raw-projections.",
                    },
                  ],
          };
        }),
    });
  }
  return scenarios;
});
