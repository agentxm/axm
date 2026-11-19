import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";

/** The last segment of a project root, as a title line names the project. */
export const projectDirectoryName = (baseDir: string): string | undefined => {
  const name = baseDir
    .replace(/[/\\]+$/u, "")
    .split(/[/\\]/u)
    .at(-1);
  return name === undefined || name.length === 0 ? undefined : name;
};

/**
 * The project a command acts in, by its directory's name, so a reader with
 * several checkouts open sees which one a title line means. Absent for the
 * user workspace and where no workspace is in context.
 */
export const currentProjectName: Effect.Effect<string | undefined> = Effect.map(
  Effect.serviceOption(WorkspaceLocation),
  Option.match({
    onNone: () => undefined,
    onSome: (location) =>
      location.scope === "project" ? projectDirectoryName(location.baseDir) : undefined,
  }),
);
