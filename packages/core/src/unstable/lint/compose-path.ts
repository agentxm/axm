/**
 * `composePath` — render a display path from a rule context's `displayRoot`
 * and a finding's accessor-relative `location.file`.
 *
 * Rules emit accessor-relative `location.file` values only; messages carry no
 * paths or coordinates. The format-time composition here lets the same rule
 * render different paths for publish (`displayRoot: ""`), registry-installed
 * skills, external skills, and workspace-scope findings.
 *
 * The rendered path is posix, prefixed with `./` so logs are unambiguous
 * about relative-ness. `location.line` / `location.column` append as
 * `:line:column` when present.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FindingLocation } from "./rule.js";

// -----------------------------------------------------------------------------
// composePath
// -----------------------------------------------------------------------------

/**
 * Compose the rendered path for a finding.
 *
 * @param displayRoot - Context-supplied posix-relative root (or `""`).
 * @param location    - Accessor-relative file + optional coordinates.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const composePath = (displayRoot: string, location: FindingLocation | undefined): string => {
  const base = joinPosix(displayRoot, location?.file ?? "");
  const withPrefix = base === "" ? "." : base.startsWith("./") ? base : `./${base}`;
  if (location === undefined) {
    return withPrefix;
  }
  return appendCoordinates(withPrefix, location);
};

const joinPosix = (left: string, right: string): string => {
  const l = stripTrailingSlash(left);
  const r = stripLeadingSlash(right);
  if (l === "" && r === "") {
    return "";
  }
  if (l === "") {
    return r;
  }
  if (r === "") {
    return l;
  }
  return `${l}/${r}`;
};

const stripTrailingSlash = (s: string): string => (s.endsWith("/") ? s.slice(0, -1) : s);
const stripLeadingSlash = (s: string): string => (s.startsWith("/") ? s.slice(1) : s);

const appendCoordinates = (path: string, location: FindingLocation): string => {
  if (location.line === undefined) {
    return path;
  }
  if (location.column === undefined) {
    return `${path}:${location.line}`;
  }
  return `${path}:${location.line}:${location.column}`;
};
