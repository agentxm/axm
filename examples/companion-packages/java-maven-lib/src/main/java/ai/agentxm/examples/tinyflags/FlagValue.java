package ai.agentxm.examples.tinyflags;

/** The typed result of evaluating a flag. */
public sealed interface FlagValue {

    /** Boolean flag result. */
    record BoolValue(boolean value) implements FlagValue {}

    /** Variant flag result. */
    record VariantValue(String value) implements FlagValue {}
}
