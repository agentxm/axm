package ai.agentxm.examples.tinyflags;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A validated flag definition produced by {@link Flag#booleanFlag} or
 * {@link Flag#variantFlag}.
 */
public sealed interface FlagDefinition {

    /** A boolean feature flag with an optional 0-100 rollout percentage. */
    record Bool(boolean defaultValue, Optional<Integer> rollout) implements FlagDefinition {}

    /**
     * A multi-variant feature flag with allowed variants, a default value, and
     * an optional per-variant rollout allocation.
     */
    record Variant(
            List<String> variants,
            String defaultValue,
            Optional<Map<String, Integer>> rollout)
            implements FlagDefinition {}
}
