/** Native postconditions keep timing a successful-looking no-op from passing as the intended work. */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as Schema from "effect/Schema";
import type { BenchmarkMode } from "./model.js";
import type { PreparedInvocation, ProcessResult, ScenarioContext } from "./fixtures.js";

type JsonAssertion =
  | { readonly at: ReadonlyArray<string | number>; readonly equals: unknown }
  | { readonly at: ReadonlyArray<string | number>; readonly absent: true };

export type ArtifactExpectation =
  | {
      readonly kind: "json";
      readonly path: string;
      readonly assertions: ReadonlyArray<JsonAssertion>;
    }
  | {
      readonly kind: "text";
      readonly path: string;
      readonly includes?: ReadonlyArray<string>;
      readonly excludes?: ReadonlyArray<string>;
      readonly equals?: string;
    }
  | { readonly kind: "absent"; readonly path: string }
  | {
      readonly kind: "present";
      readonly path: string;
      readonly type: "file" | "directory" | "symlink";
    }
  | { readonly kind: "symlink"; readonly path: string; readonly target?: string };

export interface PreparedExpectation {
  /** Paths are relative to the selected workspace, or explicit absolute fixture paths. */
  readonly readonlyPaths?: ReadonlyArray<string>;
  /** Applying postconditions. Preview instead verifies the captured durable tree is unchanged. */
  readonly artifacts?: ReadonlyArray<ArtifactExpectation>;
  readonly output?: {
    readonly envelope?: "operation" | "raw";
    readonly includes?: ReadonlyArray<string>;
    readonly json?: ReadonlyArray<JsonAssertion>;
  };
  readonly outcome?: "applied" | "no-op" | "ready" | "planned";
  /** For an intended no-op, include byte, membership, symlink and file-mtime preservation. */
  readonly noDurableChange?: boolean;
}

interface CapturedEntry {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink" | "other" | "absent";
  readonly hash?: string;
  readonly mtimeNs?: string;
  readonly target?: string;
}

const absent = (cause: unknown): boolean =>
  cause instanceof Error && "code" in cause && cause.code === "ENOENT";

const fixturePath = (context: ScenarioContext, file: string): string =>
  path.isAbsolute(file) ? file : path.join(context.workspace, file);

/** Only application-owned diagnostic/cache state is excluded; settlement receipts remain observed. */
const userCacheRoot =
  process.platform === "darwin"
    ? "Library/Caches/axm"
    : process.platform === "win32"
      ? "AppData/Local/axm/cache"
      : ".cache/axm";
const applicationContainers = new Set([
  ".axm",
  ...userCacheRoot
    .split("/")
    .slice(0, -1)
    .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
]);
const excluded = (root: string, file: string, userHome: boolean): boolean => {
  const relative = path.relative(root, file).split(path.sep).join("/");
  return (
    relative === ".git" ||
    relative.startsWith(".git/") ||
    [".axm/cache", ".axm/diagnostics", ...(userHome ? [userCacheRoot] : [])].some(
      (prefix) => relative === prefix || relative.startsWith(`${prefix}/`),
    )
  );
};

const snapshot = async (
  root: string,
  skipApplicationState: boolean,
  userHome: boolean,
): Promise<ReadonlyArray<CapturedEntry>> => {
  const entries: CapturedEntry[] = [];
  const visit = async (file: string): Promise<void> => {
    if (skipApplicationState && excluded(root, file, userHome)) return;
    let stat;
    try {
      stat = await fs.lstat(file, { bigint: true });
    } catch (cause) {
      if (!absent(cause)) throw cause;
      entries.push({ path: file, kind: "absent" });
      return;
    }
    if (stat.isSymbolicLink())
      entries.push({
        path: file,
        kind: "symlink",
        target: await fs.readlink(file),
        mtimeNs: String(stat.mtimeNs),
      });
    else if (stat.isDirectory()) {
      // The application-state container can be created solely for an excluded cache/log.
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (!(
        skipApplicationState &&
        (relative === ".axm" || (userHome && applicationContainers.has(relative)))
      ))
        entries.push({ path: file, kind: "directory" });
      for (const name of (await fs.readdir(file)).sort()) await visit(path.join(file, name));
    } else if (stat.isFile())
      entries.push({
        path: file,
        kind: "file",
        hash: createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex"),
        mtimeNs: String(stat.mtimeNs),
      });
    else entries.push({ path: file, kind: "other" });
  };
  await visit(root);
  return entries;
};

const select = (
  input: unknown,
  at: ReadonlyArray<string | number>,
): { readonly present: boolean; readonly value: unknown } => {
  let value = input;
  for (const field of at) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.prototype.hasOwnProperty.call(value, field)
    )
      return { present: false, value: undefined };
    const property = Object.getOwnPropertyDescriptor(value, String(field));
    if (property === undefined || !("value" in property))
      return { present: false, value: undefined };
    value = property.value;
  }
  return { present: true, value };
};

const assertJson = (
  subject: string,
  value: unknown,
  assertions: ReadonlyArray<JsonAssertion>,
): void => {
  for (const assertion of assertions) {
    const observed = select(value, assertion.at);
    if (
      "absent" in assertion
        ? observed.present
        : !observed.present || !isDeepStrictEqual(observed.value, assertion.equals)
    ) {
      throw new Error(
        `${subject}: ${assertion.at.join(".")} expected ${"absent" in assertion ? "absent" : JSON.stringify(assertion.equals)}, observed ${observed.present ? JSON.stringify(observed.value) : "absent"}`,
      );
    }
  }
};

const verifyArtifact = async (
  context: ScenarioContext,
  artifact: ArtifactExpectation,
): Promise<void> => {
  const file = fixturePath(context, artifact.path);
  if (artifact.kind === "absent") {
    try {
      await fs.lstat(file);
    } catch (cause) {
      if (absent(cause)) return;
      throw cause;
    }
    throw new Error(`Expected ${file} to be absent`);
  }
  if (artifact.kind === "symlink") {
    const target = await fs.readlink(file);
    if (artifact.target !== undefined && target !== artifact.target)
      throw new Error(`Unexpected link target at ${file}: ${target}`);
    return;
  }
  if (artifact.kind === "present") {
    const stat = await fs.lstat(file);
    if (
      !(artifact.type === "file"
        ? stat.isFile()
        : artifact.type === "directory"
          ? stat.isDirectory()
          : stat.isSymbolicLink())
    )
      throw new Error(`Expected ${file} to be a ${artifact.type}`);
    return;
  }
  const content = await fs.readFile(file, "utf8");
  if (artifact.kind === "json") {
    assertJson(
      file,
      Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(content),
      artifact.assertions,
    );
    return;
  }
  if (artifact.equals !== undefined && content !== artifact.equals)
    throw new Error(`Unexpected content at ${file}`);
  for (const text of artifact.includes ?? [])
    if (!content.includes(text))
      throw new Error(`${file} does not contain ${JSON.stringify(text)}`);
  for (const text of artifact.excludes ?? [])
    if (content.includes(text))
      throw new Error(`${file} unexpectedly contains ${JSON.stringify(text)}`);
};

const assertOutput = (
  result: ProcessResult,
  invocation: PreparedInvocation,
  expectation: PreparedExpectation,
): void => {
  for (const text of expectation.output?.includes ?? [])
    if (!(result.stdout + result.stderr).includes(text))
      throw new Error(`Missing output ${JSON.stringify(text)}`);
  if (invocation.args.includes("--json")) {
    const value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(result.stdout);
    assertJson("command output", value, [
      ...(expectation.output?.envelope === "raw" ? [] : [{ at: ["ok"], equals: true }]),
      ...(expectation.output?.json ?? []),
    ]);
    if (expectation.outcome !== undefined)
      assertJson("command outcome", value, [
        { at: ["result", "outcome"], equals: expectation.outcome },
      ]);
  } else if (expectation.output?.json !== undefined)
    throw new Error("JSON expectations require a JSON invocation");
};

/** Captures outside the measured process; returned verification also runs outside command timing. */
export const wrapPrepared = async (
  context: ScenarioContext,
  mode: Pick<BenchmarkMode, "id" | "flags">,
  prepared: PreparedInvocation,
  expectation: PreparedExpectation,
): Promise<PreparedInvocation> => {
  const preview = mode.id === "preview" || mode.flags.includes("--preview");
  const roots =
    preview || expectation.noDurableChange === true ? [context.workspace, context.home] : [];
  const captured = await Promise.all([
    ...roots.map(async (root) => ({
      root,
      skipApplicationState: true,
      userHome: root === context.home,
      entries: await snapshot(root, true, root === context.home),
    })),
    ...(expectation.readonlyPaths ?? []).map(async (relative) => {
      const root = fixturePath(context, relative);
      return {
        root,
        skipApplicationState: false,
        userHome: false,
        entries: await snapshot(root, false, false),
      };
    }),
  ]);
  return {
    ...prepared,
    verify: async (result) => {
      await prepared.verify(result);
      assertOutput(result, prepared, expectation);
      for (const before of captured) {
        const after = await snapshot(before.root, before.skipApplicationState, before.userHome);
        if (!isDeepStrictEqual(before.entries, after)) {
          const prior = new Map(before.entries.map((entry) => [entry.path, entry]));
          const current = new Map(after.map((entry) => [entry.path, entry]));
          const changed = [...new Set([...prior.keys(), ...current.keys()])].filter(
            (file) => !isDeepStrictEqual(prior.get(file), current.get(file)),
          );
          throw new Error(
            `${preview ? "Preview" : "Read-only/no-op"} changed durable state:\n${changed.join("\n")}`,
          );
        }
      }
      if (!preview)
        for (const artifact of expectation.artifacts ?? []) await verifyArtifact(context, artifact);
    },
  };
};
