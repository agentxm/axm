<?php

declare(strict_types=1);

namespace AgentXM\Examples\PawMatch;

use AgentXM\Examples\TinyFlags\EvaluationContext;
use AgentXM\Examples\TinyFlags\Flags;

/**
 * pawmatch — a tiny pet-adoption-center CLI used to exercise TinyFlags.
 *
 * The CLI is intentionally framed as a shelter / rescue adoption center
 * (not a retail pet store) following mainstream animal-welfare best
 * practices: adopt-don't-shop, matching-over-transacting, hold and
 * meet-and-greet periods, transparent adoption fees, no-judgment returns,
 * and surfacing long-stay animals.
 */
final class PawMatchCli
{
    /** @var array<int, array{flag: string, tags: list<string>}> */
    private const ALL_FACTORS = [
        ['flag' => 'has-kids', 'tags' => ['good-with-kids', 'gentle']],
        ['flag' => 'quiet-home', 'tags' => ['mellow', 'calm', 'solo', 'lap-cat']],
        ['flag' => 'active', 'tags' => ['high-energy', 'playful']],
        ['flag' => 'first-time', 'tags' => ['gentle', 'calm', 'low-energy']],
        ['flag' => 'multiple-pets', 'tags' => ['social']],
        ['flag' => 'small-home', 'tags' => ['lap-cat', 'solo', 'low-energy']],
    ];

    private const POPULARITY_TAGS = ['social', 'good-with-kids', 'calm', 'mellow', 'gentle'];

    private Flags $flags;

    private EvaluationContext $context;

    /** @var resource */
    private $out;

    /** @var resource */
    private $err;

    /**
     * @param resource|null $out
     * @param resource|null $err
     */
    public function __construct(
        ?Flags $flags = null,
        ?EvaluationContext $context = null,
        $out = null,
        $err = null,
    ) {
        $this->flags = $flags ?? PawMatchFlags::create();
        $this->context = $context ?? new EvaluationContext(sessionId: self::defaultSessionId());
        $this->out = $out ?? STDOUT;
        $this->err = $err ?? STDERR;
    }

    /**
     * @param list<string> $argv
     */
    public function run(array $argv): int
    {
        if ($argv === []) {
            $this->printUsage();

            return 0;
        }

        $command = array_shift($argv);

        return match ($command) {
            'browse' => $this->cmdBrowse($argv),
            'show' => $this->cmdShow($argv),
            'match' => $this->cmdMatch($argv),
            'apply' => $this->cmdApply($argv),
            'fees' => $this->cmdFees(),
            'return-support' => $this->cmdReturnSupport(),
            'donate' => $this->cmdDonate($argv),
            '-h', '--help', 'help' => $this->printUsage(),
            default => $this->unknownCommand($command),
        };
    }

    private function cmdBrowse(array $argv): int
    {
        $species = self::optionValue($argv, '--species');

        return $this->browse($species);
    }

    public function browse(?string $species): int
    {
        $pets = Pets::filterBySpecies($species);
        if ($pets === []) {
            $this->writeLine($this->out, "No adoptable pets found for species '{$species}'.");

            return 0;
        }

        if ($this->flags->enabled(PawMatchFlags::LONG_STAY_HIGHLIGHT, $this->context)) {
            $longStay = null;
            foreach ($pets as $pet) {
                if (! Pets::isLongStay($pet)) {
                    continue;
                }
                if ($longStay === null || $pet->daysInShelter > $longStay->daysInShelter) {
                    $longStay = $pet;
                }
            }
            if ($longStay !== null) {
                $this->writeLine($this->out, "★ Featured long-stay friend — please consider {$longStay->name}!");
                $this->writeLine($this->out, '');
            }
        }

        $style = Variants::parsePetCardStyle(
            $this->flags->variant(PawMatchFlags::PET_CARD_STYLE, $this->context),
        );
        foreach ($pets as $pet) {
            $this->renderPet($pet, $style);
        }

        return 0;
    }

    private function cmdShow(array $argv): int
    {
        if ($argv === []) {
            $this->writeLine($this->err, "Usage: pawmatch show <pet>");

            return 1;
        }

        return $this->show($argv[0]);
    }

    public function show(string $slug): int
    {
        $pet = Pets::findBySlug($slug);
        if ($pet === null) {
            $this->writeLine($this->err, "Unknown pet '{$slug}'. Try 'pawmatch browse'.");

            return 1;
        }

        $this->renderPet($pet, 'detailed');
        $this->writeLine($this->out, "  Needs: {$pet->needs}");
        $longStay = Pets::isLongStay($pet) ? ' (long-stay)' : '';
        $this->writeLine($this->out, "  Days in shelter: {$pet->daysInShelter}{$longStay}");

        return 0;
    }

    private function cmdMatch(array $argv): int
    {
        $prefs = new MatchPreferences(
            hasKids: in_array('--has-kids', $argv, true),
            quietHome: in_array('--quiet-home', $argv, true),
            active: in_array('--active', $argv, true),
            firstTime: in_array('--first-time', $argv, true),
            multiplePets: in_array('--multiple-pets', $argv, true),
            smallHome: in_array('--small-home', $argv, true),
        );

        return $this->match($prefs);
    }

    public function match(MatchPreferences $prefs): int
    {
        $strategy = Variants::parseMatchStrategy(
            $this->flags->variant(PawMatchFlags::RECOMMENDATION_STRATEGY, $this->context),
        );
        $depth = Variants::parseMatchDepth(
            $this->flags->variant(PawMatchFlags::MATCH_QUIZ_DEPTH, $this->context),
        );

        $factors = self::factorsForDepth($depth);
        $userFlags = $prefs->activeFlags();
        $wants = [];
        foreach ($factors as $factor) {
            if (! in_array($factor['flag'], $userFlags, true)) {
                continue;
            }
            foreach ($factor['tags'] as $tag) {
                $wants[$tag] = true;
            }
        }

        $factorCount = count($factors);
        $this->writeLine(
            $this->out,
            "Strategy: {$strategy} • Quiz depth: {$depth} ({$factorCount} factor(s) considered)",
        );

        if ($prefs->isEmpty()) {
            $this->writeLine(
                $this->out,
                '(no preference flags provided — try --has-kids --quiet-home --active --first-time)',
            );
        }
        $this->writeLine($this->out, '');

        $ranked = Pets::all();
        if ($strategy === 'popularity') {
            $popularity = array_fill_keys(self::POPULARITY_TAGS, true);
            usort(
                $ranked,
                static fn (Pet $a, Pet $b): int =>
                    self::countTagMatches($b->tags, $popularity)
                    - self::countTagMatches($a->tags, $popularity),
            );
        } elseif ($strategy === 'longest-stay') {
            usort($ranked, static fn (Pet $a, Pet $b): int => $b->daysInShelter - $a->daysInShelter);
        } else {
            usort(
                $ranked,
                static fn (Pet $a, Pet $b): int =>
                    self::countTagMatches($b->tags, $wants)
                    - self::countTagMatches($a->tags, $wants),
            );
        }

        foreach (array_slice($ranked, 0, 3) as $pet) {
            $tagList = implode(', ', $pet->tags);
            $this->writeLine(
                $this->out,
                "  • {$pet->name} ({$pet->breed}, {$pet->ageYears}y) — {$tagList}",
            );
        }

        $this->writeLine($this->out, '');
        $this->writeLine(
            $this->out,
            "Adoption is a conversation — book a meet-and-greet to see if it's a fit.",
        );

        return 0;
    }

    private function cmdApply(array $argv): int
    {
        if ($argv === []) {
            $this->writeLine($this->err, "Usage: pawmatch apply <pet>");

            return 1;
        }

        return $this->apply($argv[0]);
    }

    public function apply(string $slug): int
    {
        $pet = Pets::findBySlug($slug);
        if ($pet === null) {
            $this->writeLine($this->err, "Unknown pet '{$slug}'. Try 'pawmatch browse'.");

            return 1;
        }

        $this->writeLine($this->out, "Adoption application for {$pet->name}");
        $this->writeLine($this->out, '');
        $this->writeLine($this->out, 'Next steps:');
        $this->writeLine($this->out, '  1. Application reviewed by an adoption counselor (1–2 days).');
        $this->writeLine($this->out, '  2. Meet-and-greet scheduled at the shelter.');
        $this->writeLine($this->out, '  3. 48-hour reflection period before finalizing.');
        $this->writeLine($this->out, '  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.');

        if ($this->flags->enabled(PawMatchFlags::HOME_CHECK_FOLLOWUP, $this->context)) {
            $this->writeLine(
                $this->out,
                "  5. Two-week follow-up check from a counselor to see how you're settling in.",
            );
        }

        $this->writeLine($this->out, '');
        $this->writeLine($this->out, 'Returns are always accepted, no questions asked.');

        if ($this->flags->enabled(PawMatchFlags::SUGGEST_DONATE_AFTER_ADOPTION, $this->context)) {
            $this->writeLine($this->out, '');
            $this->writeLine(
                $this->out,
                "If {$pet->name} brings you joy, please consider donating to a shelter:",
            );
            $this->writeLine($this->out, '  pawmatch donate');
        }

        return 0;
    }

    public function cmdFees(): int
    {
        return $this->fees();
    }

    public function fees(): int
    {
        $this->writeLine($this->out, 'Adoption fees');
        $this->writeLine($this->out, '');
        if ($this->flags->enabled(PawMatchFlags::FEE_BREAKDOWN_DETAILED, $this->context)) {
            $this->writeLine($this->out, '  Dog adoption — $150 total:');
            $this->writeLine($this->out, '    $60   spay / neuter surgery');
            $this->writeLine($this->out, '    $45   core vaccinations');
            $this->writeLine($this->out, '    $25   microchip and registration');
            $this->writeLine($this->out, '    $20   intake exam and deworming');
            $this->writeLine($this->out, '');
            $this->writeLine($this->out, '  Cat adoption — $90 total:');
            $this->writeLine($this->out, '    $50   spay / neuter surgery');
            $this->writeLine($this->out, '    $25   core vaccinations');
            $this->writeLine($this->out, '    $15   microchip and registration');
            $this->writeLine($this->out, '');
            $this->writeLine($this->out, '  Small animal — $35 total (intake exam + microchip).');
        } else {
            $this->writeLine($this->out, '  Dog adoption           $150');
            $this->writeLine($this->out, '  Cat adoption            $90');
            $this->writeLine($this->out, '  Small animal            $35');
            $this->writeLine($this->out, '');
            $this->writeLine($this->out, '  Fees cover spay/neuter, vaccines, and microchip.');
        }

        $this->writeLine($this->out, '');
        $this->writeLine(
            $this->out,
            'No one is turned away for inability to pay — ask about our subsidy fund.',
        );

        return 0;
    }

    public function cmdReturnSupport(): int
    {
        return $this->returnSupport();
    }

    public function returnSupport(): int
    {
        $this->writeLine($this->out, 'Return support');
        $this->writeLine($this->out, '');
        $this->writeLine($this->out, "If your adoption isn't working out, we're here to help.");
        $this->writeLine($this->out, '  • Free behavior consultation with our trainers.');
        $this->writeLine($this->out, '  • No-judgment returns at any time — your pet stays in our care.');
        $this->writeLine($this->out, '  • Connections to low-cost vet and food assistance programs.');
        $this->writeLine($this->out, '');
        $this->writeLine(
            $this->out,
            "Returning a pet is not a failure. Reach out as soon as you'd like support.",
        );

        return 0;
    }

    private function cmdDonate(array $argv): int
    {
        $focus = self::optionValue($argv, '--focus');
        $open = in_array('--open', $argv, true);

        // The first positional, if any, is the charity slug.
        $slug = null;
        foreach ($argv as $arg) {
            if (str_starts_with($arg, '-')) {
                continue;
            }
            $slug = $arg;
            break;
        }

        return $this->donate($slug, $focus, $open);
    }

    public function donate(?string $charitySlug, ?string $focusOverride, bool $open): int
    {
        $defaultFocus = Variants::parseDonateFocus(
            $this->flags->variant(PawMatchFlags::DONATE_FOCUS_DEFAULT, $this->context),
        );
        $focus = $focusOverride ?? $defaultFocus;
        $showRatings = $this->flags->enabled(PawMatchFlags::SHOW_CHARITY_RATINGS, $this->context);

        if ($charitySlug !== null) {
            $charity = Charities::findBySlug($charitySlug);
            if ($charity === null) {
                $this->writeLine($this->err, "Unknown charity '{$charitySlug}'.");

                return 1;
            }

            if ($open) {
                return $this->openUrl($charity->url);
            }

            $this->renderCharity($charity, $showRatings);

            return 0;
        }

        $list = Charities::filterByFocus($focus);
        $this->writeLine($this->out, "Animal-welfare charities (focus: {$focus})");
        $this->writeLine($this->out, '');
        foreach ($list as $charity) {
            $this->renderCharity($charity, $showRatings);
            $this->writeLine($this->out, '');
        }

        $this->writeLine($this->out, Charities::DISCLAIMER);
        if (! $showRatings) {
            $this->writeLine($this->out, 'Ratings hidden — set show-charity-ratings to surface them inline.');
        }

        return 0;
    }

    private function renderPet(Pet $pet, string $style): void
    {
        $longStayBadge = Pets::isLongStay($pet) ? ' ★' : '';
        if ($style === 'compact') {
            $line = sprintf(
                '  %s %s %s %dy%s',
                self::padRight($pet->slug, 10),
                self::padRight($pet->name, 14),
                self::padRight($pet->species, 10),
                $pet->ageYears,
                $longStayBadge,
            );
            $this->writeLine($this->out, $line);
        } elseif ($style === 'playful') {
            $tagList = implode(' & ', $pet->tags);
            $breed = strtolower($pet->breed);
            $this->writeLine(
                $this->out,
                "  🐾 {$pet->name}{$longStayBadge} — a {$pet->ageYears}-year-old {$breed} who is {$tagList}.",
            );
        } else {
            $this->writeLine($this->out, "  {$pet->name}{$longStayBadge}  [{$pet->slug}]");
            $this->writeLine($this->out, "    {$pet->breed}, {$pet->ageYears} years old");
            $this->writeLine($this->out, '    Tags: ' . implode(', ', $pet->tags));
            $this->writeLine($this->out, '');
        }
    }

    private function renderCharity(Charity $charity, bool $showRatings): void
    {
        $this->writeLine($this->out, "  {$charity->name}  [{$charity->slug}]");
        $this->writeLine($this->out, "    Focus: {$charity->focus}");
        $this->writeLine($this->out, "    {$charity->description}");
        $this->writeLine($this->out, "    Donate: {$charity->url}");
        if ($showRatings) {
            $this->writeLine($this->out, "    Rating: {$charity->ratingNote}");
        }
    }

    private function openUrl(string $url): int
    {
        $platform = PHP_OS_FAMILY;
        if ($platform === 'Darwin') {
            $command = 'open ' . escapeshellarg($url);
        } elseif ($platform === 'Windows') {
            $command = 'start "" ' . escapeshellarg($url);
        } else {
            $command = 'xdg-open ' . escapeshellarg($url);
        }

        // Best-effort fire-and-forget so we don't block on the browser.
        $handle = @popen($command . ' > /dev/null 2>&1 &', 'r');
        if ($handle === false) {
            $this->writeLine($this->err, "Unable to open browser. URL: {$url}");

            return 1;
        }
        pclose($handle);

        return 0;
    }

    private function printUsage(): int
    {
        $this->writeLine($this->out, 'pawmatch — community pet adoption CLI.');
        $this->writeLine($this->out, '');
        $this->writeLine($this->out, 'Usage:');
        $this->writeLine($this->out, '  pawmatch browse [--species <species>]');
        $this->writeLine($this->out, '  pawmatch show <pet>');
        $this->writeLine($this->out, '  pawmatch match [--has-kids] [--quiet-home] [--active]');
        $this->writeLine($this->out, '                 [--first-time] [--multiple-pets] [--small-home]');
        $this->writeLine($this->out, '  pawmatch apply <pet>');
        $this->writeLine($this->out, '  pawmatch fees');
        $this->writeLine($this->out, '  pawmatch return-support');
        $this->writeLine($this->out, '  pawmatch donate [<charity>] [--focus <focus>] [--open]');

        return 0;
    }

    private function unknownCommand(string $command): int
    {
        $this->writeLine($this->err, "Unknown command '{$command}'. Try 'pawmatch help'.");

        return 1;
    }

    /**
     * @param resource $stream
     */
    private function writeLine($stream, string $text): void
    {
        fwrite($stream, $text . "\n");
    }

    /**
     * @param list<string> $argv
     */
    private static function optionValue(array $argv, string $name): ?string
    {
        $count = count($argv);
        for ($i = 0; $i < $count; $i++) {
            if ($argv[$i] === $name && isset($argv[$i + 1])) {
                return $argv[$i + 1];
            }
            $prefix = $name . '=';
            if (str_starts_with($argv[$i], $prefix)) {
                return substr($argv[$i], strlen($prefix));
            }
        }

        return null;
    }

    /**
     * @return list<array{flag: string, tags: list<string>}>
     */
    private static function factorsForDepth(string $depth): array
    {
        $take = match ($depth) {
            'short' => 2,
            'thorough' => 6,
            default => 4,
        };

        return array_slice(self::ALL_FACTORS, 0, $take);
    }

    /**
     * @param list<string> $tags
     * @param array<string, bool> $target
     */
    private static function countTagMatches(array $tags, array $target): int
    {
        $count = 0;
        foreach ($tags as $tag) {
            if (isset($target[$tag])) {
                $count++;
            }
        }

        return $count;
    }

    private static function padRight(string $value, int $width): string
    {
        if (strlen($value) >= $width) {
            return $value;
        }

        return $value . str_repeat(' ', $width - strlen($value));
    }

    private static function defaultSessionId(): string
    {
        return getenv('USER') ?: getenv('USERNAME') ?: getenv('LOGNAME') ?: 'anonymous';
    }
}
