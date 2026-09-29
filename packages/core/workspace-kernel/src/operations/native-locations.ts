/** Native facts follow the settlement of the unit that observed them. */
import { combineNativeLocationOutcomes, type NativeLocationOutcome } from "../locations/index.js";
import type { OperationResolution, ResolvedUnit } from "./operation-resolution.js";

export const settledUnitNativeLocations = (
  unit: ResolvedUnit<unknown>,
  mode: OperationResolution<unknown>["mode"],
): ReadonlyArray<NativeLocationOutcome> =>
  (unit.artifact?.nativeLocations ?? []).map((location) => {
    if (
      unit.state === "committed" ||
      (mode === "preview" && (unit.state === "planned" || unit.state === "ready"))
    )
      return location;
    if (unit.state === "unchanged")
      return {
        ...location,
        state:
          location.state === "created" ||
          location.state === "updated" ||
          location.state === "removed"
            ? "unchanged"
            : location.state,
      };
    return {
      ...location,
      state: unit.state === "blocked" ? "blocked" : "unverified",
      ownership: "unverified",
      availability: location.availability.map((availability) => ({
        ...availability,
        state: "unverified",
        reason: "Native availability requires observation after the operation stopped",
      })),
      reason: unit.message ?? `Native result requires observation after unit ${unit.state}`,
    };
  });

export const operationNativeLocations = (
  resolution: OperationResolution<unknown>,
): ReadonlyArray<NativeLocationOutcome> =>
  combineNativeLocationOutcomes(
    resolution.units.flatMap((unit) => settledUnitNativeLocations(unit, resolution.mode)),
  );
