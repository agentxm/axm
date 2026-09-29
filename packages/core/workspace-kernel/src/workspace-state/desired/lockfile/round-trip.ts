import * as Equal from "effect/Equal";
import YAML from "yaml";
import { prepareDocumentRoundTrip, type DocumentRoundTripContext } from "../document-round-trip.js";
import { LOCKFILE_VERSION } from "./schema.js";
import { LockfileWriteError } from "./errors.js";

const maps = ["skills", "mcpServers", "subagents", "rules", "hooks", "knowledge", "packs"];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const parse = (raw: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = YAML.parse(raw);
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const entries = (document: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = document[key];
  return record(value) ? value : {};
};
const normalize = (document: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(document).filter(
      ([key, value]) => !maps.includes(key) || !record(value) || Object.keys(value).length > 0,
    ),
  );

export const prepareLockfileRoundTrip = (args: {
  readonly context: DocumentRoundTripContext;
  readonly target: string;
  readonly before: string | undefined;
  readonly after: string;
}) => {
  const before =
    args.before === undefined
      ? { lockfileVersion: LOCKFILE_VERSION, skills: {} }
      : parse(args.before);
  const after = parse(args.after);
  const insertions: string[] = [];
  const withdrawals: string[] = [];
  if (before !== undefined && after !== undefined)
    for (const map of maps) {
      const prior = entries(before, map);
      const next = entries(after, map);
      for (const name of Object.keys(next))
        if (!Object.hasOwn(prior, name)) insertions.push(JSON.stringify(["lockfile", map, name]));
      for (const name of Object.keys(prior))
        if (!Object.hasOwn(next, name)) withdrawals.push(JSON.stringify(["lockfile", map, name]));
    }
  return prepareDocumentRoundTrip({
    ...args,
    unitPrefix: '["lockfile",',
    insertions,
    withdrawals,
    acceptAbsent:
      after !== undefined && Equal.equals(normalize(after), { lockfileVersion: LOCKFILE_VERSION }),
    acceptRestored: (raw) => {
      const restored = parse(raw);
      return (
        restored !== undefined &&
        after !== undefined &&
        Equal.equals(normalize(restored), normalize(after))
      );
    },
    mapFailure: (target, cause) =>
      cause instanceof LockfileWriteError
        ? cause
        : new LockfileWriteError({ path: target, step: "write-temp", cause }),
  });
};

/** YAML owns comments and anchors; update only the changed authoritative keys. */
export const renderLockfileUpdate = (before: string, encoded: Record<string, unknown>): string => {
  const document = YAML.parseDocument(before, { keepSourceTokens: true });
  if (document.errors.length > 0) throw new Error("Invalid lockfile YAML");
  const prior: unknown = document.toJS();
  if (!record(prior)) throw new Error("Lockfile root must be a mapping");
  for (const map of maps) {
    const previous = entries(prior, map);
    const next = entries(encoded, map);
    for (const key of Object.keys(previous))
      if (!Object.hasOwn(next, key)) document.deleteIn([map, key]);
    for (const [key, value] of Object.entries(next))
      if (!Equal.equals(previous[key], value)) document.setIn([map, key], value);
    if (encoded[map] === undefined && Object.hasOwn(prior, map)) document.delete(map);
    else if (!Object.hasOwn(prior, map) && record(encoded[map]) && Object.keys(next).length === 0)
      document.set(map, {});
  }
  if (!Equal.equals(prior["lockfileVersion"], encoded["lockfileVersion"]))
    document.set("lockfileVersion", encoded["lockfileVersion"]);
  const expected: Record<string, unknown> = { ...prior, ...encoded };
  for (const map of maps) if (encoded[map] === undefined) delete expected[map];
  const actual: unknown = document.toJS();
  if (!Equal.equals(expected, actual))
    throw new Error("Lockfile update would change unrelated aliased values");
  if (Equal.equals(prior, actual)) return before;
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  return (
    document.toString({ lineWidth: 0 }).trimEnd().replaceAll("\n", eol) +
    (before.match(/\s*$/)?.[0] ?? "")
  );
};
