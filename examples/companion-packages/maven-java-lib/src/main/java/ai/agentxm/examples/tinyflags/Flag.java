package ai.agentxm.examples.tinyflags;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Smart constructors for {@link FlagDefinition} that validate inputs.
 *
 * <p>Boolean rollouts must be an integer percentage from 0 to 100. Variant
 * rollouts must reference only declared variants and the sum of allocations
 * must not exceed 100.
 */
public final class Flag {

    private Flag() {}

    /** Define a boolean feature flag with the given default. */
    public static FlagDefinition.Bool booleanFlag(boolean defaultValue) {
        return new FlagDefinition.Bool(defaultValue, Optional.empty());
    }

    /**
     * Define a boolean feature flag with the given default and an
     * enabled-rollout percentage (0-100).
     */
    public static FlagDefinition.Bool booleanFlag(boolean defaultValue, int rollout) {
        return new FlagDefinition.Bool(defaultValue, Optional.of(validatePercentage("rollout", rollout)));
    }

    /**
     * Define a multi-variant feature flag. The default value defaults to the
     * first variant.
     */
    public static FlagDefinition.Variant variantFlag(List<String> variants) {
        return variantFlag(variants, firstOrThrow(variants));
    }

    /** Define a multi-variant feature flag with an explicit default value. */
    public static FlagDefinition.Variant variantFlag(List<String> variants, String defaultValue) {
        List<String> unique = uniqueOrThrow(variants);
        if (!unique.contains(defaultValue)) {
            throw new IllegalArgumentException(
                    "Variant default '" + defaultValue + "' is not one of the variants.");
        }
        return new FlagDefinition.Variant(unique, defaultValue, Optional.empty());
    }

    /**
     * Define a multi-variant feature flag with a default value and a per-variant
     * rollout allocation.
     */
    public static FlagDefinition.Variant variantFlag(
            List<String> variants, String defaultValue, Map<String, Integer> rollout) {
        List<String> unique = uniqueOrThrow(variants);
        if (!unique.contains(defaultValue)) {
            throw new IllegalArgumentException(
                    "Variant default '" + defaultValue + "' is not one of the variants.");
        }
        Map<String, Integer> normalized = normalizeRollout(unique, rollout);
        return new FlagDefinition.Variant(unique, defaultValue, Optional.of(normalized));
    }

    private static int validatePercentage(String label, int percentage) {
        if (percentage < 0 || percentage > 100) {
            throw new IllegalArgumentException(
                    label + " must be from 0 to 100; received " + percentage + ".");
        }
        return percentage;
    }

    private static String firstOrThrow(List<String> variants) {
        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException("Variant flags require at least one variant.");
        }
        return variants.get(0);
    }

    private static List<String> uniqueOrThrow(List<String> variants) {
        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException("Variant flags require at least one variant.");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String variant : variants) {
            if (variant == null || variant.isEmpty()) {
                throw new IllegalArgumentException("Variant names must be unique non-empty strings.");
            }
            if (!seen.add(variant)) {
                throw new IllegalArgumentException("Variant names must be unique non-empty strings.");
            }
        }
        return List.copyOf(seen);
    }

    private static Map<String, Integer> normalizeRollout(
            List<String> variants, Map<String, Integer> rollout) {
        if (rollout == null) {
            throw new IllegalArgumentException("Variant rollout must not be null.");
        }
        Set<String> known = Set.copyOf(variants);
        Map<String, Integer> normalized = new LinkedHashMap<>();
        int total = 0;
        for (Map.Entry<String, Integer> entry : rollout.entrySet()) {
            String variant = entry.getKey();
            if (!known.contains(variant)) {
                throw new IllegalArgumentException(
                        "Rollout references unknown variant: " + variant + ".");
            }
            int validated = validatePercentage("rollout for '" + variant + "'", entry.getValue());
            normalized.put(variant, validated);
            total += validated;
        }
        if (total > 100) {
            throw new IllegalArgumentException(
                    "Variant rollout percentages cannot exceed 100; received " + total + ".");
        }
        return Map.copyOf(normalized);
    }
}
