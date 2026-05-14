import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

import { PawMatchCli } from "../src/cli.ts";

function captureCli(): { cli: PawMatchCli; readStdout: () => string; readStderr: () => string } {
  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  const out = {
    write(chunk: Uint8Array): number {
      stdoutChunks.push(chunk);
      return chunk.length;
    },
  };
  const err = {
    write(chunk: Uint8Array): number {
      stderrChunks.push(chunk);
      return chunk.length;
    },
  };
  const decoder = new TextDecoder();
  const cli = new PawMatchCli({
    out,
    err,
    context: { sessionId: "test-session" },
    openUrl: () => 0,
  });
  return {
    cli,
    readStdout: () => stdoutChunks.map((c) => decoder.decode(c)).join(""),
    readStderr: () => stderrChunks.map((c) => decoder.decode(c)).join(""),
  };
}

Deno.test("pawmatch fees exits 0 and mentions adoption fees", () => {
  const { cli, readStdout } = captureCli();
  const code = cli.run(["fees"]);
  assertEquals(code, 0);
  assertStringIncludes(readStdout(), "Adoption fees");
});

Deno.test("pawmatch show with unknown pet exits 1", () => {
  const { cli, readStderr } = captureCli();
  const code = cli.run(["show", "no-such-pet"]);
  assertEquals(code, 1);
  assertStringIncludes(readStderr(), "Unknown pet");
});
