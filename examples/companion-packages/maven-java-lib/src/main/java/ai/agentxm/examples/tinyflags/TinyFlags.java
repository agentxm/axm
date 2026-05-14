package ai.agentxm.examples.tinyflags;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * A bundle of named feature flag definitions.
 *
 * <p>Build with {@link Builder} or {@link #builder()}. Evaluation is
 * deterministic: a given evaluation context always receives the same bucket
 * for a given flag name.
 */
public final class TinyFlags {

    private final Map<String, FlagDefinition> definitions;

    private TinyFlags(Map<String, FlagDefinition> definitions) {
        this.definitions = Map.copyOf(definitions);
    }

    /** Returns a new {@link Builder} for registering flag definitions. */
    public static Builder builder() {
        return new Builder();
    }

    /** Returns the definition for {@code name}, throwing if it is not registered. */
    public FlagDefinition definition(String name) {
        FlagDefinition definition = definitions.get(name);
        if (definition == null) {
            throw new NoSuchElementException("Unknown TinyFlags flag: " + name + ".");
        }
        return definition;
    }

    /** Returns an immutable view of all registered definitions. */
    public Map<String, FlagDefinition> definitions() {
        return definitions;
    }

    /**
     * Evaluate a boolean flag.
     *
     * @throws IllegalStateException if {@code name} is not a boolean flag.
     */
    public boolean enabled(String name, EvaluationContext context) {
        Objects.requireNonNull(context, "context");
        FlagDefinition definition = definition(name);
        if (!(definition instanceof FlagDefinition.Bool bool)) {
            throw new IllegalStateException("TinyFlags flag '" + name + "' is not a boolean flag.");
        }
        if (bool.rollout().isEmpty()) {
            return bool.defaultValue();
        }
        return bucketFor(name, context) < bool.rollout().get();
    }

    /**
     * Evaluate a variant flag.
     *
     * @throws IllegalStateException if {@code name} is not a variant flag.
     */
    public String variant(String name, EvaluationContext context) {
        Objects.requireNonNull(context, "context");
        FlagDefinition definition = definition(name);
        if (!(definition instanceof FlagDefinition.Variant variant)) {
            throw new IllegalStateException("TinyFlags flag '" + name + "' is not a variant flag.");
        }
        if (variant.rollout().isEmpty()) {
            return variant.defaultValue();
        }
        int bucket = bucketFor(name, context);
        int upperBound = 0;
        for (Map.Entry<String, Integer> entry : variant.rollout().get().entrySet()) {
            upperBound += entry.getValue();
            if (bucket < upperBound) {
                return entry.getKey();
            }
        }
        return variant.defaultValue();
    }

    /** Evaluate any flag, returning a typed {@link FlagValue}. */
    public FlagValue evaluate(String name, EvaluationContext context) {
        FlagDefinition definition = definition(name);
        if (definition instanceof FlagDefinition.Bool) {
            return new FlagValue.BoolValue(enabled(name, context));
        }
        return new FlagValue.VariantValue(variant(name, context));
    }

    private static int bucketFor(String name, EvaluationContext context) {
        String key = context.userId()
                .or(context::accountId)
                .or(context::sessionId)
                .orElse("anonymous");
        return Math.floorMod(fnv1a(name + ":" + key), 100);
    }

    private static int fnv1a(String value) {
        int hash = 0x811c9dc5;
        for (int i = 0; i < value.length(); i++) {
            hash ^= value.charAt(i);
            hash *= 0x01000193;
        }
        return hash;
    }

    /** Builder for {@link TinyFlags} bundles. */
    public static final class Builder {

        private final Map<String, FlagDefinition> definitions = new LinkedHashMap<>();

        /** Register a flag definition by name. */
        public Builder register(String name, FlagDefinition definition) {
            Objects.requireNonNull(name, "name");
            Objects.requireNonNull(definition, "definition");
            if (definitions.containsKey(name)) {
                throw new IllegalArgumentException("Duplicate flag definition: " + name + ".");
            }
            definitions.put(name, definition);
            return this;
        }

        /** Register a boolean flag with the given default. */
        public Builder booleanFlag(String name, boolean defaultValue) {
            return register(name, Flag.booleanFlag(defaultValue));
        }

        /** Register a boolean flag with the given default and rollout percentage. */
        public Builder booleanFlag(String name, boolean defaultValue, int rollout) {
            return register(name, Flag.booleanFlag(defaultValue, rollout));
        }

        /** Register a variant flag with allowed variants and an explicit default. */
        public Builder variantFlag(String name, java.util.List<String> variants, String defaultValue) {
            return register(name, Flag.variantFlag(variants, defaultValue));
        }

        /**
         * Register a variant flag with allowed variants, a default value, and a
         * per-variant rollout allocation.
         */
        public Builder variantFlag(
                String name,
                java.util.List<String> variants,
                String defaultValue,
                Map<String, Integer> rollout) {
            return register(name, Flag.variantFlag(variants, defaultValue, rollout));
        }

        /** Build the immutable flag bundle. */
        public TinyFlags build() {
            return new TinyFlags(definitions);
        }
    }
}
