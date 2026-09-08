import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type CacheOutcome =
  "bypass" | "local-hit" | "miss" | "noncacheable" | "remote-hit" | "skipped" | "unknown";

export const classifyCacheOutcome = (
  cacheable: boolean | undefined,
  status: string,
  bypass: boolean,
): CacheOutcome => {
  if (cacheable === false) return "noncacheable";
  if (cacheable === undefined) return "unknown";
  if (bypass) return "bypass";
  if (status === "local-cache" || status === "local-cache-kept-existing") return "local-hit";
  if (status === "remote-cache") return "remote-hit";
  if (status === "skipped" || status === "stopped") return "skipped";
  return "miss";
};

const readTarget = (graph: unknown, project: string, target: string): boolean | undefined => {
  if (!isRecord(graph)) return undefined;
  const graphValue = graph["graph"];
  if (!isRecord(graphValue)) return undefined;
  const nodes = graphValue["nodes"];
  if (!isRecord(nodes)) return undefined;
  const node = nodes[project];
  if (!isRecord(node)) return undefined;
  const data = node["data"];
  if (!isRecord(data)) return undefined;
  const targets = data["targets"];
  if (!isRecord(targets)) return undefined;
  const definition = targets[target];
  if (!isRecord(definition)) return undefined;
  return typeof definition["cache"] === "boolean" ? definition["cache"] : undefined;
};

export const taskRecordsFromProfile = (
  profile: unknown,
  graph: unknown,
  bypass: boolean,
): ReadonlyArray<JsonRecord> => {
  if (!Array.isArray(profile)) throw new Error("Nx profile must be a JSON array.");
  return profile.flatMap((event: unknown) => {
    if (!isRecord(event) || event["ph"] !== "X" || typeof event["dur"] !== "number") return [];
    const args = event["args"];
    if (!isRecord(args) || typeof args["status"] !== "string") return [];
    const target = args["target"];
    if (
      !isRecord(target) ||
      typeof target["project"] !== "string" ||
      typeof target["target"] !== "string"
    )
      return [];
    const cacheable = readTarget(graph, target["project"], target["target"]);
    const cacheOutcome = classifyCacheOutcome(cacheable, args["status"], bypass);
    const hit = cacheOutcome === "local-hit" || cacheOutcome === "remote-hit";
    const durationMs = event["dur"] / 1_000;
    return [
      {
        task: typeof event["name"] === "string" ? event["name"] : null,
        project: target["project"],
        target: target["target"],
        configuration: typeof target["configuration"] === "string" ? target["configuration"] : null,
        taskHash: null,
        taskHashUnavailableReason: "Nx's supported profile does not expose the task hash.",
        status: args["status"],
        cacheable: cacheable ?? null,
        cacheOutcome,
        timing: { durationMs, unavailableReason: null },
        cacheRead: {
          lookupDurationMs: null,
          lookupUnavailableReason:
            "Nx performs cache lookup before task lifecycle timing and does not expose its duration.",
          restoreDurationMs: hit ? durationMs : null,
          restoreUnavailableReason: hit ? null : "Task was not restored from cache.",
        },
      },
    ];
  });
};

export const writeCacheProfileReport = (input: {
  readonly bypass: boolean;
  readonly collectionOverheadMs: number;
  readonly graph: unknown;
  readonly label: string;
  readonly outputPath: string;
  readonly profile: unknown;
  readonly profilePath: string | null;
  readonly repository: string;
  readonly telemetryUnavailableReason?: string;
}): void => {
  const tasks = taskRecordsFromProfile(input.profile, input.graph, input.bypass);
  const outcomes: ReadonlyArray<CacheOutcome> = [
    "local-hit",
    "remote-hit",
    "miss",
    "bypass",
    "noncacheable",
    "skipped",
    "unknown",
  ];
  const counts = Object.fromEntries(
    outcomes.map((outcome) => [
      outcome,
      tasks.filter((task) => task["cacheOutcome"] === outcome).length,
    ]),
  );
  const report = {
    schemaVersion: 1,
    repository: input.repository,
    revision: process.env["GITHUB_SHA"] ?? null,
    label: input.label,
    run: {
      id: process.env["GITHUB_RUN_ID"] ?? null,
      attempt: process.env["GITHUB_RUN_ATTEMPT"] ?? null,
      job: process.env["GITHUB_JOB"] ?? null,
    },
    platform: `${process.platform}/${process.arch}`,
    bypass: input.bypass,
    collectionOverheadMs: input.collectionOverheadMs,
    rawProfile: input.profilePath,
    telemetry: {
      available: input.telemetryUnavailableReason === undefined,
      unavailableReason: input.telemetryUnavailableReason ?? null,
    },
    counts,
    eligibleTaskCount: tasks.filter(
      (task) => task["cacheable"] === true && task["cacheOutcome"] !== "bypass",
    ).length,
    tasks,
  };
  mkdirSync(dirname(input.outputPath), { recursive: true });
  writeFileSync(input.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined && summary !== "") {
    appendFileSync(
      summary,
      `\n## Nx task cache — ${input.label}\n\n` +
        `Tasks: ${tasks.length}; local hits: ${counts["local-hit"]}; remote hits: ${counts["remote-hit"]}; misses: ${counts["miss"]}; bypassed: ${counts["bypass"]}; non-cacheable: ${counts["noncacheable"]}; unknown: ${counts["unknown"]}.\n\n` +
        `Collection overhead: ${input.collectionOverheadMs.toFixed(1)} ms.\n`,
    );
  }
};

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
