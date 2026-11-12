import * as Schema from "effect/Schema";

const CommandEffectSchema = Schema.Literals([
  "none",
  "workspace",
  "authored-source",
  "registry",
  "credentials",
  "installation",
  "application-state",
]);

const CommandCapabilitiesSchema = Schema.Struct({
  preview: Schema.Boolean,
  effect: CommandEffectSchema,
  inputs: Schema.Literals([
    "none",
    "explicit",
    "explicit-or-documented-defaults",
    "explicit-or-interactive-selection",
  ]),
  modes: Schema.Array(Schema.Struct({ flag: Schema.String, effect: CommandEffectSchema })),
});

const ParameterSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optionalKey(Schema.String),
  choices: Schema.optionalKey(Schema.Array(Schema.String)),
  default: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});

/** Produced inside the CLI owner, consumed here without importing CLI internals. */
export const CommandSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  revision: Schema.String,
  cliVersion: Schema.String,
  globalFlags: Schema.Array(ParameterSchema),
  entries: Schema.Array(
    Schema.Struct({
      path: Schema.Array(Schema.String),
      aliases: Schema.Array(Schema.String),
      description: Schema.String,
      childCount: Schema.Number,
      groupOnly: Schema.Boolean,
      capabilities: CommandCapabilitiesSchema,
      flags: Schema.Array(ParameterSchema),
      arguments: Schema.Array(ParameterSchema),
    }),
  ),
  helpTopics: Schema.Array(
    Schema.Struct({ name: Schema.String, kind: Schema.Literals(["markdown", "json-schema"]) }),
  ),
});

export type CommandSnapshot = typeof CommandSnapshotSchema.Type;
type CommandEffect = typeof CommandEffectSchema.Type;

export interface BenchmarkMode {
  readonly id: string;
  readonly kind: "operation" | "help" | "version" | "topic";
  readonly flags: ReadonlyArray<string>;
  readonly arguments: ReadonlyArray<string>;
  readonly effect: CommandEffect;
  readonly format?: "markdown" | "json-schema";
}

export interface BenchmarkOperation {
  readonly id: string;
  readonly route: ReadonlyArray<string>;
  readonly aliases: ReadonlyArray<string>;
  readonly effect: CommandEffect;
  readonly inputs: CommandSnapshot["entries"][number]["capabilities"]["inputs"];
  readonly description: string;
  readonly childCount: number;
  readonly groupOnly: boolean;
  readonly ownFlags: ReadonlyArray<string>;
  readonly flagClassifications: ReadonlyArray<BenchmarkFlagClassification>;
  readonly arguments: ReadonlyArray<CommandSnapshot["entries"][number]["arguments"][number]>;
  readonly modes: ReadonlyArray<BenchmarkMode>;
}

export interface BenchmarkFlagClassification {
  readonly name: string;
  readonly category:
    "mode" | "dimension" | "fixture-input" | "policy" | "interaction" | "unclassified";
  readonly dimension: string;
  readonly rationale: string;
  readonly choices: ReadonlyArray<string>;
}

export interface BenchmarkSample {
  readonly ordinal: number;
  readonly phase: "first" | "warmup" | "measured";
  readonly args: ReadonlyArray<string>;
  readonly expectedExitCode: number;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly cpuUserMs: number | null;
  readonly cpuSystemMs: number | null;
  readonly peakRssBytes: number | null;
  readonly ioReadBytes: number | null;
  readonly ioWriteBytes: number | null;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface BenchmarkReceipt {
  readonly scenarioId: string;
  readonly operationId: string;
  readonly modeId: string;
  readonly subject: "baseline" | "candidate";
  readonly revision: string;
  readonly binarySha256: string;
  readonly protocolId: string;
  readonly fixtureId: string;
  readonly hostId: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly samples: ReadonlyArray<BenchmarkSample>;
  readonly evidencePath: string;
}

export interface BenchmarkReportIdentity {
  readonly subject: BenchmarkReceipt["subject"];
  readonly revision: string;
  readonly binarySha256: string;
  readonly hostId: string;
  readonly smoke: boolean;
}

export const BenchmarkReceiptSchema: Schema.Codec<BenchmarkReceipt> = Schema.Struct({
  scenarioId: Schema.String,
  operationId: Schema.String,
  modeId: Schema.String,
  subject: Schema.Literals(["baseline", "candidate"]),
  revision: Schema.String,
  binarySha256: Schema.String,
  protocolId: Schema.String,
  fixtureId: Schema.String,
  hostId: Schema.String,
  status: Schema.Literals(["passed", "failed", "skipped"]),
  samples: Schema.Array(
    Schema.Struct({
      ordinal: Schema.Number,
      phase: Schema.Literals(["first", "warmup", "measured"]),
      args: Schema.Array(Schema.String),
      expectedExitCode: Schema.Number,
      durationMs: Schema.Number,
      exitCode: Schema.Number,
      cpuUserMs: Schema.NullOr(Schema.Number),
      cpuSystemMs: Schema.NullOr(Schema.Number),
      peakRssBytes: Schema.NullOr(Schema.Number),
      ioReadBytes: Schema.NullOr(Schema.Number),
      ioWriteBytes: Schema.NullOr(Schema.Number),
      metrics: Schema.Record(Schema.String, Schema.Number),
    }),
  ),
  evidencePath: Schema.String,
});

export const ScenarioDimensionsSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user", "mixed", "none"]),
  source: Schema.Literals([
    "registry",
    "git",
    "path",
    "authored",
    "bundled",
    "native",
    "mixed",
    "none",
  ]),
  selection: Schema.Literals(["targeted", "bulk", "none"]),
  view: Schema.Literals(["filesystem", "git-index", "none"]),
  output: Schema.Literals(["human", "json", "plain", "raw", "native"]),
  state: Schema.Literals(["changed", "no-op", "query", "refused", "static"]),
  format: Schema.String,
  kinds: Schema.Array(
    Schema.Literals(["skill", "mcp-server", "subagent", "rule", "hook", "knowledge", "pack"]),
  ),
});

export type ScenarioDimensions = typeof ScenarioDimensionsSchema.Type;

export interface ScenarioDeclaration {
  readonly id: string;
  readonly operationId: string;
  readonly modeId: string;
  readonly fixtureId: string;
  readonly dimensions: ScenarioDimensions;
}

/** A source classification is separate from measured scenario coverage. */
export interface OperationAllocation {
  readonly operationId: string;
  readonly owner: string;
  readonly publicEntrypoints: ReadonlyArray<string>;
  readonly applicability: "migrated" | "already-conforming" | "inapplicable";
  readonly rationale: string;
  readonly evidence: ReadonlyArray<string>;
}
