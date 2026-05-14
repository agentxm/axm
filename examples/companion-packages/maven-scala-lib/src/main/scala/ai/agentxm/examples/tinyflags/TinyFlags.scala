package ai.agentxm.examples.tinyflags

import java.security.MessageDigest
import java.nio.charset.StandardCharsets
import scala.collection.immutable.ListMap

/** Identity attributes used to bucket a flag evaluation deterministically.
  *
  * Pass a stable identifier (user id, account id, or session id) as `id` so
  * a given caller receives stable rollout decisions. Use `Context.Anonymous`
  * when no identity is available — anonymous callers share a single bucket.
  */
final case class Context(id: String)

object Context:
  /** Shared bucket for callers without any stable identity. */
  val Anonymous: Context = Context("anonymous")

/** The typed result of evaluating any flag. */
sealed trait FlagValue
object FlagValue:
  final case class Bool(value: Boolean) extends FlagValue
  final case class Variant(value: String) extends FlagValue

/** A validated flag definition produced by [[booleanFlag]] or
  * [[variantFlag]].
  */
sealed trait FlagDefinition
object FlagDefinition:
  final case class Bool(defaultValue: Boolean, rollout: Option[Int]) extends FlagDefinition
  final case class Variant(
      variants: List[String],
      defaultValue: String,
      rollout: Option[Map[String, Int]],
  ) extends FlagDefinition

/** Construct a validated boolean flag. `rollout` is an optional 0–100
  * enabled percentage. Throws [[IllegalArgumentException]] if rollout is
  * out of range.
  */
def booleanFlag(default: Boolean, rollout: Option[Int] = None): FlagDefinition.Bool =
  FlagDefinition.Bool(default, rollout.map(requirePercentage(_, "rollout")))

/** Construct a validated variant flag. `default` defaults to the first
  * variant. `rollout` allocates traffic across declared variants; total
  * must not exceed 100. Throws [[IllegalArgumentException]] on validation
  * failure.
  */
def variantFlag(
    variants: List[String],
    default: Option[String] = None,
    rollout: Option[Map[String, Int]] = None,
): FlagDefinition.Variant =
  require(variants.nonEmpty, "Variant flags require at least one variant.")
  val unique = variants.distinct
  require(unique.size == variants.size, "Variant names must be unique.")
  require(unique.forall(_.nonEmpty), "Variant names must be non-empty.")

  val chosenDefault = default.getOrElse(variants.head)
  require(
    unique.contains(chosenDefault),
    s"Variant default '$chosenDefault' is not one of the variants.",
  )

  val normalized = rollout.map(normalizeVariantRollout(_, unique))
  FlagDefinition.Variant(unique, chosenDefault, normalized)

private def normalizeVariantRollout(
    rollout: Map[String, Int],
    variants: List[String],
): Map[String, Int] =
  val known = variants.toSet
  val builder = ListMap.newBuilder[String, Int]
  var total = 0
  for (variant, percentage) <- rollout do
    require(known.contains(variant), s"Rollout references unknown variant: $variant.")
    val validated = requirePercentage(percentage, s"rollout for '$variant'")
    builder += (variant -> validated)
    total += validated
  require(total <= 100, s"Variant rollout percentages cannot exceed 100; received $total.")
  builder.result()

private def requirePercentage(value: Int, label: String): Int =
  require(
    value >= 0 && value <= 100,
    s"$label must be an integer from 0 to 100; received $value.",
  )
  value

/** A bundle of named flag definitions. Construct with [[Flags.of]] or
  * [[createFlags]] and evaluate via [[Flags.enabled]], [[Flags.variant]],
  * or [[Flags.evaluate]].
  */
final class Flags private (definitionsTable: Map[String, FlagDefinition]):

  /** The flag definitions in this bundle, in declaration order. */
  def definitions: Map[String, FlagDefinition] = definitionsTable

  /** Evaluate a boolean flag.
    *
    * Throws [[NoSuchElementException]] if the flag is unknown, or
    * [[IllegalStateException]] if the flag is not a boolean flag.
    */
  def enabled(name: String, context: Context = Context.Anonymous): Boolean =
    requireFlag(name) match
      case FlagDefinition.Bool(defaultValue, None) => defaultValue
      case FlagDefinition.Bool(_, Some(rollout))   => Flags.bucketFor(name, context) < rollout
      case _: FlagDefinition.Variant =>
        throw IllegalStateException(s"TinyFlags flag '$name' is not a boolean flag.")

  /** Evaluate a variant flag.
    *
    * Throws [[NoSuchElementException]] if the flag is unknown, or
    * [[IllegalStateException]] if the flag is not a variant flag.
    */
  def variant(name: String, context: Context = Context.Anonymous): String =
    requireFlag(name) match
      case FlagDefinition.Variant(_, defaultValue, None) => defaultValue
      case FlagDefinition.Variant(_, defaultValue, Some(allocation)) =>
        val bucket = Flags.bucketFor(name, context)
        var upperBound = 0
        var matched: Option[String] = None
        for (variantName, percentage) <- allocation if matched.isEmpty do
          upperBound += percentage
          if bucket < upperBound then matched = Some(variantName)
        matched.getOrElse(defaultValue)
      case _: FlagDefinition.Bool =>
        throw IllegalStateException(s"TinyFlags flag '$name' is not a variant flag.")

  /** Evaluate any flag, returning a typed [[FlagValue]]. */
  def evaluate(name: String, context: Context = Context.Anonymous): FlagValue =
    requireFlag(name) match
      case _: FlagDefinition.Bool    => FlagValue.Bool(enabled(name, context))
      case _: FlagDefinition.Variant => FlagValue.Variant(variant(name, context))

  private def requireFlag(name: String): FlagDefinition =
    definitionsTable.getOrElse(
      name,
      throw NoSuchElementException(s"Unknown TinyFlags flag: $name."),
    )

object Flags:
  /** Build a [[Flags]] bundle from a vararg list of (name, definition) pairs. */
  def of(entries: (String, FlagDefinition)*): Flags = of(entries.toList)

  /** Build a [[Flags]] bundle from a list of (name, definition) pairs. */
  def of(entries: List[(String, FlagDefinition)]): Flags =
    val builder = ListMap.newBuilder[String, FlagDefinition]
    val seen = scala.collection.mutable.Set.empty[String]
    for (name, definition) <- entries do
      require(!seen.contains(name), s"Duplicate flag name: $name.")
      seen += name
      builder += (name -> definition)
    Flags(builder.result())

  // Anonymous callers share a single bucket, so they either all see the
  // rollout variant or none do. Pass a stable id to get per-caller bucketing.
  private[tinyflags] def bucketFor(name: String, context: Context): Int =
    val key = s"$name:${context.id}"
    val digest =
      MessageDigest.getInstance("SHA-1").digest(key.getBytes(StandardCharsets.UTF_8))
    // Use the first 4 bytes as an unsigned big-endian integer for bucketing.
    val unsigned =
      ((digest(0).toLong & 0xff) << 24) |
        ((digest(1).toLong & 0xff) << 16) |
        ((digest(2).toLong & 0xff) << 8) |
        (digest(3).toLong & 0xff)
    (unsigned % 100L).toInt

/** Convenience builder mirroring the ecosystem helpers in the other
  * companion library examples. Construct flags from a sequence of (name,
  * definition) pairs.
  */
def createFlags(entries: (String, FlagDefinition)*): Flags = Flags.of(entries*)
