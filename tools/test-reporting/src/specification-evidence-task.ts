/** Nx owns prerequisite resolution; receipts only observe the resolved artifacts. */
import type { ProjectGraph, Target } from "@nx/devkit";
import { createTaskGraph } from "nx/src/tasks-runner/create-task-graph";

/**
 * The installed Nx task builder is isolated here because Devkit does not export
 * a public task-graph constructor. Its own resolved tasks include target
 * defaults, explicit and transitive dependencies, configurations, and outputs.
 * Contract tests exercise this adapter against the installed Nx version.
 */
export const resolveEvidenceRuntimeOutputs = (
  graph: ProjectGraph,
  target: Target,
): readonly string[] | undefined => {
  const project = graph.nodes[target.project];
  const configured = project?.data.targets?.[target.target];
  if (
    configured === undefined ||
    (target.configuration !== undefined &&
      configured.configurations?.[target.configuration] === undefined)
  )
    return undefined;

  const tasks = createTaskGraph(
    graph,
    {},
    [target.project],
    [target.target],
    target.configuration,
    {},
  );
  const outputs = Object.values(tasks.tasks).flatMap((task) =>
    task.target.project === target.project && task.target.target === target.target
      ? []
      : task.outputs,
  );
  return [...new Set(outputs)].sort();
};
