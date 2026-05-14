package ai.agentxm.examples.pawmatch;

import ai.agentxm.examples.pawmatch.Charities.Charity;
import ai.agentxm.examples.pawmatch.Pets.Pet;
import ai.agentxm.examples.pawmatch.Variants.DonateFocus;
import ai.agentxm.examples.pawmatch.Variants.MatchDepth;
import ai.agentxm.examples.pawmatch.Variants.MatchStrategy;
import ai.agentxm.examples.pawmatch.Variants.PetCardStyle;
import ai.agentxm.examples.tinyflags.EvaluationContext;
import ai.agentxm.examples.tinyflags.TinyFlags;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/** The PawMatch CLI — all 8 subcommands wired through 9 TinyFlags seams. */
public final class PawMatchCli {

    private record Factor(String name, List<String> tags) {}

    private static final List<Factor> ALL_FACTORS = List.of(
            new Factor("has-kids", List.of("good-with-kids", "gentle")),
            new Factor("quiet-home", List.of("mellow", "calm", "solo", "lap-cat")),
            new Factor("active", List.of("high-energy", "playful")),
            new Factor("first-time", List.of("gentle", "calm", "low-energy")),
            new Factor("multiple-pets", List.of("social")),
            new Factor("small-home", List.of("lap-cat", "solo", "low-energy")));

    private static final Set<String> POPULARITY_TAGS =
            Set.of("social", "good-with-kids", "calm", "mellow", "gentle");

    private final TinyFlags flags;
    private final EvaluationContext context;
    private final PrintWriter out;
    private final PrintWriter err;

    /** Construct a CLI with the default flags, context, and stdout/stderr. */
    public PawMatchCli() {
        this(Flags.create(), defaultContext(), new PrintWriter(System.out, true),
                new PrintWriter(System.err, true));
    }

    public PawMatchCli(TinyFlags flags, EvaluationContext context, PrintWriter out, PrintWriter err) {
        this.flags = flags;
        this.context = context;
        this.out = out;
        this.err = err;
    }

    /** Default session-id from the host environment. */
    public static EvaluationContext defaultContext() {
        String session = firstNonEmpty(
                System.getenv("USER"),
                System.getenv("USERNAME"),
                System.getenv("LOGNAME"));
        return session == null ? EvaluationContext.EMPTY : EvaluationContext.ofSession(session);
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }
        return null;
    }

    /** Run the CLI with the given argv, returning the exit code. */
    public int run(String[] argv) {
        if (argv.length == 0) {
            printUsage();
            return 0;
        }
        String command = argv[0];
        String[] rest = Arrays.copyOfRange(argv, 1, argv.length);
        return switch (command) {
            case "browse" -> browse(rest);
            case "show" -> show(rest);
            case "match" -> match(rest);
            case "apply" -> apply(rest);
            case "fees" -> fees();
            case "return-support" -> returnSupport();
            case "donate" -> donate(rest);
            case "-h", "--help", "help" -> {
                printUsage();
                yield 0;
            }
            default -> {
                err.println("Unknown command '" + command + "'. Try 'pawmatch help'.");
                yield 1;
            }
        };
    }

    private void printUsage() {
        out.println("pawmatch — community pet adoption CLI.");
        out.println();
        out.println("Usage: pawmatch <command> [options]");
        out.println();
        out.println("Commands:");
        out.println("  browse [--species <s>]    Browse adoptable pets.");
        out.println("  show <pet>                Show details for a pet.");
        out.println("  match [...preferences]    Match pets to your lifestyle.");
        out.println("  apply <pet>               Start an adoption application.");
        out.println("  fees                      Show adoption fees.");
        out.println("  return-support            Return support information.");
        out.println("  donate [charity] [...]    Browse animal-welfare charities.");
    }

    // ---------- browse ----------

    int browse(String[] argv) {
        Optional<String> species = Optional.ofNullable(takeOption(argv, "--species"));
        List<Pet> pets = Pets.filterBySpecies(species);
        if (pets.isEmpty()) {
            out.println("No adoptable pets found for species '" + species.orElse("") + "'.");
            return 0;
        }

        if (flags.enabled(Flags.LONG_STAY_HIGHLIGHT, context)) {
            pets.stream()
                    .filter(Pets::isLongStay)
                    .max(Comparator.comparingInt(Pet::daysInShelter))
                    .ifPresent(longStay -> {
                        out.println("★ Featured long-stay friend — please consider " + longStay.name() + "!");
                        out.println();
                    });
        }

        PetCardStyle style = Variants.parsePetCardStyle(flags.variant(Flags.PET_CARD_STYLE, context));
        for (Pet pet : pets) {
            renderPet(pet, style);
        }
        return 0;
    }

    // ---------- show ----------

    int show(String[] argv) {
        if (argv.length == 0) {
            err.println("Usage: pawmatch show <pet>");
            return 1;
        }
        String slug = argv[0];
        Optional<Pet> pet = Pets.findBySlug(slug);
        if (pet.isEmpty()) {
            err.println("Unknown pet '" + slug + "'. Try 'pawmatch browse'.");
            return 1;
        }
        Pet p = pet.get();
        renderPet(p, PetCardStyle.DETAILED);
        out.println("  Needs: " + p.needs());
        String longStaySuffix = Pets.isLongStay(p) ? " (long-stay)" : "";
        out.println("  Days in shelter: " + p.daysInShelter() + longStaySuffix);
        return 0;
    }

    // ---------- match ----------

    int match(String[] argv) {
        MatchPreferences prefs = new MatchPreferences(
                hasFlag(argv, "--has-kids"),
                hasFlag(argv, "--quiet-home"),
                hasFlag(argv, "--active"),
                hasFlag(argv, "--first-time"),
                hasFlag(argv, "--multiple-pets"),
                hasFlag(argv, "--small-home"));

        MatchStrategy strategy =
                Variants.parseMatchStrategy(flags.variant(Flags.RECOMMENDATION_STRATEGY, context));
        MatchDepth depth = Variants.parseMatchDepth(flags.variant(Flags.MATCH_QUIZ_DEPTH, context));
        List<Factor> factors = factorsForDepth(depth);
        Set<String> userFlags = prefs.activeFlags();
        Set<String> wants = new LinkedHashSet<>();
        for (Factor factor : factors) {
            if (userFlags.contains(factor.name())) {
                wants.addAll(factor.tags());
            }
        }

        out.println("Strategy: " + Variants.matchStrategyToKebab(strategy)
                + " • Quiz depth: " + Variants.matchDepthToKebab(depth)
                + " (" + factors.size() + " factor(s) considered)");
        if (prefs.isEmpty()) {
            out.println("(no preference flags provided — try --has-kids --quiet-home --active --first-time)");
        }
        out.println();

        List<Pet> ranked = new ArrayList<>(Pets.ALL);
        switch (strategy) {
            case POPULARITY -> ranked.sort(
                    Comparator.comparingInt((Pet p) -> countTagMatches(p.tags(), POPULARITY_TAGS)).reversed());
            case LONGEST_STAY -> ranked.sort(Comparator.comparingInt(Pet::daysInShelter).reversed());
            case MATCH_QUIZ -> ranked.sort(
                    Comparator.comparingInt((Pet p) -> countTagMatches(p.tags(), wants)).reversed());
        }

        for (Pet pet : ranked.subList(0, Math.min(3, ranked.size()))) {
            out.println("  • " + pet.name() + " (" + pet.breed() + ", " + pet.ageYears() + "y) — "
                    + String.join(", ", pet.tags()));
        }
        out.println();
        out.println("Adoption is a conversation — book a meet-and-greet to see if it's a fit.");
        return 0;
    }

    private static List<Factor> factorsForDepth(MatchDepth depth) {
        int take = switch (depth) {
            case SHORT -> 2;
            case THOROUGH -> 6;
            case STANDARD -> 4;
        };
        return ALL_FACTORS.subList(0, Math.min(take, ALL_FACTORS.size()));
    }

    private static int countTagMatches(List<String> tags, Set<String> target) {
        int count = 0;
        for (String tag : tags) {
            if (target.contains(tag)) count += 1;
        }
        return count;
    }

    // ---------- apply ----------

    int apply(String[] argv) {
        if (argv.length == 0) {
            err.println("Usage: pawmatch apply <pet>");
            return 1;
        }
        String slug = argv[0];
        Optional<Pet> pet = Pets.findBySlug(slug);
        if (pet.isEmpty()) {
            err.println("Unknown pet '" + slug + "'. Try 'pawmatch browse'.");
            return 1;
        }
        Pet p = pet.get();
        out.println("Adoption application for " + p.name());
        out.println();
        out.println("Next steps:");
        out.println("  1. Application reviewed by an adoption counselor (1–2 days).");
        out.println("  2. Meet-and-greet scheduled at the shelter.");
        out.println("  3. 48-hour reflection period before finalizing.");
        out.println("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.");
        if (flags.enabled(Flags.HOME_CHECK_FOLLOWUP, context)) {
            out.println("  5. Two-week follow-up check from a counselor to see how you're settling in.");
        }
        out.println();
        out.println("Returns are always accepted, no questions asked.");
        if (flags.enabled(Flags.SUGGEST_DONATE_AFTER_ADOPTION, context)) {
            out.println();
            out.println("If " + p.name() + " brings you joy, please consider donating to a shelter:");
            out.println("  pawmatch donate");
        }
        return 0;
    }

    // ---------- fees ----------

    int fees() {
        out.println("Adoption fees");
        out.println();
        if (flags.enabled(Flags.FEE_BREAKDOWN_DETAILED, context)) {
            out.println("  Dog adoption — $150 total:");
            out.println("    $60   spay / neuter surgery");
            out.println("    $45   core vaccinations");
            out.println("    $25   microchip and registration");
            out.println("    $20   intake exam and deworming");
            out.println();
            out.println("  Cat adoption — $90 total:");
            out.println("    $50   spay / neuter surgery");
            out.println("    $25   core vaccinations");
            out.println("    $15   microchip and registration");
            out.println();
            out.println("  Small animal — $35 total (intake exam + microchip).");
        } else {
            out.println("  Dog adoption           $150");
            out.println("  Cat adoption            $90");
            out.println("  Small animal            $35");
            out.println();
            out.println("  Fees cover spay/neuter, vaccines, and microchip.");
        }
        out.println();
        out.println("No one is turned away for inability to pay — ask about our subsidy fund.");
        return 0;
    }

    // ---------- return-support ----------

    int returnSupport() {
        out.println("Return support");
        out.println();
        out.println("If your adoption isn't working out, we're here to help.");
        out.println("  • Free behavior consultation with our trainers.");
        out.println("  • No-judgment returns at any time — your pet stays in our care.");
        out.println("  • Connections to low-cost vet and food assistance programs.");
        out.println();
        out.println("Returning a pet is not a failure. Reach out as soon as you'd like support.");
        return 0;
    }

    // ---------- donate ----------

    int donate(String[] argv) {
        Optional<String> charitySlug = positionalArg(argv);
        Optional<String> focusOverride = Optional.ofNullable(takeOption(argv, "--focus"));
        boolean openBrowser = hasFlag(argv, "--open");

        DonateFocus defaultFocus =
                Variants.parseDonateFocus(flags.variant(Flags.DONATE_FOCUS_DEFAULT, context));
        String focus = focusOverride.orElse(Variants.donateFocusToKebab(defaultFocus));
        boolean showRatings = flags.enabled(Flags.SHOW_CHARITY_RATINGS, context);

        if (charitySlug.isPresent()) {
            Optional<Charity> charity = Charities.findBySlug(charitySlug.get());
            if (charity.isEmpty()) {
                err.println("Unknown charity '" + charitySlug.get() + "'.");
                return 1;
            }
            if (openBrowser) {
                return openUrl(charity.get().url());
            }
            renderCharity(charity.get(), showRatings);
            return 0;
        }

        List<Charity> list = Charities.filterByFocus(focus);
        out.println("Animal-welfare charities (focus: " + focus + ")");
        out.println();
        for (Charity charity : list) {
            renderCharity(charity, showRatings);
            out.println();
        }
        out.println(Charities.DISCLAIMER);
        if (!showRatings) {
            out.println("Ratings hidden — set show-charity-ratings to surface them inline.");
        }
        return 0;
    }

    private int openUrl(String url) {
        try {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            ProcessBuilder pb;
            if (os.contains("mac")) {
                pb = new ProcessBuilder("open", url);
            } else if (os.contains("win")) {
                pb = new ProcessBuilder("cmd", "/c", "start", "", url);
            } else {
                pb = new ProcessBuilder("xdg-open", url);
            }
            pb.redirectErrorStream(true);
            pb.start();
            return 0;
        } catch (Exception ex) {
            err.println("Unable to open browser (" + ex.getClass().getSimpleName() + "). URL: " + url);
            return 1;
        }
    }

    // ---------- rendering ----------

    private void renderPet(Pet pet, PetCardStyle style) {
        String longStayBadge = Pets.isLongStay(pet) ? " ★" : "";
        switch (style) {
            case COMPACT -> out.println(String.format(
                    "  %-10s %-14s %-10s %dy%s",
                    pet.slug(), pet.name(), pet.species(), pet.ageYears(), longStayBadge));
            case PLAYFUL -> out.println("  🐾 " + pet.name() + longStayBadge + " — a "
                    + pet.ageYears() + "-year-old " + pet.breed().toLowerCase(Locale.ROOT)
                    + " who is " + String.join(" & ", pet.tags()) + ".");
            case DETAILED -> {
                out.println("  " + pet.name() + longStayBadge + "  [" + pet.slug() + "]");
                out.println("    " + pet.breed() + ", " + pet.ageYears() + " years old");
                out.println("    Tags: " + String.join(", ", pet.tags()));
                out.println();
            }
        }
    }

    private void renderCharity(Charity charity, boolean showRatings) {
        out.println("  " + charity.name() + "  [" + charity.slug() + "]");
        out.println("    Focus: " + charity.focus());
        out.println("    " + charity.description());
        out.println("    Donate: " + charity.url());
        if (showRatings) {
            out.println("    Rating: " + charity.ratingNote());
        }
    }

    // ---------- argv helpers ----------

    private static boolean hasFlag(String[] argv, String name) {
        for (String arg : argv) {
            if (arg.equals(name)) return true;
        }
        return false;
    }

    private static String takeOption(String[] argv, String name) {
        for (int i = 0; i < argv.length; i++) {
            if (argv[i].equals(name) && i + 1 < argv.length) {
                return argv[i + 1];
            }
            if (argv[i].startsWith(name + "=")) {
                return argv[i].substring(name.length() + 1);
            }
        }
        return null;
    }

    private static Optional<String> positionalArg(String[] argv) {
        for (int i = 0; i < argv.length; i++) {
            String arg = argv[i];
            if (arg.startsWith("--")) {
                if (!arg.contains("=") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
                    i += 1;
                }
                continue;
            }
            return Optional.of(arg);
        }
        return Optional.empty();
    }
}
