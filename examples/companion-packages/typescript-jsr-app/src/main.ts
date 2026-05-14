import { PawMatchCli } from "./cli.ts";

if (import.meta.main) {
  const cli = new PawMatchCli();
  const code = cli.run(Deno.args);
  Deno.exit(code);
}
