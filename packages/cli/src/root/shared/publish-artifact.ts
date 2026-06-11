import type { JobStepArtifact, JobStepResult } from "@agentxm/client-core/unstable/plan";

export const publishArtifact = (args: {
  readonly path: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepArtifact => ({
  path: args.path,
  scope: args.scope,
  version: args.version,
  change: "created",
  targets: [{ path: args.path, change: "created" }],
});

export const withPublishArtifact = (args: {
  readonly result: JobStepResult;
  readonly fqn: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepResult => {
  if (args.result.result === "error") return args.result;

  const publishedPath = args.result.links?.html ?? `${args.fqn}@${args.version}`;
  return {
    ...args.result,
    artifact: publishArtifact({
      path: publishedPath,
      scope: args.scope,
      version: args.version,
    }),
  } satisfies JobStepResult;
};
