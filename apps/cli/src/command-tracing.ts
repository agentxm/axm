import type { OperationMode } from "@agentxm/workspace-kernel/operations";
import type { Command } from "effect/cli";
import * as Option from "effect/Option";
import { booleanOptionFromArgv } from "./cli-flags/argv-boolean.js";
import { registeredCommandCapabilities } from "./root/shared/command-capabilities.js";

/** Build the admission vocabulary from the same tree that dispatches commands. */
export const makeCommandTraceIdentity = (root: Command.Command.Any) => {
  const routes = new Map(
    registeredCommandCapabilities(root).map(({ path, capabilities }) => [
      path.join(" ") || "root",
      capabilities,
    ]),
  );
  return {
    routes: [...routes.keys(), "unresolved"],
    resolve: (path: ReadonlyArray<string>, argv: ReadonlyArray<string>) => {
      const candidate = path.join(" ") || "root";
      const capabilities = routes.get(candidate);
      const route = routes.has(candidate) ? candidate : "unresolved";
      const flagEnabled = (name: string) =>
        Option.getOrElse(booleanOptionFromArgv(argv, [name]), () => false);
      const builtIn = flagEnabled("--help") || flagEnabled("-h") || flagEnabled("--version");
      const effect =
        capabilities?.modes?.find((mode) => flagEnabled(mode.flag))?.effect ??
        capabilities?.effect ??
        "none";
      const mode: OperationMode = builtIn
        ? "query"
        : capabilities?.preview && flagEnabled("--preview")
          ? "preview"
          : effect === "none"
            ? "query"
            : "apply";
      return { "axm.command.route": route, "axm.operation.mode": mode };
    },
  };
};
