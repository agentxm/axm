import { createHash } from "node:crypto";
import * as path from "node:path";

import type { BenchmarkReceipt } from "./model.js";

/** Separate reports retain separate evidence; resuming the same report keeps stable paths. */
export const scenarioEvidencePaths = (
  reportPath: string,
  scenarioId: string,
  subject: BenchmarkReceipt["subject"],
) => {
  const directory = `${path.basename(reportPath)}.evidence`;
  const name = `${createHash("sha256").update(scenarioId).digest("hex").slice(0, 20)}-${subject}`;
  return {
    receipt: path.join(directory, "receipts", `${name}.json`),
    trace: path.join(directory, "traces", `${name}.txt`),
  };
};
