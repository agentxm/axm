const orderedManifest = (value) => {
  if (Array.isArray(value)) return value.map(orderedManifest);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, orderedManifest(child)]),
    );
  return value;
};

module.exports = {
  hooks: {
    // pnpm has already resolved workspace and catalog references here. Sorting
    // the final manifest makes the first pack publishable and reproducible.
    beforePacking: orderedManifest,
  },
};
