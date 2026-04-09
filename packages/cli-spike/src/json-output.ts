import * as ServiceMap from "effect/ServiceMap";

export const JsonOutputSupported: ServiceMap.Reference<boolean> = ServiceMap.Reference(
  "axm-spike/json-output-supported",
  {
    defaultValue: () => false,
  },
);
