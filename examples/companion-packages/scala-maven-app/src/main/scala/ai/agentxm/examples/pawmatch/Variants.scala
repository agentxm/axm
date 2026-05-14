package ai.agentxm.examples.pawmatch

/** Kebab-case variant parsers for [[Flags]]. */
enum PetCardStyle(val kebab: String):
  case Compact extends PetCardStyle("compact")
  case Detailed extends PetCardStyle("detailed")
  case Playful extends PetCardStyle("playful")

object PetCardStyle:
  def fromKebab(value: String): PetCardStyle =
    values.find(_.kebab == value).getOrElse(
      throw IllegalArgumentException(s"Unknown PetCardStyle variant '$value'."),
    )

enum MatchStrategy(val kebab: String):
  case Popularity extends MatchStrategy("popularity")
  case MatchQuiz extends MatchStrategy("match-quiz")
  case LongestStay extends MatchStrategy("longest-stay")

object MatchStrategy:
  def fromKebab(value: String): MatchStrategy =
    values.find(_.kebab == value).getOrElse(
      throw IllegalArgumentException(s"Unknown MatchStrategy variant '$value'."),
    )

enum MatchDepth(val kebab: String):
  case Short extends MatchDepth("short")
  case Standard extends MatchDepth("standard")
  case Thorough extends MatchDepth("thorough")

object MatchDepth:
  def fromKebab(value: String): MatchDepth =
    values.find(_.kebab == value).getOrElse(
      throw IllegalArgumentException(s"Unknown MatchDepth variant '$value'."),
    )

enum DonateFocus(val kebab: String):
  case All extends DonateFocus("all")
  case Shelters extends DonateFocus("shelters")
  case Rescue extends DonateFocus("rescue")

object DonateFocus:
  def fromKebab(value: String): DonateFocus =
    values.find(_.kebab == value).getOrElse(
      throw IllegalArgumentException(s"Unknown DonateFocus variant '$value'."),
    )
