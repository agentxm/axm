package ai.agentxm.examples.pawmatch

/** User-supplied preferences for the `match` command. */
final case class MatchPreferences(
    hasKids: Boolean = false,
    quietHome: Boolean = false,
    active: Boolean = false,
    firstTime: Boolean = false,
    multiplePets: Boolean = false,
    smallHome: Boolean = false,
):
  def activeFlagSet: Set[String] =
    val builder = Set.newBuilder[String]
    if hasKids then builder += "has-kids"
    if quietHome then builder += "quiet-home"
    if active then builder += "active"
    if firstTime then builder += "first-time"
    if multiplePets then builder += "multiple-pets"
    if smallHome then builder += "small-home"
    builder.result()

  def isEmpty: Boolean =
    !hasKids && !quietHome && !active && !firstTime && !multiplePets && !smallHome
