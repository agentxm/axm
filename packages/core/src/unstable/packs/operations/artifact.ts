import type { Handle } from "../../extensions/index.js";
import type { JobStepArtifact, JobStepArtifactTarget } from "../../plan/plan.js";
import { PACK_MANIFEST_FILENAME } from "../manifest-schema.js";

export const packManifestPath = (
  scope: JobStepArtifact["scope"],
  owner: Handle,
  name: string,
): string =>
  scope === "project"
    ? `packs/${name}/${PACK_MANIFEST_FILENAME}`
    : `.axm/workspace/agent_extensions/${owner}/packs/${name}/${PACK_MANIFEST_FILENAME}`;

export const packManifestTarget = (
  scope: JobStepArtifact["scope"],
  owner: Handle,
  name: string,
  change: JobStepArtifactTarget["change"],
): JobStepArtifactTarget => ({
  path: packManifestPath(scope, owner, name),
  change,
});

export const packManifestArtifact = (args: {
  readonly owner: Handle;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly version?: string;
  readonly fileCount?: number;
}): JobStepArtifact => ({
  path: packManifestPath(args.scope, args.owner, args.name),
  scope: args.scope,
  change: args.change,
  ...(args.version === undefined ? {} : { version: args.version }),
  ...(args.fileCount === undefined ? {} : { fileCount: args.fileCount }),
  targets: [packManifestTarget(args.scope, args.owner, args.name, args.change)],
});
