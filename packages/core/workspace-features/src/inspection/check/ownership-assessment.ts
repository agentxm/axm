import type { LocalInspectionDocument } from "../show/local-inspection-document.js";
import type { CheckAssessment } from "./check-assessment.js";

/** Ownership conclusions consume the inspection owner's evidence, never path or byte guesses. */
export const assessCheckOwnership = (args: {
  readonly inspection: LocalInspectionDocument;
  readonly phase: string;
}): CheckAssessment => {
  const { inspection } = args;
  const reasons = new Set<string>();
  let attention = false;
  for (const request of inspection.requests) {
    if (request.resolution !== "resolved") {
      reasons.add(request.reason ?? `Ownership request ${request.id} did not resolve`);
    }
  }
  // Inventory-wide diagnostics remain visible in the captured document. A
  // scoped ownership answer is decided from its own native and editing facts;
  // unrelated discovery warnings cannot invalidate established ownership.
  // Changed reads do invalidate the phase that supplied those facts.
  const selectedPaths = [
    ...inspection.items.flatMap((item) => [item.observed.path, item.editing.address?.path]),
    ...inspection.nativeLocations.map((location) => location.address.path),
    ...inspection.requests
      .filter((request) => request.kind === "path")
      .map((request) => request.input),
  ]
    .filter((path): path is string => path !== undefined)
    .map((path) => path.replaceAll("\\", "/").replace(/\/$/, ""));
  for (const diagnostic of inspection.observationDiagnostics) {
    const diagnosticPath = diagnostic.path?.replaceAll("\\", "/").replace(/\/$/, "");
    const unreadableSelection =
      (diagnostic.code === "scanner-io" ||
        diagnostic.code === "scanner-parse" ||
        (diagnostic.code === "scanner-config" && diagnosticPath !== undefined)) &&
      (diagnosticPath === undefined ||
        selectedPaths.some(
          (path) =>
            path === diagnosticPath ||
            path.startsWith(`${diagnosticPath}/`) ||
            diagnosticPath.startsWith(`${path}/`),
        ));
    if (
      // Catalog configuration advisories (for example two runtimes naming
      // the same root) are not failed observations. Required native coverage
      // and actual ownership collisions are assessed from the items below.
      ((diagnostic.code !== "scanner-config" || diagnosticPath !== undefined) &&
        inspection.requests.some((request) => request.kind === "all")) ||
      diagnostic.code === "inspection-read-changed" ||
      unreadableSelection
    ) {
      reasons.add(diagnostic.message);
    }
  }
  for (const item of inspection.items) {
    if (item.editing.kind === "unknown" || item.editing.kind === "unavailable") {
      reasons.add(item.editing.reason);
    }
    if (
      item.nativeCoverage.state !== "complete" &&
      item.nativeCoverage.state !== "not-applicable"
    ) {
      for (const reason of item.nativeCoverage.reasons) reasons.add(reason);
      if (item.nativeCoverage.reasons.length === 0) {
        reasons.add(`Native ownership evidence is incomplete for ${item.id}`);
      }
    }
    for (const ref of item.nativeLocationRefs) {
      const location = inspection.nativeLocations.find((record) => record.id === ref);
      if (location === undefined) {
        reasons.add(`Ownership evidence ${ref} is unavailable`);
        continue;
      }
      if (location.ownership === "unverified") {
        reasons.add(location.reason ?? `Ownership is unverified for ${location.address.path}`);
      }
      // Unowned content alone is not invalid. Only the owner-reported collision blocks.
      if (location.ownership === "unowned" && location.state === "blocked") attention = true;
    }
  }
  return {
    kind: "ownership",
    phase: args.phase,
    subjectRefs: inspection.items.map(({ id }) => id),
    coverage:
      reasons.size === 0 ? { state: "complete" } : { state: "incomplete", reasons: [...reasons] },
    findingRefs: [],
    conclusion: attention ? "attention-required" : reasons.size === 0 ? "satisfied" : "unknown",
  };
};
