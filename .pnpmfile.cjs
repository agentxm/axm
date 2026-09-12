const orderedManifest = (value, conditions = false) => {
  if (Array.isArray(value)) return value.map((child) => orderedManifest(child, conditions));
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (!conditions) entries.sort(([left], [right]) => left.localeCompare(right, "en"));
    return Object.fromEntries(
      entries
        .filter(([key]) => !conditions || key !== "axm-source")
        .map(([key, child]) => [
          key,
          orderedManifest(child, conditions || key === "exports" || key === "imports"),
        ]),
    );
  }
  return value;
};

module.exports = {
  hooks: {
    // pnpm has resolved dependency references here. Normalize unordered metadata
    // while preserving conditional-export precedence and omitting workspace-only
    // source conditions whose targets do not ship in the compiled package.
    beforePacking: (manifest) => orderedManifest(manifest),
  },
};
