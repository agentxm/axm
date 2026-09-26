import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

import { sourceRefContentKey } from "./acquired-content.js";

/** Accommodates the 200-extension scale fixture with room for source fan-out. */
export const MAX_QUEUED_ACQUISITIONS = 256;

export type AcquisitionQueueSelection =
  | { readonly type: "ready"; readonly refs: ReadonlyArray<ExtensionRef> }
  | { readonly type: "limit"; readonly limit: number };

/** Stop planning intake as soon as the number of distinct external sources exceeds the cap. */
export const selectAcquisitionQueue = (refs: Iterable<ExtensionRef>): AcquisitionQueueSelection => {
  const seen = new Set<string>();
  const selected: Array<ExtensionRef> = [];
  for (const ref of refs) {
    if (ref.refType === "workspace") continue;
    const key = sourceRefContentKey(ref);
    if (seen.has(key)) continue;
    if (selected.length >= MAX_QUEUED_ACQUISITIONS) {
      return { type: "limit", limit: MAX_QUEUED_ACQUISITIONS };
    }
    seen.add(key);
    selected.push(ref);
  }
  return { type: "ready", refs: selected };
};
