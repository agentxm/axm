/**
 * Optional kernel-observed physical work for untraced preflight invocations.
 *
 * Product trace counters carry no operands, so they cannot show one path being
 * read twice. This capture records the whole process tree of one untraced
 * invocation with strace and reduces it to per-path counts. It perturbs timing:
 * it is never applied to timing blocks and is never a pass or fail gate.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as Effect from "effect/Effect";
import {
  ObservabilityBenchmarkFailure,
  type ObservabilityRunMode,
} from "./observability-contract.js";
import { digest } from "./observability-process.js";

/**
 * File opens, read/write, stat/access, namespace changes, directory reads and
 * metadata updates, plus chdir/fchdir so each process's working directory is
 * known for relative paths.
 */
const physicalWorkSyscalls = [
  "open",
  "openat",
  "openat2",
  "creat",
  "read",
  "pread64",
  "readv",
  "preadv",
  "preadv2",
  "write",
  "pwrite64",
  "writev",
  "pwritev",
  "pwritev2",
  "stat",
  "lstat",
  "newfstatat",
  "statx",
  "access",
  "faccessat",
  "faccessat2",
  "readlink",
  "readlinkat",
  "rename",
  "renameat",
  "renameat2",
  "unlink",
  "unlinkat",
  "rmdir",
  "mkdir",
  "mkdirat",
  "link",
  "linkat",
  "symlink",
  "symlinkat",
  "getdents64",
  "truncate",
  "ftruncate",
  "chmod",
  "fchmod",
  "fchmodat",
  "fchmodat2",
  "utimensat",
  "fsync",
  "fdatasync",
  "copy_file_range",
  "chdir",
  "fchdir",
] as const;

const physicalWorkCounters = [
  "readOpens",
  "readCalls",
  "readBytes",
  "writeOpens",
  "writeCalls",
  "writeBytes",
  "pathOpens",
  "directoryOpens",
  "directoryReads",
  "stats",
  "access",
  "readlinks",
  "renamedTo",
  "removed",
  "mkdirCalls",
  "linked",
  "openFailed",
] as const;
type PhysicalWorkCounter = (typeof physicalWorkCounters)[number];
type PathCounters = Partial<Record<PhysicalWorkCounter, number>>;

const configurationFailure = (message: string) =>
  Effect.fail(new ObservabilityBenchmarkFailure({ code: "configuration", message }));

/** AXM_OBSERVABILITY_PHYSICAL_WORK, validated before manifests and fixtures. Unset changes nothing. */
export const physicalWorkConfiguration = (environment: {
  readonly value: string | undefined;
  readonly runMode: ObservabilityRunMode;
  readonly platform: NodeJS.Platform;
}): Effect.Effect<"strace" | undefined, ObservabilityBenchmarkFailure> => {
  if (environment.value === undefined) return Effect.succeed(undefined);
  if (environment.value !== "strace")
    return configurationFailure(
      "AXM_OBSERVABILITY_PHYSICAL_WORK must be strace or unset; received " +
        JSON.stringify(environment.value) +
        ".",
    );
  if (environment.runMode === "measure")
    return configurationFailure(
      "Physical-work capture perturbs timing and is refused in measure mode; use fixtures or compare mode.",
    );
  if (environment.platform !== "linux")
    return configurationFailure("Physical-work capture with strace requires Linux.");
  return Effect.succeed("strace");
};

/**
 * Process deadline for a recorded invocation. Recording every filesystem call multiplies
 * their cost, so a recorded sample is not held to the ordinary process deadline.
 */
export const recordedProcessDeadlineMillis = 600_000;

/** Command words placed before the observed executable; strace writes only the recording. */
export const straceCommandPrefix = (
  executable: string,
  recording: string,
): ReadonlyArray<string> => [
  executable,
  "-f",
  "-qq",
  "-y",
  "-e",
  "trace=" + physicalWorkSyscalls.join(","),
  "-o",
  recording,
  "--",
];

/** Run one command for configuration checks; any failure carries its standard error. */
const runCheck = (
  executable: string,
  args: ReadonlyArray<string>,
  searchPath: string | undefined,
): string => {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: searchPath, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(
      [executable, ...args].join(" ") +
        " exited with " +
        (result.status === null ? "signal " + String(result.signal) : String(result.status)) +
        (result.stderr.trim().length > 0 ? ": " + result.stderr.trim() : ""),
    );
  return result.stdout;
};

/**
 * Resolve strace and run the exact capture prefix once against a trivial
 * child, before any fixture is prepared. This refuses an strace that rejects
 * the fixed syscall set and a host that does not permit ptrace.
 */
export const locateStrace = (searchPath: string | undefined) =>
  Effect.try({
    try: () => {
      const executable = (searchPath ?? "")
        .split(path.delimiter)
        .filter((directory) => path.isAbsolute(directory))
        .map((directory) => path.join(directory, "strace"))
        .find((candidate) => {
          try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return fs.statSync(candidate).isFile();
          } catch {
            return false;
          }
        });
      if (executable === undefined) throw new Error("strace was not found on PATH");
      const version = runCheck(executable, ["-V"], searchPath).split("\n")[0]?.trim();
      if (version === undefined || version.length === 0)
        throw new Error("strace -V reported no version");
      const [command = executable, ...probe] = [
        ...straceCommandPrefix(executable, os.devNull),
        process.execPath,
        "-e",
        "0",
      ];
      runCheck(command, probe, searchPath);
      return { executable, version };
    },
    catch: (cause) =>
      new ObservabilityBenchmarkFailure({
        code: "configuration",
        message:
          "AXM_OBSERVABILITY_PHYSICAL_WORK=strace requires an executable strace: " +
          (cause instanceof Error ? cause.message : String(cause)),
      }),
  });

export const physicalWorkMethod = {
  tool: "strace",
  options: ["-f", "-qq", "-y"],
  syscalls: physicalWorkSyscalls,
  appliesTo: "Preflight baseline and candidate disabled-mode (untraced) invocations only.",
  interpretation:
    "Kernel-observed calls of the whole process tree, including child processes such as git, independent of product traces. Not timing evidence: the capture perturbs elapsed time and RSS and never runs in timing blocks. Lock heartbeat traffic varies with hold time.",
  attribution:
    "Opens, stats, access, readlinks, namespace changes and mkdir use the requested path resolved against its annotated directory descriptor or, for relative paths of AT_FDCWD and legacy calls, against the calling process's working directory: its latest AT_FDCWD annotation or successful chdir/fchdir, and the recorded working directory only for the invoked process before either. A relative path of a process whose working directory is not yet known counts in unresolvedPaths. Reads, writes, directory reads and copy_file_range use the kernel's descriptor path. Calls on non-path descriptors (pipes, sockets, anonymous inodes) count only in syscall totals.",
};

export interface PhysicalWorkRoot {
  readonly token: string;
  readonly directory: string;
}

export interface PhysicalWorkContext {
  readonly workingDirectory: string;
  readonly roots: ReadonlyArray<PhysicalWorkRoot>;
}

export interface PhysicalWorkReduction {
  readonly syscalls: Readonly<Record<string, number>>;
  readonly paths: Readonly<Record<string, PathCounters>>;
  readonly accounting: {
    readonly lines: number;
    readonly calls: number;
    readonly joinedResumptions: number;
    readonly unfinishedAtEnd: number;
    readonly unmatchedResumptions: number;
    readonly processEvents: number;
    readonly unparsedLines: number;
    readonly unresolvedPaths: number;
    readonly nonPathDescriptorCalls: number;
  };
}

const byText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
/** Atomic-writer siblings: `<target>.tmp.<pid>.<sequence>.<random>`, each base 36. */
const atomicPattern = /\.tmp\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+$/u;
const randomSuffixPatterns = [
  /^(\.?axm-[a-z0-9]+(?:-[a-z0-9]+)*-)[A-Za-z0-9]{6}$/u,
  /^(\.publication-)[A-Za-z0-9]{6}$/u,
  /^(tmp_[a-z]+_)[A-Za-z0-9]{6}$/u,
  /^(incoming-)[A-Za-z0-9]{6}$/u,
];

/**
 * Project one absolute path: process-relative /proc entries, fixture and host
 * roots (most specific first), then per-invocation random names.
 */
export const projectPhysicalPath = (
  absolute: string,
  roots: ReadonlyArray<PhysicalWorkRoot>,
): string => {
  const proc = absolute.replace(
    /^\/proc\/(?:self|thread-self|\d+)(?:\/task\/\d+)?(?=\/|$)/u,
    "/proc/<pid>",
  );
  if (/^\/proc\/<pid>\/fd\/\d+$/u.test(proc)) return "<proc-fd>";
  const root = [...roots]
    .filter(({ directory }) => proc === directory || proc.startsWith(directory + "/"))
    .sort((left, right) => right.directory.length - left.directory.length)[0];
  const rooted = root === undefined ? proc : root.token + proc.slice(root.directory.length);
  const components = rooted.split("/");
  const projected: string[] = [];
  for (const [index, component] of components.entries())
    projected.push(
      ((): string => {
        const named = component
          .replace(uuidPattern, "<uuid>")
          .replace(atomicPattern, ".tmp.<atomic>");
        const random = randomSuffixPatterns
          .map((pattern) => pattern.exec(named)?.[1])
          .find((prefix) => prefix !== undefined);
        if (random !== undefined) return random + "<random>";
        // A temporary file inside a random directory has a random 12-hex name and its suffix.
        if (
          projected[index - 1]?.endsWith("<random>") === true &&
          /^[0-9a-f]{12}(?=\.|$)/u.test(named)
        )
          return "<random>" + named.slice(12);
        // git init's symlink-support probe creates and removes `.git/tXXXXXX`.
        if (components[index - 1] === ".git" && /^t[A-Za-z0-9]{6}$/u.test(named))
          return "t<random>";
        if (components[index - 1] === "objects" && /^[0-9a-f]{2}$/u.test(named)) return "<fanout>";
        if (components[index - 2] === "objects" && /^[0-9a-f]{38}$/u.test(named)) return "<object>";
        return named.replace(/^pack-[0-9a-f]{40}(?:[0-9a-f]{24})?(?=\.|$)/u, "pack-<hash>");
      })(),
    );
  return projected.join("/");
};

/** Decode one strace C-escaped string body (\", \\, \n, \xHH, \NNN octal) to UTF-8 text. */
const unescape = (text: string): string => {
  if (!text.includes("\\")) return text;
  const bytes: number[] = [];
  const simple: Readonly<Record<string, number>> = {
    n: 10,
    t: 9,
    r: 13,
    v: 11,
    f: 12,
    a: 7,
    b: 8,
    "\\": 92,
    '"': 34,
    "'": 39,
  };
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf8"));
      continue;
    }
    const next = text.charAt(index + 1);
    const hex = next === "x" ? /^[0-9a-fA-F]{1,2}/u.exec(text.slice(index + 2))?.[0] : undefined;
    const octal = /^[0-7]{1,3}/u.exec(text.slice(index + 1))?.[0];
    if (hex !== undefined) {
      bytes.push(Number.parseInt(hex, 16));
      index += 1 + hex.length;
    } else if (octal !== undefined) {
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length;
    } else if (next === "") bytes.push(92);
    else {
      bytes.push(simple[next] ?? next.charCodeAt(0));
      index += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
};

/** Scan one quoted or angle-bracketed run; returns the index after its closing delimiter. */
const scanDelimited = (text: string, start: number, close: string): number => {
  for (let index = start + 1; index < text.length; index++) {
    const character = text.charAt(index);
    if (character === "\\") index++;
    else if (character === close) return index + 1;
  }
  return text.length;
};

/** Split top-level call arguments, respecting strings, fd annotations, nesting and comments. */
const splitCall = (
  text: string,
): { readonly args: ReadonlyArray<string>; readonly result: string } | undefined => {
  const args: string[] = [];
  let depth = 0;
  let current = 0;
  for (let index = 0; index < text.length;) {
    const character = text.charAt(index);
    if (character === '"') index = scanDelimited(text, index, '"');
    else if (character === "<") index = scanDelimited(text, index, ">");
    else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else if (character === "(" || character === "[" || character === "{") {
      depth++;
      index++;
    } else if (character === ")" && depth === 0) {
      const last = text.slice(current, index).trim();
      if (last.length > 0 || args.length > 0) args.push(last);
      return { args, result: text.slice(index + 1) };
    } else if (character === ")" || character === "]" || character === "}") {
      depth--;
      index++;
    } else if (character === "," && depth === 0) {
      args.push(text.slice(current, index).trim());
      current = ++index;
    } else index++;
  }
  return undefined;
};

const quotedString = (argument: string | undefined): string | undefined => {
  if (argument === undefined || !argument.startsWith('"')) return undefined;
  const end = scanDelimited(argument, 0, '"');
  return unescape(argument.slice(1, end - 1));
};

/** A descriptor argument: its annotated path, or the calling process's working directory for bare AT_FDCWD. */
const descriptor = (
  argument: string | undefined,
  workingDirectory: string | undefined,
): { readonly path: string | undefined; readonly annotated: string | undefined } | undefined => {
  const match = /^(AT_FDCWD|-?\d+)(?:<(.*)>)?$/su.exec(argument ?? "");
  if (match === null) return undefined;
  const annotated = match[2] === undefined ? undefined : unescape(match[2]);
  return {
    annotated,
    path:
      annotated !== undefined && annotated.startsWith("/")
        ? annotated
        : match[1] === "AT_FDCWD" && annotated === undefined
          ? workingDirectory
          : undefined,
  };
};

const resultValue = (result: string): number | undefined => {
  const match = /^\s*=\s*(-?\d+)/u.exec(result);
  return match?.[1] === undefined ? undefined : Number(match[1]);
};

interface Classified {
  readonly counts: ReadonlyArray<{
    readonly path: string;
    readonly counter: PhysicalWorkCounter;
    readonly amount: number;
  }>;
  readonly unresolved: number;
  readonly nonPath: number;
  /** A successful chdir/fchdir: the new working directory, or undefined when it cannot be resolved. */
  readonly changedWorkingDirectory?: { readonly path: string | undefined };
}

/**
 * Map one complete call to path counters. A missing result (unfinished at exit)
 * is not success. `workingDirectory` is the calling process's, when known.
 */
const classify = (
  name: string,
  args: ReadonlyArray<string>,
  returned: number | undefined,
  workingDirectory: string | undefined,
): Classified => {
  const counts: Array<{ path: string; counter: PhysicalWorkCounter; amount: number }> = [];
  let unresolved = 0;
  let nonPath = 0;
  const at = (directoryArgument: string | undefined, pathArgument: string | undefined) => {
    const requested = quotedString(pathArgument);
    const directory = descriptor(directoryArgument, workingDirectory);
    if (requested === undefined) return undefined;
    if (requested.startsWith("/")) return path.posix.resolve(requested);
    if (directory?.path === undefined) return undefined;
    return requested === "" ? directory.path : path.posix.resolve(directory.path, requested);
  };
  const plain = (pathArgument: string | undefined) => at("AT_FDCWD", pathArgument);
  const add = (target: string | undefined, counter: PhysicalWorkCounter, amount = 1) => {
    if (target === undefined) unresolved++;
    else counts.push({ path: target, counter, amount });
  };
  const fdPath = (argument: string | undefined) => {
    const found = descriptor(argument, workingDirectory);
    if (found?.annotated !== undefined && found.path === undefined) nonPath++;
    return found?.annotated === undefined ? undefined : found.path;
  };
  const transfer = (
    argument: string | undefined,
    calls: PhysicalWorkCounter,
    bytes: PhysicalWorkCounter,
  ) => {
    if (returned === undefined || returned <= 0) return;
    const target = fdPath(argument);
    if (target === undefined) return;
    counts.push(
      { path: target, counter: calls, amount: 1 },
      { path: target, counter: bytes, amount: returned },
    );
  };
  const succeeded = returned === 0;
  const open = (target: string | undefined, flags: string) => {
    if (returned === undefined) return;
    add(
      target,
      returned < 0
        ? "openFailed"
        : flags.includes("O_PATH")
          ? "pathOpens"
          : flags.includes("O_DIRECTORY")
            ? "directoryOpens"
            : name === "creat" || flags.includes("O_WRONLY") || flags.includes("O_RDWR")
              ? "writeOpens"
              : "readOpens",
    );
  };
  switch (name) {
    case "open":
      open(plain(args[0]), args[1] ?? "");
      break;
    case "creat":
      open(plain(args[0]), "");
      break;
    case "openat":
    case "openat2":
      open(at(args[0], args[1]), args[2] ?? "");
      break;
    case "read":
    case "pread64":
    case "readv":
    case "preadv":
    case "preadv2":
      transfer(args[0], "readCalls", "readBytes");
      break;
    case "write":
    case "pwrite64":
    case "writev":
    case "pwritev":
    case "pwritev2":
      transfer(args[0], "writeCalls", "writeBytes");
      break;
    case "copy_file_range":
      transfer(args[0], "readCalls", "readBytes");
      transfer(args[2], "writeCalls", "writeBytes");
      break;
    case "getdents64":
      if (returned !== undefined && returned > 0) {
        const target = fdPath(args[0]);
        if (target !== undefined)
          counts.push({ path: target, counter: "directoryReads", amount: 1 });
      }
      break;
    case "stat":
    case "lstat":
      add(plain(args[0]), "stats");
      break;
    case "newfstatat":
    case "statx":
      add(at(args[0], args[1]), "stats");
      break;
    case "access":
      add(plain(args[0]), "access");
      break;
    case "faccessat":
    case "faccessat2":
      add(at(args[0], args[1]), "access");
      break;
    case "readlink":
      add(plain(args[0]), "readlinks");
      break;
    case "readlinkat":
      add(at(args[0], args[1]), "readlinks");
      break;
    case "rename":
      if (succeeded) add(plain(args[1]), "renamedTo");
      break;
    case "renameat":
    case "renameat2":
      if (succeeded) add(at(args[2], args[3]), "renamedTo");
      break;
    case "unlink":
    case "rmdir":
      if (succeeded) add(plain(args[0]), "removed");
      break;
    case "unlinkat":
      if (succeeded) add(at(args[0], args[1]), "removed");
      break;
    case "mkdir":
      add(plain(args[0]), "mkdirCalls");
      break;
    case "mkdirat":
      add(at(args[0], args[1]), "mkdirCalls");
      break;
    case "link":
    case "symlink":
      if (succeeded) add(plain(args[1]), "linked");
      break;
    case "linkat":
      if (succeeded) add(at(args[2], args[3]), "linked");
      break;
    case "symlinkat":
      if (succeeded) add(at(args[1], args[2]), "linked");
      break;
    case "chdir":
      if (succeeded)
        return { counts, unresolved, nonPath, changedWorkingDirectory: { path: plain(args[0]) } };
      break;
    case "fchdir":
      if (succeeded)
        return {
          counts,
          unresolved,
          nonPath,
          changedWorkingDirectory: { path: descriptor(args[0], undefined)?.path },
        };
      break;
    default:
      break;
  }
  return { counts, unresolved, nonPath };
};

const workingDirectoryAnnotation = /^AT_FDCWD<(.*)>$/su;

const callLine = /^(\d+)\s+([a-z_0-9]+)\((.*)$/su;
const resumedLine = /^(\d+)\s+<\.\.\. ([a-z_0-9]+) resumed>(.*)$/su;
const unfinishedSuffix = " <unfinished ...>";

/**
 * Reduce one `strace -f -y` recording. Calls split across processes by
 * `<unfinished ...>` / `<... name resumed>` are joined per process id and
 * counted once; calls still unfinished at the end count once without a result.
 *
 * Relative paths resolve against the calling process's own working directory.
 * Under `-f`, children such as git run in other directories, and legacy calls
 * (`access`, `mkdir`, `unlink`, ...) carry no AT_FDCWD annotation, so each
 * process id keeps its latest AT_FDCWD annotation or successful chdir/fchdir.
 * Only the invoked process (the first process id recorded) starts in the
 * recorded working directory; any other process's relative paths stay
 * unresolved until its working directory is observed. Threads share a working
 * directory, so a chdir in one thread reaches a sibling thread only at that
 * sibling's next annotated call.
 */
export const reducePhysicalWork = (
  lines: Iterable<string>,
  context: PhysicalWorkContext,
): PhysicalWorkReduction => {
  const syscalls = new Map<string, number>();
  const paths = new Map<string, Map<PhysicalWorkCounter, number>>();
  const pending = new Map<string, { readonly name: string; readonly text: string }>();
  const accounting = {
    lines: 0,
    calls: 0,
    joinedResumptions: 0,
    unfinishedAtEnd: 0,
    unmatchedResumptions: 0,
    processEvents: 0,
    unparsedLines: 0,
    unresolvedPaths: 0,
    nonPathDescriptorCalls: 0,
  };
  const workingDirectories = new Map<string, string>();
  let invokedProcess: string | undefined;
  const observeProcess = (pid: string) => {
    if (invokedProcess !== undefined) return;
    invokedProcess = pid;
    workingDirectories.set(pid, context.workingDirectory);
  };
  const projections = new Map<string, string>();
  const project = (target: string) => {
    const known = projections.get(target);
    if (known !== undefined) return known;
    const projected = projectPhysicalPath(target, context.roots);
    projections.set(target, projected);
    return projected;
  };
  const record = (pid: string, name: string, text: string, finished: boolean) => {
    const call = splitCall(text);
    if (call === undefined) {
      accounting.unparsedLines++;
      return;
    }
    accounting.calls++;
    syscalls.set(name, (syscalls.get(name) ?? 0) + 1);
    for (const argument of call.args) {
      const annotated = workingDirectoryAnnotation.exec(argument)?.[1];
      if (annotated === undefined) continue;
      const directory = unescape(annotated);
      if (directory.startsWith("/")) workingDirectories.set(pid, directory);
    }
    const classified = classify(
      name,
      call.args,
      finished ? resultValue(call.result) : undefined,
      workingDirectories.get(pid),
    );
    if (classified.changedWorkingDirectory !== undefined) {
      const changed = classified.changedWorkingDirectory.path;
      if (changed === undefined) workingDirectories.delete(pid);
      else workingDirectories.set(pid, changed);
    }
    accounting.unresolvedPaths += classified.unresolved;
    accounting.nonPathDescriptorCalls += classified.nonPath;
    for (const { path: target, counter, amount } of classified.counts) {
      const key = project(target);
      const counters = paths.get(key) ?? new Map<PhysicalWorkCounter, number>();
      counters.set(counter, (counters.get(counter) ?? 0) + amount);
      paths.set(key, counters);
    }
  };
  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.length === 0) continue;
    accounting.lines++;
    const resumed = resumedLine.exec(line);
    if (resumed !== null) {
      const [, pid = "", name = "", rest = ""] = resumed;
      observeProcess(pid);
      const started = pending.get(pid);
      pending.delete(pid);
      if (started === undefined || started.name !== name) {
        accounting.unmatchedResumptions++;
        if (started !== undefined) record(pid, started.name, started.text + ")", false);
        continue;
      }
      accounting.joinedResumptions++;
      record(pid, name, started.text + rest, true);
      continue;
    }
    const call = callLine.exec(line);
    if (call !== null) {
      const [, pid = "", name = "", rest = ""] = call;
      observeProcess(pid);
      if (rest.endsWith(unfinishedSuffix)) {
        const prior = pending.get(pid);
        if (prior !== undefined) record(pid, prior.name, prior.text + ")", false);
        pending.set(pid, { name, text: rest.slice(0, -unfinishedSuffix.length) });
      } else record(pid, name, rest, true);
      continue;
    }
    if (/^\d+\s+(?:---|\+\+\+) /u.test(line)) accounting.processEvents++;
    else accounting.unparsedLines++;
  }
  for (const [pid, started] of pending) {
    accounting.unfinishedAtEnd++;
    record(pid, started.name, started.text + ")", false);
  }
  return {
    syscalls: Object.fromEntries([...syscalls].sort(([left], [right]) => byText(left, right))),
    paths: Object.fromEntries(
      [...paths]
        .sort(([left], [right]) => byText(left, right))
        .map(([key, counters]) => [
          key,
          Object.fromEntries(
            physicalWorkCounters.flatMap((counter) => {
              const value = counters.get(counter);
              return value === undefined ? [] : [[counter, value]];
            }),
          ),
        ]),
    ),
    accounting,
  };
};

/** Digest of the comparable content: syscall totals and per-path counters. */
export const physicalWorkDigest = (
  reduction: Pick<PhysicalWorkReduction, "syscalls" | "paths">,
): string => digest(JSON.stringify({ syscalls: reduction.syscalls, paths: reduction.paths }));

/** Every differing (path, counter) and syscall total, sorted; absent counts compare as zero. */
export const comparePhysicalWork = (
  baseline: Pick<PhysicalWorkReduction, "syscalls" | "paths">,
  candidate: Pick<PhysicalWorkReduction, "syscalls" | "paths">,
) => {
  const keys = (left: object, right: object) =>
    [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(byText);
  const differences = keys(baseline.paths, candidate.paths).flatMap((key) => {
    const before = baseline.paths[key] ?? {};
    const after = candidate.paths[key] ?? {};
    return physicalWorkCounters.flatMap((counter) => {
      const left = before[counter] ?? 0;
      const right = after[counter] ?? 0;
      return left === right ? [] : [{ path: key, counter, baseline: left, candidate: right }];
    });
  });
  const syscallDifferences = keys(baseline.syscalls, candidate.syscalls).flatMap((name) => {
    const left = baseline.syscalls[name] ?? 0;
    const right = candidate.syscalls[name] ?? 0;
    return left === right ? [] : [{ syscall: name, baseline: left, candidate: right }];
  });
  return { differences, syscallDifferences };
};

export interface PhysicalWorkSampleRecord {
  readonly sample: string;
  readonly reductionSha256: string;
  readonly reduction: Pick<PhysicalWorkReduction, "syscalls" | "paths">;
}

/** The output-root comparison document. Reported evidence only; never a gate. */
export const physicalWorkComparisonDocument = (
  scenarios: ReadonlyArray<{
    readonly scenario: string;
    readonly baseline: PhysicalWorkSampleRecord;
    readonly candidate: PhysicalWorkSampleRecord;
  }>,
) => {
  const entries = [...scenarios]
    .sort((left, right) => byText(left.scenario, right.scenario))
    .map(({ scenario, baseline, candidate }) => ({
      scenario,
      baseline: { sample: baseline.sample, reductionSha256: baseline.reductionSha256 },
      candidate: { sample: candidate.sample, reductionSha256: candidate.reductionSha256 },
      ...comparePhysicalWork(baseline.reduction, candidate.reduction),
    }));
  return {
    schemaVersion: 1,
    interpretation:
      "Per-scenario baseline versus candidate untraced physical work. Differences are reported evidence, never a pass or fail gate: binaries may differ after an optimization and lock heartbeat traffic varies with hold time.",
    scenarios: entries,
    summary: {
      scenariosCaptured: entries.length,
      scenariosWithDifferences: entries.filter(
        (entry) => entry.differences.length > 0 || entry.syscallDifferences.length > 0,
      ).length,
    },
  };
};

/** Stream one recording's lines in bounded chunks while hashing its exact bytes. */
const recordingLines = function* (
  file: string,
  hash: ReturnType<typeof createHash>,
  size: { bytes: number },
): Generator<string> {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const decoder = new StringDecoder("utf8");
    let carry = "";
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const chunk = buffer.subarray(0, read);
      hash.update(chunk);
      size.bytes += read;
      const lines = (carry + decoder.write(chunk)).split("\n");
      carry = lines.pop() ?? "";
      yield* lines;
    }
    const rest = carry + decoder.end();
    if (rest.length > 0) yield rest;
  } finally {
    fs.closeSync(handle);
  }
};

/** Reduce a retained recording and identify its exact bytes. */
export const readPhysicalWorkRecording = (recording: string, context: PhysicalWorkContext) =>
  Effect.try({
    try: () => {
      const hash = createHash("sha256");
      const size = { bytes: 0 };
      const reduction = reducePhysicalWork(recordingLines(recording, hash, size), context);
      return {
        recording: { sha256: hash.digest("hex"), bytes: size.bytes },
        reduction,
        reductionSha256: physicalWorkDigest(reduction),
      };
    },
    catch: (cause) =>
      new ObservabilityBenchmarkFailure({
        code: "physical-work",
        message:
          "Cannot reduce the physical-work recording " +
          recording +
          ": " +
          (cause instanceof Error ? cause.message : String(cause)),
      }),
  });
