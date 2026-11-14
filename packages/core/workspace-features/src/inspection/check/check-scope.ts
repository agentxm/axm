import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { DesiredStateGraph } from "@agentxm/workspace-kernel/workspace-state";

export interface CheckSubject {
  readonly type: ExtensionType;
  readonly name: string;
}

/** Owners supply semantic units, not physical containers or path prefixes. */
export interface CheckContributorUnit {
  readonly id: string;
  readonly contributors: ReadonlyArray<CheckSubject>;
  readonly complete: boolean;
}

interface CheckScopeEntry extends CheckSubject {
  readonly requested: boolean;
  readonly includedBy: ReadonlyArray<{
    readonly kind: "pack-member" | "shared-output" | "shared-package";
    readonly source: string;
  }>;
}

export interface CheckScope {
  readonly subjects: ReadonlyArray<CheckScopeEntry>;
  readonly units: ReadonlyArray<string>;
  readonly incomplete: ReadonlyArray<{ readonly source: string; readonly reason: string }>;
}

const subjectKey = (subject: CheckSubject) => `${subject.type}:${subject.name}`;

/** Expand from authoritative membership and unit contributors until the set is closed. */
export const expandCheckScope = (args: {
  readonly selected: ReadonlyArray<CheckSubject>;
  readonly graph: DesiredStateGraph;
  readonly units: ReadonlyArray<CheckContributorUnit>;
}): CheckScope => {
  const subjects = new Map<string, CheckScopeEntry>();
  const units = new Set<string>();
  const incomplete = new Map<string, { readonly source: string; readonly reason: string }>();
  const include = (
    subject: CheckSubject,
    requested: boolean,
    inclusion?: CheckScopeEntry["includedBy"][number],
  ) => {
    const key = subjectKey(subject);
    const previous = subjects.get(key);
    const includedBy = [...(previous?.includedBy ?? [])];
    if (
      inclusion !== undefined &&
      !includedBy.some(
        (reason) => reason.kind === inclusion.kind && reason.source === inclusion.source,
      )
    )
      includedBy.push(inclusion);
    subjects.set(key, {
      ...subject,
      requested: requested || previous?.requested === true,
      includedBy,
    });
  };
  for (const subject of args.selected) include(subject, true);

  let previousSize = -1;
  while (previousSize !== subjects.size) {
    previousSize = subjects.size;
    for (const subject of subjects.values()) {
      if (
        subject.type === "pack" &&
        !args.graph.packMembership.some((membership) => membership.settingsName === subject.name)
      ) {
        const key = subjectKey(subject);
        incomplete.set(key, { source: key, reason: "Pack membership was not observed" });
      }
    }
    for (const membership of args.graph.packMembership) {
      const key = subjectKey({ type: "pack", name: membership.settingsName });
      if (!subjects.has(key)) continue;
      if (membership.declared.status === "unknown") {
        incomplete.set(key, { source: key, reason: membership.declared.reason });
        continue;
      }
      if (membership.routes === "unknown" || membership.routes === "unauthorized") {
        incomplete.set(key, { source: key, reason: membership.routes });
      }
      // Dormant members still belong to the selected pack's declared assessment scope.
      for (const member of membership.declared.members) {
        include(member, false, { kind: "pack-member", source: key });
      }
    }
    for (const closure of args.graph.mcpSourceClosures) {
      if (
        !closure.localNames.some((name) => subjects.has(subjectKey({ type: "mcp-server", name })))
      )
        continue;
      for (const name of closure.localNames) {
        include({ type: "mcp-server", name }, false, {
          kind: "shared-package",
          source: closure.key,
        });
      }
    }
    for (const unit of args.units) {
      if (!unit.contributors.some((subject) => subjects.has(subjectKey(subject)))) continue;
      units.add(unit.id);
      if (!unit.complete) {
        incomplete.set(`unit:${unit.id}`, {
          source: unit.id,
          reason: "Shared-output contributor evidence is incomplete",
        });
      }
      for (const contributor of unit.contributors) {
        include(contributor, false, { kind: "shared-output", source: unit.id });
      }
    }
  }
  return {
    subjects: [...subjects.values()],
    units: [...units],
    incomplete: [...incomplete.values()],
  };
};
