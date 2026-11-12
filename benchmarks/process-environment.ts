import * as path from "node:path";

/**
 * One explicit environment for benchmark children and fixture preparation.
 * HOME/XDG isolate user state; Git must also ignore system configuration and
 * receive no ambient repository, index, helper, hook, or command-config selectors.
 * Callers add only their deliberate fixture inputs to this result.
 */
export const benchmarkProcessEnvironment = (
  home: string,
  inherited: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> => {
  const systemRoot = inherited["SystemRoot"] ?? inherited["SYSTEMROOT"];
  const commandShell = inherited["ComSpec"] ?? inherited["COMSPEC"];
  const executableExtensions = inherited["PATHEXT"];
  return {
    PATH: inherited["PATH"] ?? "",
    ...(systemRoot === undefined ? {} : { SystemRoot: systemRoot }),
    ...(commandShell === undefined ? {} : { ComSpec: commandShell }),
    ...(executableExtensions === undefined ? {} : { PATHEXT: executableExtensions }),
    HOME: home,
    USERPROFILE: home,
    AXM_USER_HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    AXM_NO_UPDATE_CHECK: "1",
    AXM_TELEMETRY: "0",
    CI: "1",
    NO_COLOR: "1",
    TERM: "dumb",
  };
};
