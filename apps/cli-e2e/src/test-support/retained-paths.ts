/** Expected coordinates for the simple ASCII source addresses used by process fixtures. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureSegments = (value: string) =>
  value
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (!/^[A-Za-z0-9._@~-]+$/u.test(segment))
        throw new Error(`Unsupported fixture segment: ${segment}`);
      return segment.replaceAll("~", "~7e");
    });

export const absoluteLocalFixturePath = (source: string): string => {
  const normalized = source.replaceAll("\\", "/");
  const drive = /^([A-Za-z]):\//u.exec(normalized);
  const segments =
    drive === null
      ? ["root", ...fixtureSegments(normalized)]
      : [`drive-${drive[1]?.toUpperCase()}`, ...fixtureSegments(normalized.slice(3))];
  return path.join("agent_extensions", "_local", "absolute", ...segments);
};

export const registryFixturePath = (
  endpoint: string,
  ...published: ReadonlyArray<string>
): string => {
  const url = new URL(endpoint);
  const root =
    url.protocol === "file:"
      ? absoluteLocalFixturePath(fileURLToPath(url))
      : path.join(
          "agent_extensions",
          url.hostname + (url.port === "" ? "" : `~3a${url.port}`),
          ...fixtureSegments(decodeURIComponent(url.pathname)),
        );
  return path.join(root, ...published);
};

/** Fixture settings keep the selected Registry local to the scope being inspected. */
export const configuredRegistryFixturePath = (
  workspace: string,
  ...published: ReadonlyArray<string>
): string => {
  const settings: unknown = JSON.parse(fs.readFileSync(path.join(workspace, "axm.json"), "utf8"));
  if (typeof settings !== "object" || settings === null)
    throw new Error("Expected fixture settings");
  const name =
    "defaultRegistry" in settings && typeof settings.defaultRegistry === "string"
      ? settings.defaultRegistry
      : "agentxm";
  const sources = "sources" in settings && Array.isArray(settings.sources) ? settings.sources : [];
  const source: unknown = sources.find(
    (entry: unknown) =>
      typeof entry === "object" && entry !== null && "name" in entry && entry.name === name,
  );
  const endpoint =
    typeof source === "object" &&
    source !== null &&
    "location" in source &&
    typeof source.location === "string"
      ? source.location
      : "https://registry.agentxm.ai/";
  return path.join(workspace, registryFixturePath(endpoint, ...published));
};
