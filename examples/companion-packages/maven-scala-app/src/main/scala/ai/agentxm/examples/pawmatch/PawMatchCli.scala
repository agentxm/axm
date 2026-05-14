package ai.agentxm.examples.pawmatch

import ai.agentxm.examples.tinyflags.{Context, Flags}
import java.io.PrintStream

/** The PawMatch CLI core. Parsing lives in [[run]]; rendering is delegated
  * to named methods per subcommand so the companion `find-a-pet` skill has
  * concrete seams to drive.
  *
  * Output streams are injectable so tests can capture them. Default flags
  * are wired through [[createPawMatchFlags]] and may be replaced for tests.
  */
final class PawMatchCli(
    val flags: Flags = createPawMatchFlags(),
    val context: Context = PawMatchCli.defaultContext,
    val out: PrintStream = System.out,
    val err: PrintStream = System.err,
):

  private val allFactors: List[(String, List[String])] = List(
    "has-kids" -> List("good-with-kids", "gentle"),
    "quiet-home" -> List("mellow", "calm", "solo", "lap-cat"),
    "active" -> List("high-energy", "playful"),
    "first-time" -> List("gentle", "calm", "low-energy"),
    "multiple-pets" -> List("social"),
    "small-home" -> List("lap-cat", "solo", "low-energy"),
  )

  private val popularityTags: Set[String] =
    Set("social", "good-with-kids", "calm", "mellow", "gentle")

  /** Run the CLI with the given args; returns a process exit code. */
  def run(args: Array[String]): Int =
    if args.isEmpty then
      printUsage()
      0
    else
      val rest = args.drop(1).toList
      args(0) match
        case "browse" => browse(findOptionValue(rest, "--species"))
        case "show" =>
          rest.headOption match
            case Some(slug) => show(slug)
            case None =>
              err.println("Usage: pawmatch show <pet>")
              1
        case "match" => doMatch(parseMatchArgs(rest))
        case "apply" =>
          rest.headOption match
            case Some(slug) => apply(slug)
            case None =>
              err.println("Usage: pawmatch apply <pet>")
              1
        case "fees"           => fees()
        case "return-support" => returnSupport()
        case "donate" =>
          val charityArg = rest.find(!_.startsWith("--"))
          val focusArg = findOptionValue(rest, "--focus")
          val openBrowser = rest.contains("--open")
          donate(charityArg, focusArg, openBrowser)
        case "-h" | "--help" | "help" =>
          printUsage()
          0
        case command =>
          err.println(s"Unknown command '$command'. Try 'pawmatch --help'.")
          1

  // ---------- browse ----------

  def browse(species: Option[String]): Int =
    val pets = Pets.filterBySpecies(species)
    if pets.isEmpty then
      out.println(
        s"No adoptable pets found for species '${species.getOrElse("<unspecified>")}'.",
      )
      return 0

    if flags.enabled(FlagKeys.LongStayHighlight, context) then
      val longStay = pets.filter(Pets.isLongStay).maxByOption(_.daysInShelter)
      longStay match
        case Some(pet) =>
          out.println(s"★ Featured long-stay friend — please consider ${pet.name}!")
          out.println()
        case None => ()

    val style = PetCardStyle.fromKebab(flags.variant(FlagKeys.PetCardStyle, context))
    for pet <- pets do renderPet(pet, style)
    0

  // ---------- show ----------

  def show(slug: String): Int =
    Pets.findBySlug(slug) match
      case None =>
        err.println(s"Unknown pet '$slug'. Try 'pawmatch browse'.")
        1
      case Some(pet) =>
        renderPet(pet, PetCardStyle.Detailed)
        out.println(s"  Needs: ${pet.needs}")
        val longStaySuffix = if Pets.isLongStay(pet) then " (long-stay)" else ""
        out.println(s"  Days in shelter: ${pet.daysInShelter}$longStaySuffix")
        0

  // ---------- match ----------

  def doMatch(preferences: MatchPreferences): Int =
    val strategy =
      MatchStrategy.fromKebab(flags.variant(FlagKeys.RecommendationStrategy, context))
    val depth = MatchDepth.fromKebab(flags.variant(FlagKeys.MatchQuizDepth, context))
    val factors = factorsForDepth(depth)
    val userFlags = preferences.activeFlagSet
    val wants: Set[String] = factors
      .filter { case (flag, _) => userFlags.contains(flag) }
      .flatMap { case (_, tags) => tags }
      .toSet

    out.println(
      s"Strategy: ${strategy.kebab} • Quiz depth: ${depth.kebab} " +
        s"(${factors.size} factor(s) considered)",
    )
    if preferences.isEmpty then
      out.println(
        "(no preference flags provided — try --has-kids --quiet-home --active --first-time)",
      )
    out.println()

    val ranked = strategy match
      case MatchStrategy.Popularity =>
        Pets.all.sortBy(p => -countTagMatches(p.tags, popularityTags))
      case MatchStrategy.LongestStay =>
        Pets.all.sortBy(p => -p.daysInShelter)
      case MatchStrategy.MatchQuiz =>
        Pets.all.sortBy(p => -countTagMatches(p.tags, wants))

    for pet <- ranked.take(3) do
      out.println(
        s"  • ${pet.name} (${pet.breed}, ${pet.ageYears}y) — ${pet.tags.mkString(", ")}",
      )

    out.println()
    out.println("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
    0

  // ---------- apply ----------

  def apply(slug: String): Int =
    Pets.findBySlug(slug) match
      case None =>
        err.println(s"Unknown pet '$slug'. Try 'pawmatch browse'.")
        1
      case Some(pet) =>
        out.println(s"Adoption application for ${pet.name}")
        out.println()
        out.println("Next steps:")
        out.println("  1. Application reviewed by an adoption counselor (1–2 days).")
        out.println("  2. Meet-and-greet scheduled at the shelter.")
        out.println("  3. 48-hour reflection period before finalizing.")
        out.println(
          "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.",
        )

        if flags.enabled(FlagKeys.HomeCheckFollowup, context) then
          out.println(
            "  5. Two-week follow-up check from a counselor to see how you're settling in.",
          )

        out.println()
        out.println("Returns are always accepted, no questions asked.")

        if flags.enabled(FlagKeys.SuggestDonateAfterAdoption, context) then
          out.println()
          out.println(
            s"If ${pet.name} brings you joy, please consider donating to a shelter:",
          )
          out.println("  pawmatch donate")
        0

  // ---------- fees ----------

  def fees(): Int =
    out.println("Adoption fees")
    out.println()
    if flags.enabled(FlagKeys.FeeBreakdownDetailed, context) then
      out.println("  Dog adoption — $150 total:")
      out.println("    $60   spay / neuter surgery")
      out.println("    $45   core vaccinations")
      out.println("    $25   microchip and registration")
      out.println("    $20   intake exam and deworming")
      out.println()
      out.println("  Cat adoption — $90 total:")
      out.println("    $50   spay / neuter surgery")
      out.println("    $25   core vaccinations")
      out.println("    $15   microchip and registration")
      out.println()
      out.println("  Small animal — $35 total (intake exam + microchip).")
    else
      out.println("  Dog adoption           $150")
      out.println("  Cat adoption            $90")
      out.println("  Small animal            $35")
      out.println()
      out.println("  Fees cover spay/neuter, vaccines, and microchip.")
    out.println()
    out.println("No one is turned away for inability to pay — ask about our subsidy fund.")
    0

  // ---------- return-support ----------

  def returnSupport(): Int =
    out.println("Return support")
    out.println()
    out.println("If your adoption isn't working out, we're here to help.")
    out.println("  • Free behavior consultation with our trainers.")
    out.println("  • No-judgment returns at any time — your pet stays in our care.")
    out.println("  • Connections to low-cost vet and food assistance programs.")
    out.println()
    out.println("Returning a pet is not a failure. Reach out as soon as you'd like support.")
    0

  // ---------- donate ----------

  def donate(
      charitySlug: Option[String],
      focusOverride: Option[String],
      openBrowser: Boolean,
  ): Int =
    val defaultFocus =
      DonateFocus.fromKebab(flags.variant(FlagKeys.DonateFocusDefault, context))
    val focus = focusOverride.getOrElse(defaultFocus.kebab)
    val showRatings = flags.enabled(FlagKeys.ShowCharityRatings, context)

    charitySlug match
      case Some(slug) =>
        Charities.findBySlug(slug) match
          case None =>
            err.println(s"Unknown charity '$slug'.")
            1
          case Some(charity) =>
            if openBrowser then openUrl(charity.url)
            else
              renderCharity(charity, showRatings)
              0
      case None =>
        val list = Charities.filterByFocus(focus)
        out.println(s"Animal-welfare charities (focus: $focus)")
        out.println()
        for charity <- list do
          renderCharity(charity, showRatings)
          out.println()
        out.println(Charities.Disclaimer)
        if !showRatings then
          out.println("Ratings hidden — set show-charity-ratings to surface them inline.")
        0

  // ---------- rendering ----------

  private def renderPet(pet: Pet, style: PetCardStyle): Unit =
    val longStayBadge = if Pets.isLongStay(pet) then " ★" else ""
    style match
      case PetCardStyle.Compact =>
        out.println(
          s"  ${pet.slug.padTo(10, ' ')} ${pet.name.padTo(14, ' ')} " +
            s"${pet.species.padTo(10, ' ')} ${pet.ageYears}y$longStayBadge",
        )
      case PetCardStyle.Playful =>
        out.println(
          s"  🐾 ${pet.name}$longStayBadge — a ${pet.ageYears}-year-old " +
            s"${pet.breed.toLowerCase} who is ${pet.tags.mkString(" & ")}.",
        )
      case PetCardStyle.Detailed =>
        out.println(s"  ${pet.name}$longStayBadge  [${pet.slug}]")
        out.println(s"    ${pet.breed}, ${pet.ageYears} years old")
        out.println(s"    Tags: ${pet.tags.mkString(", ")}")
        out.println()

  private def renderCharity(charity: Charity, showRatings: Boolean): Unit =
    out.println(s"  ${charity.name}  [${charity.slug}]")
    out.println(s"    Focus: ${charity.focus}")
    out.println(s"    ${charity.description}")
    out.println(s"    Donate: ${charity.url}")
    if showRatings then out.println(s"    Rating: ${charity.ratingNote}")

  private def openUrl(url: String): Int =
    try
      val osName = System.getProperty("os.name", "").toLowerCase
      val cmd =
        if osName.contains("mac") then List("open", url)
        else if osName.contains("win") then List("cmd", "/c", "start", "", url)
        else List("xdg-open", url)
      val pb = ProcessBuilder(cmd*)
      pb.redirectErrorStream(true)
      pb.start()
      0
    catch
      case ex: Exception =>
        err.println(s"Unable to open browser (${ex.getClass.getSimpleName}). URL: $url")
        1

  private def factorsForDepth(depth: MatchDepth): List[(String, List[String])] =
    val take = depth match
      case MatchDepth.Short    => 2
      case MatchDepth.Thorough => 6
      case MatchDepth.Standard => 4
    allFactors.take(take)

  private def countTagMatches(tags: List[String], target: Set[String]): Int =
    tags.count(target.contains)

  private def printUsage(): Unit =
    out.println("pawmatch — community pet adoption CLI.")
    out.println()
    out.println("Subcommands:")
    out.println("  browse [--species <s>]   Browse adoptable pets.")
    out.println("  show <pet>               Show details for a pet.")
    out.println("  match [flags]            Match pets to your lifestyle.")
    out.println("  apply <pet>              Start an adoption application.")
    out.println("  fees                     Show adoption fees.")
    out.println("  return-support           Return support information.")
    out.println("  donate [charity] [--focus <f>] [--open]")
    out.println("                           Browse animal-welfare charities to support.")

  private def parseMatchArgs(rest: List[String]): MatchPreferences = MatchPreferences(
    hasKids = rest.contains("--has-kids"),
    quietHome = rest.contains("--quiet-home"),
    active = rest.contains("--active"),
    firstTime = rest.contains("--first-time"),
    multiplePets = rest.contains("--multiple-pets"),
    smallHome = rest.contains("--small-home"),
  )

  private def findOptionValue(rest: List[String], name: String): Option[String] =
    val idx = rest.indexOf(name)
    if idx < 0 then None
    else rest.lift(idx + 1).filter(!_.startsWith("--"))

object PawMatchCli:
  def defaultContext: Context =
    val user = Option(System.getenv("USER"))
      .orElse(Option(System.getenv("USERNAME")))
      .orElse(Option(System.getenv("LOGNAME")))
      .filter(_.nonEmpty)
      .getOrElse("anonymous")
    Context(user)
