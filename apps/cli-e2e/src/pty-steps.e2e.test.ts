import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";

import { Keys } from "./pty.js";
import { parseSteps } from "./pty-steps.js";

describe("parseSteps", () => {
  it("reads waits, repeated keys, typed text, and a resize in order", () => {
    expect(parseSteps("await:type to filter,down*2,space,type:ab,size:80x24")).toEqual(
      Result.succeed([
        { awaiting: "type to filter" },
        { send: Keys.down },
        { send: Keys.down },
        { send: Keys.space },
        { send: "a" },
        { send: "b" },
        { resize: { columns: 80, rows: 24 } },
      ]),
    );
  });

  it("reads an empty script as no steps", () => {
    expect(parseSteps("")).toEqual(Result.succeed([]));
  });

  it("names the first step it cannot read", () => {
    const unknown = parseSteps("down,sideways");
    expect(Result.isFailure(unknown) && unknown.failure).toContain('Unknown step "sideways"');
    const repeat = parseSteps("down*many");
    expect(Result.isFailure(repeat) && repeat.failure).toContain("down*3");
    const size = parseSteps("size:80");
    expect(Result.isFailure(size) && size.failure).toContain("size:80x24");
  });
});
