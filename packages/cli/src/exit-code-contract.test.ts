import { ExitCodeDefinitions } from "@agentxm/client-core/unstable/app-error";
import { describe, expect, it } from "vitest";

import { HELP_TOPICS } from "./__generated__/help-topics.js";

const parseExitCodeRows = (
  topic: string,
): ReadonlyArray<{
  readonly code: number;
  readonly meaning: string;
}> =>
  topic.split("\n").flatMap((line) => {
    const match = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|$/u.exec(line);
    if (match === null) return [];
    const code = Number(match[1]);
    const meaning = match[2];
    return Number.isInteger(code) && meaning !== undefined ? [{ code, meaning }] : [];
  });

describe("exit-code contract", () => {
  it("pins generated help to the canonical runtime wording", () => {
    expect(parseExitCodeRows(HELP_TOPICS["exit-codes"])).toEqual(ExitCodeDefinitions);
  });
});
