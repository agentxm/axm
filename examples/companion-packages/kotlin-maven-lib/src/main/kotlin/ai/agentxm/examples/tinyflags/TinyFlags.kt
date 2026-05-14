package ai.agentxm.examples.tinyflags

import java.security.MessageDigest

/**
 * Identity attributes used to bucket a flag evaluation deterministically.
 *
 * Pass a stable identifier such as a user id, account id, or session id as
 * [id]. Use [ANONYMOUS] when no identity is available — anonymous callers
 * share a single bucket.
 */
data class Context(val id: String) {
    companion object {
        val ANONYMOUS: Context = Context("anonymous")
    }
}

/**
 * Typed result of evaluating any flag.
 */
sealed interface FlagValue {
    data class Bool(val value: Boolean) : FlagValue
    data class Variant(val value: String) : FlagValue
}

/**
 * A validated flag definition produced by [booleanFlag] or [variantFlag].
 */
sealed interface FlagDefinition {
    data class Boolean(
        val defaultValue: kotlin.Boolean,
        val rollout: Int? = null,
    ) : FlagDefinition

    data class Variant(
        val variants: List<String>,
        val defaultValue: String,
        val rollout: Map<String, Int>? = null,
    ) : FlagDefinition
}

/**
 * Construct a validated boolean flag. [rollout] is an optional 0–100 enabled
 * percentage. Throws [IllegalArgumentException] if rollout is out of range.
 */
fun booleanFlag(default: Boolean, rollout: Int? = null): FlagDefinition.Boolean =
    FlagDefinition.Boolean(default, rollout?.let { requirePercentage(it, "rollout") })

/**
 * Construct a validated variant flag. [default] defaults to the first variant.
 * [rollout] allocates traffic across declared variants; total must not exceed
 * 100. Throws [IllegalArgumentException] on validation failure.
 */
fun variantFlag(
    variants: List<String>,
    default: String? = null,
    rollout: Map<String, Int>? = null,
): FlagDefinition.Variant {
    require(variants.isNotEmpty()) { "Variant flags require at least one variant." }

    val unique = variants.distinct()
    require(unique.size == variants.size) { "Variant names must be unique." }
    require(unique.none { it.isEmpty() }) { "Variant names must be non-empty." }

    val chosenDefault = default ?: variants.first()
    require(unique.contains(chosenDefault)) {
        "Variant default '$chosenDefault' is not one of the variants."
    }

    val normalizedRollout = rollout?.let { normalizeVariantRollout(it, unique) }
    return FlagDefinition.Variant(unique, chosenDefault, normalizedRollout)
}

private fun normalizeVariantRollout(
    rollout: Map<String, Int>,
    variants: List<String>,
): Map<String, Int> {
    val known = variants.toSet()
    var total = 0
    val normalized = LinkedHashMap<String, Int>()
    for ((variant, percentage) in rollout) {
        require(variant in known) { "Rollout references unknown variant: $variant." }
        val validated = requirePercentage(percentage, "rollout for '$variant'")
        normalized[variant] = validated
        total += validated
    }
    require(total <= 100) {
        "Variant rollout percentages cannot exceed 100; received $total."
    }
    return normalized.toMap()
}

private fun requirePercentage(value: Int, label: String): Int {
    require(value in 0..100) { "$label must be an integer from 0 to 100; received $value." }
    return value
}

/**
 * A bundle of named flag definitions. Construct with [Flags] or
 * [createFlags] and evaluate via [enabled], [variant], or [evaluate].
 */
class Flags private constructor(
    private val definitions: Map<String, FlagDefinition>,
) {
    /**
     * The flag definitions in this bundle, in declaration order.
     */
    fun definitions(): Map<String, FlagDefinition> = definitions

    /**
     * Evaluate a boolean flag.
     *
     * @throws NoSuchElementException if the flag is unknown.
     * @throws IllegalStateException if the flag is not a boolean flag.
     */
    fun enabled(name: String, context: Context = Context.ANONYMOUS): Boolean {
        val definition = require(name)
        check(definition is FlagDefinition.Boolean) {
            "TinyFlags flag '$name' is not a boolean flag."
        }
        val rollout = definition.rollout ?: return definition.defaultValue
        return bucketFor(name, context) < rollout
    }

    /**
     * Evaluate a variant flag.
     *
     * @throws NoSuchElementException if the flag is unknown.
     * @throws IllegalStateException if the flag is not a variant flag.
     */
    fun variant(name: String, context: Context = Context.ANONYMOUS): String {
        val definition = require(name)
        check(definition is FlagDefinition.Variant) {
            "TinyFlags flag '$name' is not a variant flag."
        }
        val allocation = definition.rollout ?: return definition.defaultValue

        val bucket = bucketFor(name, context)
        var upperBound = 0
        for ((variantName, percentage) in allocation) {
            upperBound += percentage
            if (bucket < upperBound) return variantName
        }
        return definition.defaultValue
    }

    /**
     * Evaluate any flag, returning a typed [FlagValue].
     */
    fun evaluate(name: String, context: Context = Context.ANONYMOUS): FlagValue =
        when (require(name)) {
            is FlagDefinition.Boolean -> FlagValue.Bool(enabled(name, context))
            is FlagDefinition.Variant -> FlagValue.Variant(variant(name, context))
        }

    private fun require(name: String): FlagDefinition =
        definitions[name] ?: throw NoSuchElementException("Unknown TinyFlags flag: $name.")

    companion object {
        /** Build a [Flags] bundle from a vararg list of (name, definition) pairs. */
        fun of(vararg entries: Pair<String, FlagDefinition>): Flags =
            of(entries.toList())

        /** Build a [Flags] bundle from a list of (name, definition) pairs. */
        fun of(entries: List<Pair<String, FlagDefinition>>): Flags {
            val table = LinkedHashMap<String, FlagDefinition>()
            for ((name, definition) in entries) {
                require(!table.containsKey(name)) { "Duplicate flag name: $name." }
                table[name] = definition
            }
            return Flags(table.toMap())
        }
    }
}

/**
 * Convenience builder mirroring the ecosystem helpers in the other companion
 * library examples. Construct flags from a sequence of (name, definition)
 * pairs.
 */
fun createFlags(vararg entries: Pair<String, FlagDefinition>): Flags = Flags.of(*entries)

// Anonymous callers share a single bucket, so they either all see the rollout
// variant or none do. Pass a stable id to get per-caller bucketing.
private fun bucketFor(name: String, context: Context): Int {
    val key = "$name:${context.id}"
    val digest = MessageDigest.getInstance("SHA-1").digest(key.toByteArray(Charsets.UTF_8))
    // Use the first 4 bytes as an unsigned big-endian integer for bucketing.
    val unsigned =
        ((digest[0].toLong() and 0xff) shl 24) or
            ((digest[1].toLong() and 0xff) shl 16) or
            ((digest[2].toLong() and 0xff) shl 8) or
            (digest[3].toLong() and 0xff)
    return (unsigned % 100L).toInt()
}
