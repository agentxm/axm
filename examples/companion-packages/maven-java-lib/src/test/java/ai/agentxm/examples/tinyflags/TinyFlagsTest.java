package ai.agentxm.examples.tinyflags;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class TinyFlagsTest {

    private static final EvaluationContext CONTEXT = EvaluationContext.ofUser("user-1");

    @Nested
    @DisplayName("boolean flags")
    class BooleanFlags {

        @Test
        @DisplayName("use defaults when no rollout is configured")
        void useDefaultsWhenNoRollout() {
            TinyFlags flags = TinyFlags.builder()
                    .booleanFlag("checkoutRedesign", true)
                    .build();

            assertTrue(flags.enabled("checkoutRedesign", CONTEXT));
        }

        @Test
        @DisplayName("rollout boundaries are deterministic")
        void rolloutBoundariesDeterministic() {
            TinyFlags flags = TinyFlags.builder()
                    .booleanFlag("disabledExperiment", false, 0)
                    .booleanFlag("enabledExperiment", false, 100)
                    .build();

            assertFalse(flags.enabled("disabledExperiment", CONTEXT));
            assertTrue(flags.enabled("enabledExperiment", CONTEXT));
            assertEquals(
                    flags.enabled("enabledExperiment", CONTEXT),
                    flags.enabled("enabledExperiment", CONTEXT));
        }

        @Test
        @DisplayName("50% rollout is stable per context")
        void halfRolloutStable() {
            TinyFlags flags = TinyFlags.builder()
                    .booleanFlag("midRollout", false, 50)
                    .build();

            boolean first = flags.enabled("midRollout", CONTEXT);
            boolean second = flags.enabled("midRollout", CONTEXT);
            assertEquals(first, second);
        }
    }

    @Nested
    @DisplayName("variant flags")
    class VariantFlags {

        @Test
        @DisplayName("return defaults outside rollout allocations")
        void returnDefaultsOutsideAllocations() {
            Map<String, Integer> rollout = new LinkedHashMap<>();
            rollout.put("semantic", 0);
            TinyFlags flags = TinyFlags.builder()
                    .variantFlag("searchRanking", List.of("classic", "semantic"), "classic", rollout)
                    .build();

            assertEquals("classic", flags.variant("searchRanking", CONTEXT));
        }

        @Test
        @DisplayName("can allocate all traffic to a variant")
        void canAllocateAllTraffic() {
            Map<String, Integer> rollout = new LinkedHashMap<>();
            rollout.put("semantic", 100);
            TinyFlags flags = TinyFlags.builder()
                    .variantFlag("searchRanking", List.of("classic", "semantic"), "classic", rollout)
                    .build();

            assertEquals("semantic", flags.variant("searchRanking", CONTEXT));
        }
    }

    @Nested
    @DisplayName("evaluate")
    class Evaluate {

        @Test
        @DisplayName("returns BoolValue for a boolean flag")
        void returnsBoolValue() {
            TinyFlags flags = TinyFlags.builder()
                    .booleanFlag("checkoutRedesign", true)
                    .build();

            assertEquals(
                    new FlagValue.BoolValue(true),
                    flags.evaluate("checkoutRedesign", CONTEXT));
        }

        @Test
        @DisplayName("returns VariantValue for a variant flag")
        void returnsVariantValue() {
            Map<String, Integer> rollout = new LinkedHashMap<>();
            rollout.put("semantic", 100);
            TinyFlags flags = TinyFlags.builder()
                    .variantFlag("searchRanking", List.of("classic", "semantic"), "classic", rollout)
                    .build();

            assertEquals(
                    new FlagValue.VariantValue("semantic"),
                    flags.evaluate("searchRanking", CONTEXT));
        }
    }

    @Nested
    @DisplayName("validation")
    class Validation {

        @Test
        @DisplayName("boolean rollout above 100 fails at construction time")
        void booleanRolloutAbove100Fails() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> Flag.booleanFlag(false, 101));
        }

        @Test
        @DisplayName("variant default must be one of the variants")
        void variantDefaultMustBeListed() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> Flag.variantFlag(List.of("classic", "semantic"), "personalized"));
        }

        @Test
        @DisplayName("variant rollout totals above 100 fail at construction time")
        void variantRolloutTotalAbove100Fails() {
            Map<String, Integer> rollout = new LinkedHashMap<>();
            rollout.put("semantic", 80);
            rollout.put("classic", 30);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> Flag.variantFlag(List.of("classic", "semantic"), "classic", rollout));
        }

        @Test
        @DisplayName("variant rollout cannot reference unknown variants")
        void variantRolloutUnknownVariant() {
            Map<String, Integer> rollout = new LinkedHashMap<>();
            rollout.put("personalized", 10);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> Flag.variantFlag(List.of("classic", "semantic"), "classic", rollout));
        }
    }
}
