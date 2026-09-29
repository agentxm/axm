/**
 * YAML config helpers for AXM-owned structured config edits.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

import { parseDocument } from "yaml";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatPath = (path: ReadonlyArray<string>): string => path.join(".");

const parseYamlDocument = (raw: string) => {
  const document = parseDocument(raw, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }
  return document;
};

const parseYamlObjectOrNull = (raw: string): Readonly<Record<string, unknown>> | null => {
  const parsed: unknown = parseYamlDocument(raw).toJS();
  if (parsed === null || parsed === undefined) return null;
  if (!isRecord(parsed)) {
    throw new Error("YAML document root must be a mapping");
  }
  return parsed;
};

const validateServersShape = (
  raw: string,
  serversPath: ReadonlyArray<string>,
): Readonly<Record<string, unknown>> | null => {
  let current = parseYamlObjectOrNull(raw);
  for (const [index, key] of serversPath.entries()) {
    const value: unknown =
      current !== null && Object.hasOwn(current, key) ? current[key] : undefined;
    if (value === undefined) return null;
    if (!isRecord(value))
      throw new Error(`${formatPath(serversPath.slice(0, index + 1))} must be a mapping`);
    current = value;
  }
  return current;
};

export const parseYaml = (raw: string): unknown => parseYamlDocument(raw).toJS();

export const readYamlEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
): Readonly<Record<string, unknown>> | undefined => {
  const servers = validateServersShape(raw, serversPath);
  if (!isRecord(servers)) return undefined;
  const entry = servers[serverName];
  return isRecord(entry) ? entry : undefined;
};

export const managedYamlNames = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  isManaged: (entry: Readonly<Record<string, unknown>>) => boolean,
): ReadonlyArray<string> => {
  const servers = validateServersShape(raw, serversPath);
  if (!isRecord(servers)) return [];
  return Object.entries(servers).flatMap(([name, entry]) =>
    isRecord(entry) && isManaged(entry) ? [name] : [],
  );
};

export const setYamlEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
  entry: Readonly<Record<string, unknown>>,
): string => {
  validateServersShape(raw, serversPath);
  const document = parseYamlDocument(raw);
  document.setIn([...serversPath, serverName], entry);
  return document.toString({ lineWidth: 0 });
};

export const deleteYamlEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
): string => {
  validateServersShape(raw, serversPath);
  const document = parseYamlDocument(raw);
  const removed = document.deleteIn([...serversPath, serverName]);
  return removed ? document.toString({ lineWidth: 0 }) : raw;
};

export const setYamlScalar = (
  raw: string,
  path: ReadonlyArray<string>,
  value: boolean | number | string | null,
): string => {
  if (path.length === 0) {
    throw new Error("YAML scalar path must not be empty");
  }
  validateServersShape(raw, path.slice(0, -1));
  const document = parseYamlDocument(raw);
  document.setIn(path, value);
  return document.toString({ lineWidth: 0 });
};
