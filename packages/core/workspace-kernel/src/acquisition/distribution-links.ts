export interface DistributionLinkEntry {
  readonly path: string;
  readonly included: boolean;
  readonly linkTarget?: string;
}

export type DistributionLinkProblem =
  | { readonly kind: "excluded-target"; readonly path: string; readonly target: string }
  | { readonly kind: "resolution-limit"; readonly path: string };

/** Identify links made dangling by selection, while preserving pre-existing cycles. */
export const excludedDistributionLinkTarget = (
  entries: ReadonlyArray<DistributionLinkEntry>,
): DistributionLinkProblem | undefined => {
  const all = new Set<string>();
  const selected = new Set<string>();
  const links = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.path.replace(/\/$/, "");
    const parts = name.split("/");
    for (let index = 1; index <= parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      all.add(parent);
      if (entry.included) selected.add(parent);
    }
    if (entry.linkTarget !== undefined) links.set(name, entry.linkTarget);
  }
  // Match the shared archive admission budget, including repeated graph expansions.
  let remainingSteps = 1_000_000;
  for (const entry of entries) {
    if (!entry.included || entry.linkTarget === undefined) continue;
    const resolved = entry.path.split("/").slice(0, -1);
    const active = new Set([entry.path]);
    const pending: Array<string | { readonly leave: string }> = entry.linkTarget
      .split("/")
      .reverse();
    while (pending.length > 0) {
      if (--remainingSteps < 0) return { kind: "resolution-limit", path: entry.path };
      const segment = pending.pop();
      if (segment === undefined) break;
      if (typeof segment !== "string") {
        active.delete(segment.leave);
        continue;
      }
      if (segment === "" || segment === ".") continue;
      if (segment === "..") {
        resolved.pop();
        continue;
      }
      const next = [...resolved, segment].join("/");
      if (all.has(next) && !selected.has(next))
        return { kind: "excluded-target", path: entry.path, target: next };
      const target = links.get(next);
      if (target === undefined) {
        resolved.push(segment);
        continue;
      }
      if (active.has(next)) break;
      active.add(next);
      pending.push({ leave: next });
      pending.push(...target.split("/").reverse());
    }
  }
  return undefined;
};
