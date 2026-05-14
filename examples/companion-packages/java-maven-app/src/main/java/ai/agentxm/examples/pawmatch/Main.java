package ai.agentxm.examples.pawmatch;

/** Entry point for the {@code pawmatch} CLI. */
public final class Main {

    private Main() {}

    public static void main(String[] args) {
        int exitCode = new PawMatchCli().run(args);
        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }
}
