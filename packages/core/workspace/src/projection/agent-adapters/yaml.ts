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
  serversKey: string,
): Readonly<Record<string, unknown>> | null => {
  const parsed = parseYamlObjectOrNull(raw);
  const servers = parsed?.[serversKey];
  if (servers !== undefined && !isRecord(servers)) {
    throw new Error(`${formatPath([serversKey])} must be a mapping`);
  }
  return parsed;
};

export const parseYaml = (raw: string): unknown => parseYamlDocument(raw).toJS();

export const readYamlEntry = (
  raw: string,
  serversKey: string,
  serverName: string,
): Readonly<Record<string, unknown>> | undefined => {
  const parsed = validateServersShape(raw, serversKey);
  const servers = parsed?.[serversKey];
  if (!isRecord(servers)) return undefined;
  const entry = servers[serverName];
  return isRecord(entry) ? entry : undefined;
};

export const managedYamlNames = (
  raw: string,
  serversKey: string,
  isManaged: (entry: Readonly<Record<string, unknown>>) => boolean,
): ReadonlyArray<string> => {
  const parsed = validateServersShape(raw, serversKey);
  const servers = parsed?.[serversKey];
  if (!isRecord(servers)) return [];
  return Object.entries(servers).flatMap(([name, entry]) =>
    isRecord(entry) && isManaged(entry) ? [name] : [],
  );
};

export const setYamlEntry = (
  raw: string,
  serversKey: string,
  serverName: string,
  entry: Readonly<Record<string, unknown>>,
): string => {
  validateServersShape(raw, serversKey);
  const document = parseYamlDocument(raw);
  document.setIn([serversKey, serverName], entry);
  return document.toString({ lineWidth: 0 });
};

export const deleteYamlEntry = (raw: string, serversKey: string, serverName: string): string => {
  validateServersShape(raw, serversKey);
  const document = parseYamlDocument(raw);
  const removed = document.deleteIn([serversKey, serverName]);
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
  const rootKey = path[0];
  if (rootKey !== undefined) validateServersShape(raw, rootKey);
  const document = parseYamlDocument(raw);
  document.setIn(path, value);
  return document.toString({ lineWidth: 0 });
};
