package ai.agentxm.examples.pawmatch

/** Entry point for the `pawmatch` CLI. */
object Main:
  def main(args: Array[String]): Unit =
    val exitCode = PawMatchCli().run(args)
    if exitCode != 0 then System.exit(exitCode)
