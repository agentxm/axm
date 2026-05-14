package ai.agentxm.examples.pawmatch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ai.agentxm.examples.tinyflags.EvaluationContext;
import java.io.PrintWriter;
import java.io.StringWriter;
import org.junit.jupiter.api.Test;

class PawMatchCliTest {

    @Test
    void feesExitsZero() {
        StringWriter outBuffer = new StringWriter();
        StringWriter errBuffer = new StringWriter();
        PawMatchCli cli = new PawMatchCli(
                Flags.create(),
                EvaluationContext.ofSession("test-user"),
                new PrintWriter(outBuffer, true),
                new PrintWriter(errBuffer, true));

        int exitCode = cli.run(new String[] {"fees"});

        assertEquals(0, exitCode, "stderr: " + errBuffer);
        assertTrue(outBuffer.toString().contains("Adoption fees"));
    }

    @Test
    void unknownCommandExitsOne() {
        StringWriter outBuffer = new StringWriter();
        StringWriter errBuffer = new StringWriter();
        PawMatchCli cli = new PawMatchCli(
                Flags.create(),
                EvaluationContext.ofSession("test-user"),
                new PrintWriter(outBuffer, true),
                new PrintWriter(errBuffer, true));

        int exitCode = cli.run(new String[] {"not-a-command"});

        assertEquals(1, exitCode);
        assertTrue(errBuffer.toString().contains("Unknown command"));
    }
}
