import { snapshotTree } from "@agentxm/test-support";

/** Protect every home byte except failure records and their otherwise empty container. */
export const snapshotHomeWithoutFailureRecords = (
  home: string,
): Readonly<Record<string, string>> => {
  const entries = Object.entries(snapshotTree(home)).filter(
    ([relative]) => relative !== ".axm/diagnostics" && !relative.startsWith(".axm/diagnostics/"),
  );
  const hasApplicationContent = entries.some(([relative]) => relative.startsWith(".axm/"));
  return Object.fromEntries(
    entries.filter(([relative]) => relative !== ".axm" || hasApplicationContent),
  );
};
