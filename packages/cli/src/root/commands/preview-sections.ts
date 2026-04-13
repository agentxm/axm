import type { PlanSection } from "@agentxm/client-core/unstable/workspace";

interface PathEntry {
  readonly path: string;
}

const makeSection = (title: string, items: ReadonlyArray<string>): ReadonlyArray<PlanSection> =>
  items.length === 0 ? [] : [{ title, items }];

export const combinePlanSections = (
  ...groups: ReadonlyArray<ReadonlyArray<PlanSection>>
): ReadonlyArray<PlanSection> | undefined => {
  const sections = groups.flatMap((group) => [...group]);
  return sections.length === 0 ? undefined : sections;
};

export const makeItemSection = (title: string, items: ReadonlyArray<string>) =>
  makeSection(title, items);

export const makeAgentSection = (
  title: string,
  agents: ReadonlyArray<string>,
  emptyMessage?: string,
) =>
  agents.length > 0
    ? makeSection(title, agents)
    : emptyMessage === undefined
      ? []
      : makeSection(title, [emptyMessage]);

export const makeGroupedSection = (
  title: string,
  groups: Readonly<Record<string, ReadonlyArray<string>>>,
) => {
  const items = Object.entries(groups).flatMap(([group, entries]) => {
    if (entries.length === 0) {
      return [];
    }

    return [`${group}:\n${entries.map((entry) => `    - ${entry}`).join("\n")}`];
  });

  return makeSection(title, items);
};

export const makeRenderedFilesSection = (
  title: string,
  filesByAgent: Readonly<Record<string, ReadonlyArray<PathEntry>>>,
) =>
  makeGroupedSection(
    title,
    Object.fromEntries(
      Object.entries(filesByAgent).map(([agentId, files]) => [
        agentId,
        files.map((file) => file.path),
      ]),
    ),
  );
