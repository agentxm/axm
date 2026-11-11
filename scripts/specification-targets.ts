/** Match a specification to an existing owner workflow before invoking Nx. */
export const specificationTarget = (
  targets: ReadonlyArray<string>,
  characteristic?: string,
): string => {
  if (characteristic === "performance" && targets.includes("test:performance"))
    return "test:performance";
  return ["test", "e2e-main", "e2e"].find((candidate) => targets.includes(candidate)) ?? "test";
};
