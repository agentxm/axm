/**
 * Unit tests for platform login integration command selection.
 */

import { describe, expect, it } from "@effect/vitest";

import { browserCommands } from "./login-interaction.js";

describe("browserCommands", () => {
  it("uses rundll32 on Windows so OAuth query strings are passed as one URL", () => {
    const url = "https://agentxm.ai/oauth/authorize?response_type=code&client_id=axm-cli&state=abc";

    expect(browserCommands(url, "win32")).toEqual([
      {
        command: "rundll32",
        args: ["url.dll,FileProtocolHandler", url],
      },
    ]);
  });
});
