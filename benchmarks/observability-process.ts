/** External process observations stay outside the product's trace and measured child. */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { MachineEventSchema, type MachineEvent } from "axm.sh/runtime";
import { ObservabilityBenchmarkFailure, fixtureFailure } from "./observability-contract.js";

export const digest = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

/** External host facts, without argument vectors or environment values. */
export const hostResourceSnapshot = (artifactDirectory: string) => {
  const processes = execFileSync("ps", ["-eo", "pid=,ppid=,comm=,pcpu=,rss="], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env["PATH"], LC_ALL: "C" },
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s+([\d.]+)\s+(\d+)\s*$/.exec(line);
      if (match === null || match[3] === undefined)
        throw fixtureFailure("Host process observation has an unexpected shape.");
      const pid = Number(match[1]);
      const parentPid = Number(match[2]);
      const lifetimeCpuPercent = Number(match[4]);
      const residentBytes = Number(match[5]) * 1024;
      if (
        ![pid, parentPid, lifetimeCpuPercent, residentBytes].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      )
        throw fixtureFailure("Host process observation contains an invalid metric.");
      return { pid, parentPid, commandName: match[3], lifetimeCpuPercent, residentBytes };
    });
  const filesystem = fs.statfsSync(artifactDirectory);
  return {
    observedAt: new Date().toISOString(),
    loadAverage: os.loadavg(),
    freeMemoryBytes: os.freemem(),
    cpuTimesMillis: os.cpus().map((cpu) => cpu.times),
    processes,
    artifactFilesystem: {
      availableBytes: filesystem.bavail * filesystem.bsize,
      freeBytes: filesystem.bfree * filesystem.bsize,
    },
    interpretation:
      "Process CPU percentages are lifetime averages; CPU-time deltas/load and process names support host-contention review. Output-filesystem capacity is not a receiver storage measurement or proof of isolation.",
  };
};

/** Compress only completed task-owned artifacts, verifying exact bytes before removing originals. */
export const compressObservationArtifacts = (directory: string) => {
  const entries: Array<{
    path: string;
    sha256: string;
    rawBytes: number;
    compressedBytes: number;
  }> = [];
  const keep = new Set([
    "receipt.json",
    "expectations.json",
    "sample.json",
    "semantic-verification.json",
    "compression.json",
  ]);
  const visit = (root: string) => {
    for (const name of fs.readdirSync(root)) {
      const file = path.join(root, name);
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) {
        visit(file);
        continue;
      }
      if (!stat.isFile() || keep.has(name) || name.endsWith(".gz")) continue;
      const raw = fs.readFileSync(file);
      const compressed = gzipSync(raw);
      const target = file + ".gz";
      fs.writeFileSync(target, compressed, { flag: "wx" });
      const roundTrip = gunzipSync(fs.readFileSync(target));
      if (!raw.equals(roundTrip))
        throw new Error("Artifact compression did not preserve exact bytes: " + file);
      entries.push({
        path: path.relative(directory, target),
        sha256: digest(raw),
        rawBytes: raw.length,
        compressedBytes: compressed.length,
      });
      fs.unlinkSync(file);
    }
  };
  visit(directory);
  fs.writeFileSync(
    path.join(directory, "compression.json"),
    JSON.stringify({ schemaVersion: 1, entries }, null, 2) + "\n",
  );
  return {
    rawBytes: entries.reduce((sum, entry) => sum + entry.rawBytes, 0),
    compressedBytes: entries.reduce((sum, entry) => sum + entry.compressedBytes, 0),
  };
};

export const runObservedProcess = Effect.fnUntraced(function* (options: {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly artifacts: string;
  readonly timeoutMillis?: number;
  readonly measureRss?: boolean;
}) {
  return yield* Effect.tryPromise({
    try: (signal) =>
      new Promise<{
        readonly durationMs: number;
        readonly peakRssBytes: number;
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
      }>((resolve, reject) => {
        fs.mkdirSync(options.artifacts, { recursive: true });
        const rssPath = path.join(options.artifacts, "rss-kib.txt");
        const command = options.measureRss === false ? options.executable : "/usr/bin/time";
        const args =
          options.measureRss === false
            ? [...options.args]
            : ["-f", "%M", "-o", rssPath, "--", options.executable, ...options.args];
        const started = performance.now();
        const child = spawn(command, args, {
          cwd: options.cwd,
          env: options.environment,
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        });
        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let failure: string | undefined;
        const terminate = (reason: string) => {
          failure ??= reason;
          if (child.pid !== undefined && process.platform !== "win32") {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              /* The child may already have exited. */
            }
          } else child.kill("SIGKILL");
        };
        const abort = () => terminate("The benchmark process was interrupted.");
        signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(
          () => terminate("The benchmark process exceeded its deadline."),
          options.timeoutMillis ?? 120_000,
        );
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdoutChunks.push(chunk);
          stdoutBytes += Buffer.byteLength(chunk);
          if (stdoutBytes > 64 * 1024 * 1024)
            terminate("The benchmark process exceeded its output limit.");
        });
        child.stderr.on("data", (chunk: string) => {
          stderrChunks.push(chunk);
          stderrBytes += Buffer.byteLength(chunk);
          if (stderrBytes > 64 * 1024 * 1024)
            terminate("The benchmark process exceeded its output limit.");
        });
        child.once("error", (error) => {
          failure = error.message;
        });
        child.once("close", (code) => {
          const durationMs = performance.now() - started;
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
          try {
            const stdout = stdoutChunks.join("");
            const stderr = stderrChunks.join("");
            fs.writeFileSync(path.join(options.artifacts, "stdout.txt"), stdout);
            fs.writeFileSync(path.join(options.artifacts, "stderr.txt"), stderr);
            if (failure !== undefined) {
              reject(new Error(failure));
              return;
            }
            const peakRssBytes =
              options.measureRss === false
                ? 0
                : Number(fs.readFileSync(rssPath, "utf8").trim().split("\n").at(-1)) * 1024;
            resolve({ durationMs, peakRssBytes, exitCode: code ?? 128, stdout, stderr });
          } catch (cause) {
            reject(cause);
          }
        });
      }),
    catch: (cause) =>
      new ObservabilityBenchmarkFailure({ code: "process-observation", message: String(cause) }),
  });
});

/** These volatile protocol fields are retained raw; only comparison digests normalize them. */
export const volatileComparisonFields = new Set(["progress.event.atMs"]);

export const progressComparisonNormalization = {
  validation: "Published schema, contiguous per-operation sequence, and unit lifecycle order.",
  acquisitionOrder:
    "Complete independent acquisition units compare by unit identity and ordered unit events within each uninterrupted acquisition segment; original sequence interval and event count remain significant.",
  barriers: "Phase changes, non-unit events, diagnostics, and other output retain emission order.",
  rawOutput: "Original bytes, sequence numbers, and timestamps remain in retained artifacts.",
};

export const normalizeObservation = (value: unknown, roots: ReadonlyArray<string>): unknown => {
  if (typeof value === "string")
    return roots.reduce((text, root, index) => text.replaceAll(root, `<fixture-${index}>`), value);
  if (Array.isArray(value)) return value.map((item) => normalizeObservation(item, roots));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeObservation(item, roots)]),
    );
  }
  return value;
};

/** Replace one validated volatile field without dropping unknown or unrelated product fields. */
export const projectComparisonField = (
  value: unknown,
  fields: ReadonlyArray<string>,
  expected: unknown,
  replacement: unknown,
): unknown => {
  const field = fields[0];
  if (field === undefined) {
    if (value !== expected)
      throw new Error("Comparison projection does not match its independently validated value.");
    return replacement;
  }
  if (Array.isArray(value)) {
    const index = Number(field);
    if (!Number.isInteger(index) || String(index) !== field || index < 0 || index >= value.length)
      throw new Error("Comparison projection names an absent array entry.");
    return value.map((child, current) =>
      current === index
        ? projectComparisonField(child, fields.slice(1), expected, replacement)
        : child,
    );
  }
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, field))
    throw new Error("Comparison projection names an absent document field.");
  const entries = Object.entries(value);
  return Object.fromEntries(
    entries.map(([key, child]) => [
      key,
      key === field ? projectComparisonField(child, fields.slice(1), expected, replacement) : child,
    ]),
  );
};

const TimedPlanEnvelope = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({
    contract: Schema.Literal("plan-result-v4"),
    evaluatedAt: Schema.optional(Schema.Unknown),
  }),
});

/** Release-age evaluation time varies; its decisions, candidate identity and every other field remain significant. */
export const projectPlanEvaluationTime = (
  stdout: string,
  startedAtMillis: number,
  endedAtMillis: number,
): string => {
  const decoded = Schema.decodeUnknownExit(Schema.fromJsonString(Schema.Unknown))(stdout);
  if (
    Exit.isFailure(decoded) ||
    !Schema.is(TimedPlanEnvelope)(decoded.value) ||
    decoded.value.result.evaluatedAt === undefined
  )
    return stdout;
  const instant = Schema.decodeUnknownSync(Schema.String)(decoded.value.result.evaluatedAt);
  const epoch = Date.parse(instant);
  if (
    !Number.isFinite(epoch) ||
    new Date(epoch).toISOString() !== instant ||
    epoch < startedAtMillis ||
    epoch > endedAtMillis
  )
    throw fixtureFailure(
      "Plan evaluation instant falls outside the independently observed invocation.",
    );
  return JSON.stringify(
    projectComparisonField(
      decoded.value,
      ["result", "evaluatedAt"],
      instant,
      "<evaluated-during-invocation>",
    ),
  );
};

type ProgressEvent = Extract<MachineEvent, { readonly type: "progress" }>;
const isProgressLike = (value: unknown) =>
  typeof value === "object" && value !== null && "type" in value && value.type === "progress";
const isMachineEvent = Schema.is(MachineEventSchema);
const parseOutput = Schema.decodeUnknownExit(Schema.fromJsonString(Schema.Unknown));

export const outputDigest = (text: string, roots: ReadonlyArray<string>): string => {
  const document = parseOutput(text);
  if (Exit.isSuccess(document) && !isProgressLike(document.value))
    return digest(JSON.stringify(normalizeObservation(document.value, roots)));

  const output: string[] = [];
  let sequence: number | undefined;
  let phase: string | undefined;
  const activeUnits = new Set<string>();
  let acquisition: ProgressEvent[] = [];
  const normalizeProgress = (entry: ProgressEvent) => ({
    ...entry,
    event: { ...entry.event, atMs: "<volatile>" },
  });
  const append = (value: unknown) =>
    output.push(JSON.stringify(normalizeObservation(value, roots)));
  const flushAcquisition = () => {
    if (acquisition.length === 0) return;
    const units = new Map<string, ProgressEvent[]>();
    for (const entry of acquisition) {
      if (!("unitId" in entry.event)) continue;
      const previous = units.get(entry.event.unitId) ?? [];
      previous.push(entry);
      units.set(entry.event.unitId, previous);
    }
    const complete = [...units.values()].every(
      (events) =>
        events[0]?.event._tag === "UnitStarted" &&
        events.at(-1)?.event._tag === "UnitResolved" &&
        events.filter((entry) => entry.event._tag === "UnitStarted").length === 1,
    );
    if (complete && units.size > 1)
      append({
        comparison: "independent-acquisition-units-v1",
        firstSeq: acquisition[0]?.event.seq,
        lastSeq: acquisition.at(-1)?.event.seq,
        eventCount: acquisition.length,
        units: [...units.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([unitId, events]) => ({
            unitId,
            events: events.map((entry, index) => ({
              ...normalizeProgress(entry),
              event: { ...entry.event, atMs: "<volatile>", seq: { unitEvent: index + 1 } },
            })),
          })),
      });
    else for (const entry of acquisition) append(normalizeProgress(entry));
    acquisition = [];
  };

  for (const line of text.split("\n")) {
    const parsed = parseOutput(line);
    const value = Exit.isSuccess(parsed) ? parsed.value : line;
    if (!isProgressLike(value)) {
      flushAcquisition();
      if (Exit.isSuccess(parsed)) append(value);
      else output.push(String(normalizeObservation(line, roots)));
      continue;
    }
    if (!isMachineEvent(value) || value.type !== "progress")
      throw fixtureFailure("Output contains a progress event outside the published schema.");
    const event = value.event;
    if (event._tag === "OperationStarted") {
      if (sequence !== undefined)
        throw fixtureFailure("Progress starts an operation before the previous operation settles.");
      sequence = 0;
      phase = undefined;
    }
    if (
      sequence === undefined ||
      !Number.isSafeInteger(event.seq) ||
      event.seq !== sequence + 1 ||
      !Number.isFinite(event.atMs)
    )
      throw fixtureFailure("Progress does not preserve a complete per-operation sequence.");
    sequence = event.seq;
    if (event._tag === "UnitStarted") {
      if (activeUnits.has(event.unitId))
        throw fixtureFailure("Progress starts an already active unit.");
      activeUnits.add(event.unitId);
    } else if (event._tag === "UnitProgress" || event._tag === "UnitResolved") {
      if (!activeUnits.has(event.unitId))
        throw fixtureFailure("Progress observes a unit outside its started lifecycle.");
      if (event._tag === "UnitResolved") activeUnits.delete(event.unitId);
    } else if (event._tag === "PhaseStarted" || event._tag === "OperationSettled") {
      if (activeUnits.size > 0)
        throw fixtureFailure("Progress crosses a lifecycle boundary with unresolved units.");
    }

    if (
      phase === "acquisition" &&
      (event._tag === "UnitStarted" ||
        event._tag === "UnitProgress" ||
        event._tag === "UnitResolved") &&
      /^(registry-extract:|source-acquire:)/u.test(event.unitId) &&
      !("parentUnitId" in event)
    ) {
      acquisition.push(value);
      continue;
    }
    flushAcquisition();
    append(normalizeProgress(value));
    if (event._tag === "PhaseStarted") phase = event.phase;
    if (event._tag === "OperationSettled") sequence = undefined;
  }
  flushAcquisition();
  if (sequence !== undefined)
    throw fixtureFailure("Progress output ends before its operation settles.");
  return digest(output.join("\n"));
};

export interface FileObservation {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink";
  readonly mode: number;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly comparisonSha256?: string;
  readonly target?: string;
}

/** Snapshot without following symlinks. Raw hashes remain available beside normalized JSON hashes. */
export const snapshotTree = (
  root: string,
  normalizationRoots: ReadonlyArray<string>,
): ReadonlyArray<FileObservation> => {
  const entries: FileObservation[] = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = fs.lstatSync(absolute);
      const mode = stat.mode & 0o777;
      if (stat.isSymbolicLink())
        entries.push({
          path: relative,
          kind: "symlink",
          mode,
          target: String(normalizeObservation(fs.readlinkSync(absolute), normalizationRoots)),
        });
      else if (stat.isDirectory()) {
        entries.push({ path: relative, kind: "directory", mode });
        visit(absolute);
      } else if (stat.isFile()) {
        const bytes = fs.readFileSync(absolute);
        const raw = digest(bytes);
        const text = bytes.toString("utf8");
        const normalized = /\.(?:json|jsonl|toml|lock|md|txt|yaml|yml)$/u.test(name)
          ? digest(String(normalizeObservation(text, normalizationRoots)))
          : raw;
        entries.push({
          path: relative,
          kind: "file",
          mode,
          bytes: bytes.length,
          sha256: raw,
          comparisonSha256: normalized,
        });
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return entries;
};

export const snapshotDigest = (entries: ReadonlyArray<FileObservation>): string =>
  digest(
    JSON.stringify(
      entries.map((entry) => ({
        path: entry.path,
        kind: entry.kind,
        mode: entry.mode,
        ...(entry.target === undefined ? {} : { target: entry.target }),
        ...(entry.comparisonSha256 === undefined ? {} : { sha256: entry.comparisonSha256 }),
      })),
    ),
  );
