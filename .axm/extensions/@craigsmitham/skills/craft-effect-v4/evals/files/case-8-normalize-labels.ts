export const normalizeLabels = (labels: ReadonlyArray<string>) =>
  [...new Set(labels.map((label) => label.trim().toLowerCase()))].sort();
