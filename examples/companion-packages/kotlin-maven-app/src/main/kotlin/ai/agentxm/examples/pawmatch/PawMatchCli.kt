package ai.agentxm.examples.pawmatch

import ai.agentxm.examples.tinyflags.Context
import ai.agentxm.examples.tinyflags.Flags
import java.io.PrintStream

/**
 * The PawMatch CLI core. Parsing lives in [run]; rendering is delegated to
 * named functions per subcommand so the companion `find-a-pet` skill has
 * concrete seams to drive.
 *
 * Output streams are injectable so tests can capture them. Default flags
 * are wired through [createPawMatchFlags] and may be replaced for tests.
 */
class PawMatchCli(
    val flags: Flags = createPawMatchFlags(),
    val context: Context = defaultContext(),
    val out: PrintStream = System.out,
    val err: PrintStream = System.err,
) {

    private val allFactors: List<Pair<String, List<String>>> = listOf(
        "has-kids" to listOf("good-with-kids", "gentle"),
        "quiet-home" to listOf("mellow", "calm", "solo", "lap-cat"),
        "active" to listOf("high-energy", "playful"),
        "first-time" to listOf("gentle", "calm", "low-energy"),
        "multiple-pets" to listOf("social"),
        "small-home" to listOf("lap-cat", "solo", "low-energy"),
    )

    private val popularityTags: Set<String> =
        setOf("social", "good-with-kids", "calm", "mellow", "gentle")

    /**
     * Run the CLI with the given args; returns a process exit code.
     */
    fun run(args: Array<String>): Int {
        if (args.isEmpty()) {
            printUsage()
            return 0
        }
        return when (val command = args[0]) {
            "browse" -> browse(parseSpeciesOption(args.drop(1)))
            "show" -> {
                val slug = args.getOrNull(1)
                if (slug == null) {
                    err.println("Usage: pawmatch show <pet>")
                    1
                } else {
                    show(slug)
                }
            }
            "match" -> match(parseMatchArgs(args.drop(1)))
            "apply" -> {
                val slug = args.getOrNull(1)
                if (slug == null) {
                    err.println("Usage: pawmatch apply <pet>")
                    1
                } else {
                    apply(slug)
                }
            }
            "fees" -> fees()
            "return-support" -> returnSupport()
            "donate" -> {
                val rest = args.drop(1)
                val charityArg = rest.firstOrNull { !it.startsWith("--") }
                val focusArg = findOptionValue(rest, "--focus")
                val openBrowser = rest.contains("--open")
                donate(charityArg, focusArg, openBrowser)
            }
            "-h", "--help" -> {
                printUsage()
                0
            }
            else -> {
                err.println("Unknown command '$command'. Try 'pawmatch --help'.")
                1
            }
        }
    }

    fun browse(species: String?): Int {
        val pets = Pets.filterBySpecies(species)
        if (pets.isEmpty()) {
            out.println("No adoptable pets found for species '${species ?: "<unspecified>"}'.")
            return 0
        }

        if (flags.enabled(FlagKeys.LONG_STAY_HIGHLIGHT, context)) {
            val longStay = pets.filter(Pets::isLongStay).maxByOrNull { it.daysInShelter }
            if (longStay != null) {
                out.println("★ Featured long-stay friend — please consider ${longStay.name}!")
                out.println()
            }
        }

        val style = PetCardStyle.fromKebab(flags.variant(FlagKeys.PET_CARD_STYLE, context))
        for (pet in pets) {
            renderPet(pet, style)
        }
        return 0
    }

    fun show(slug: String): Int {
        val pet = Pets.findBySlug(slug)
        if (pet == null) {
            err.println("Unknown pet '$slug'. Try 'pawmatch browse'.")
            return 1
        }
        renderPet(pet, PetCardStyle.Detailed)
        out.println("  Needs: ${pet.needs}")
        val longStaySuffix = if (Pets.isLongStay(pet)) " (long-stay)" else ""
        out.println("  Days in shelter: ${pet.daysInShelter}$longStaySuffix")
        return 0
    }

    fun match(preferences: MatchPreferences): Int {
        val strategy = MatchStrategy.fromKebab(flags.variant(FlagKeys.RECOMMENDATION_STRATEGY, context))
        val depth = MatchDepth.fromKebab(flags.variant(FlagKeys.MATCH_QUIZ_DEPTH, context))
        val factors = factorsForDepth(depth)
        val userFlags = preferences.activeFlagSet()
        val wants: Set<String> = factors
            .filter { (flag, _) -> flag in userFlags }
            .flatMap { (_, tags) -> tags }
            .toSet()

        out.println(
            "Strategy: ${strategy.kebab} • Quiz depth: ${depth.kebab} " +
                "(${factors.size} factor(s) considered)",
        )
        if (preferences.isEmpty()) {
            out.println(
                "(no preference flags provided — try --has-kids --quiet-home --active --first-time)",
            )
        }
        out.println()

        val ranked = when (strategy) {
            MatchStrategy.Popularity -> Pets.all.sortedByDescending { countTagMatches(it.tags, popularityTags) }
            MatchStrategy.LongestStay -> Pets.all.sortedByDescending { it.daysInShelter }
            MatchStrategy.MatchQuiz -> Pets.all.sortedByDescending { countTagMatches(it.tags, wants) }
        }

        for (pet in ranked.take(3)) {
            out.println("  • ${pet.name} (${pet.breed}, ${pet.ageYears}y) — ${pet.tags.joinToString(", ")}")
        }

        out.println()
        out.println("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
        return 0
    }

    fun apply(slug: String): Int {
        val pet = Pets.findBySlug(slug)
        if (pet == null) {
            err.println("Unknown pet '$slug'. Try 'pawmatch browse'.")
            return 1
        }

        out.println("Adoption application for ${pet.name}")
        out.println()
        out.println("Next steps:")
        out.println("  1. Application reviewed by an adoption counselor (1–2 days).")
        out.println("  2. Meet-and-greet scheduled at the shelter.")
        out.println("  3. 48-hour reflection period before finalizing.")
        out.println("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

        if (flags.enabled(FlagKeys.HOME_CHECK_FOLLOWUP, context)) {
            out.println("  5. Two-week follow-up check from a counselor to see how you're settling in.")
        }

        out.println()
        out.println("Returns are always accepted, no questions asked.")

        if (flags.enabled(FlagKeys.SUGGEST_DONATE_AFTER_ADOPTION, context)) {
            out.println()
            out.println("If ${pet.name} brings you joy, please consider donating to a shelter:")
            out.println("  pawmatch donate")
        }
        return 0
    }

    fun fees(): Int {
        out.println("Adoption fees")
        out.println()
        if (flags.enabled(FlagKeys.FEE_BREAKDOWN_DETAILED, context)) {
            out.println("  Dog adoption — $150 total:")
            out.println("    \$60   spay / neuter surgery")
            out.println("    \$45   core vaccinations")
            out.println("    \$25   microchip and registration")
            out.println("    \$20   intake exam and deworming")
            out.println()
            out.println("  Cat adoption — \$90 total:")
            out.println("    \$50   spay / neuter surgery")
            out.println("    \$25   core vaccinations")
            out.println("    \$15   microchip and registration")
            out.println()
            out.println("  Small animal — \$35 total (intake exam + microchip).")
        } else {
            out.println("  Dog adoption           \$150")
            out.println("  Cat adoption            \$90")
            out.println("  Small animal            \$35")
            out.println()
            out.println("  Fees cover spay/neuter, vaccines, and microchip.")
        }
        out.println()
        out.println("No one is turned away for inability to pay — ask about our subsidy fund.")
        return 0
    }

    fun returnSupport(): Int {
        out.println("Return support")
        out.println()
        out.println("If your adoption isn't working out, we're here to help.")
        out.println("  • Free behavior consultation with our trainers.")
        out.println("  • No-judgment returns at any time — your pet stays in our care.")
        out.println("  • Connections to low-cost vet and food assistance programs.")
        out.println()
        out.println("Returning a pet is not a failure. Reach out as soon as you'd like support.")
        return 0
    }

    fun donate(charitySlug: String?, focusOverride: String?, openBrowser: Boolean): Int {
        val defaultFocus = DonateFocus.fromKebab(flags.variant(FlagKeys.DONATE_FOCUS_DEFAULT, context))
        val focus = focusOverride ?: defaultFocus.kebab
        val showRatings = flags.enabled(FlagKeys.SHOW_CHARITY_RATINGS, context)

        if (charitySlug != null) {
            val charity = Charities.findBySlug(charitySlug)
            if (charity == null) {
                err.println("Unknown charity '$charitySlug'.")
                return 1
            }
            if (openBrowser) {
                return openUrl(charity.url)
            }
            renderCharity(charity, showRatings)
            return 0
        }

        val list = Charities.filterByFocus(focus)
        out.println("Animal-welfare charities (focus: $focus)")
        out.println()
        for (charity in list) {
            renderCharity(charity, showRatings)
            out.println()
        }
        out.println(Charities.DISCLAIMER)
        if (!showRatings) {
            out.println("Ratings hidden — set show-charity-ratings to surface them inline.")
        }
        return 0
    }

    private fun renderPet(pet: Pet, style: PetCardStyle) {
        val longStayBadge = if (Pets.isLongStay(pet)) " ★" else ""
        when (style) {
            PetCardStyle.Compact ->
                out.println(
                    "  ${pet.slug.padEnd(10)} ${pet.name.padEnd(14)} " +
                        "${pet.species.padEnd(10)} ${pet.ageYears}y$longStayBadge",
                )
            PetCardStyle.Playful ->
                out.println(
                    "  🐾 ${pet.name}$longStayBadge — a ${pet.ageYears}-year-old " +
                        "${pet.breed.lowercase()} who is ${pet.tags.joinToString(" & ")}.",
                )
            PetCardStyle.Detailed -> {
                out.println("  ${pet.name}$longStayBadge  [${pet.slug}]")
                out.println("    ${pet.breed}, ${pet.ageYears} years old")
                out.println("    Tags: ${pet.tags.joinToString(", ")}")
                out.println()
            }
        }
    }

    private fun renderCharity(charity: Charity, showRatings: Boolean) {
        out.println("  ${charity.name}  [${charity.slug}]")
        out.println("    Focus: ${charity.focus}")
        out.println("    ${charity.description}")
        out.println("    Donate: ${charity.url}")
        if (showRatings) {
            out.println("    Rating: ${charity.ratingNote}")
        }
    }

    private fun openUrl(url: String): Int = try {
        val osName = System.getProperty("os.name").lowercase()
        val cmd = when {
            osName.contains("mac") -> listOf("open", url)
            osName.contains("win") -> listOf("cmd", "/c", "start", "", url)
            else -> listOf("xdg-open", url)
        }
        ProcessBuilder(cmd).redirectErrorStream(true).start()
        0
    } catch (ex: Exception) {
        err.println("Unable to open browser (${ex.javaClass.simpleName}). URL: $url")
        1
    }

    private fun factorsForDepth(depth: MatchDepth): List<Pair<String, List<String>>> {
        val take = when (depth) {
            MatchDepth.Short -> 2
            MatchDepth.Thorough -> 6
            MatchDepth.Standard -> 4
        }
        return allFactors.take(take)
    }

    private fun countTagMatches(tags: List<String>, target: Set<String>): Int =
        tags.count { it in target }

    private fun printUsage() {
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
    }

    private fun parseSpeciesOption(rest: List<String>): String? = findOptionValue(rest, "--species")

    private fun parseMatchArgs(rest: List<String>): MatchPreferences = MatchPreferences(
        hasKids = "--has-kids" in rest,
        quietHome = "--quiet-home" in rest,
        active = "--active" in rest,
        firstTime = "--first-time" in rest,
        multiplePets = "--multiple-pets" in rest,
        smallHome = "--small-home" in rest,
    )

    private fun findOptionValue(rest: List<String>, name: String): String? {
        val idx = rest.indexOf(name)
        if (idx < 0) return null
        return rest.getOrNull(idx + 1)?.takeUnless { it.startsWith("--") }
    }

    companion object {
        fun defaultContext(): Context {
            val user =
                System.getenv("USER")
                    ?: System.getenv("USERNAME")
                    ?: System.getenv("LOGNAME")
                    ?: "anonymous"
            return Context(user)
        }
    }
}
