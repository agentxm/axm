// Package pawmatch contains the PawMatch CLI logic. It is the codebase the
// companion AXM skills are designed to operate on, and is the example
// consumer of github.com/agentxm/example-tinyflags.
package pawmatch

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"

	"github.com/agentxm/example-tinyflags/tinyflags"
)

// CLI is the PawMatch entry point. Construct it with [New] and dispatch with
// [CLI.Run].
type CLI struct {
	Flags   *tinyflags.Flags
	Context tinyflags.Context
	Out     io.Writer
	Err     io.Writer
	// OpenURL is used for `donate <slug> --open`. The default uses the host
	// OS's browser opener; tests may override it.
	OpenURL func(url string) error
}

// New builds a CLI with default dependencies.
func New() *CLI {
	return &CLI{
		Flags:   NewFlags(),
		Context: tinyflags.Context{ID: defaultSessionID()},
		Out:     os.Stdout,
		Err:     os.Stderr,
		OpenURL: openURLDefault,
	}
}

// Run dispatches a subcommand and returns the process exit code. args should
// not include the executable name (use os.Args[1:]).
func (c *CLI) Run(args []string) int {
	if len(args) == 0 {
		c.writeUsage()
		return 1
	}

	sub, rest := args[0], args[1:]
	switch sub {
	case "browse":
		return c.runBrowse(rest)
	case "show":
		return c.runShow(rest)
	case "match":
		return c.runMatch(rest)
	case "apply":
		return c.runApply(rest)
	case "fees":
		return c.runFees(rest)
	case "return-support":
		return c.runReturnSupport(rest)
	case "donate":
		return c.runDonate(rest)
	case "-h", "--help", "help":
		c.writeUsage()
		return 0
	default:
		fmt.Fprintf(c.Err, "pawmatch: unknown command %q\n\n", sub)
		c.writeUsage()
		return 2
	}
}

func (c *CLI) writeUsage() {
	fmt.Fprintln(c.Out, "pawmatch — community pet adoption CLI.")
	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "Commands:")
	fmt.Fprintln(c.Out, "  browse [--species <s>]   List adoptable pets")
	fmt.Fprintln(c.Out, "  show <pet>               Show details for a pet")
	fmt.Fprintln(c.Out, "  match [factors]          Match pets to your lifestyle")
	fmt.Fprintln(c.Out, "  apply <pet>              Start an adoption application")
	fmt.Fprintln(c.Out, "  fees                     Show adoption fees")
	fmt.Fprintln(c.Out, "  return-support           Show return-support information")
	fmt.Fprintln(c.Out, "  donate [<slug>] [--focus <f>] [--open]")
	fmt.Fprintln(c.Out, "                           Browse animal-welfare charities to support")
}

// ── browse ──────────────────────────────────────────────────────────────

func (c *CLI) runBrowse(args []string) int {
	fs := flag.NewFlagSet("browse", flag.ContinueOnError)
	fs.SetOutput(c.Err)
	species := fs.String("species", "", "Filter by species (dog|cat|rabbit|guinea-pig).")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	return c.Browse(*species)
}

// Browse implements the `browse` command.
func (c *CLI) Browse(species string) int {
	pets := FilterPetsBySpecies(species)
	if len(pets) == 0 {
		fmt.Fprintf(c.Out, "No adoptable pets found for species '%s'.\n", species)
		return 0
	}

	highlight, err := c.Flags.Enabled(FlagLongStayHighlight, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	if highlight {
		var top *Pet
		for i := range pets {
			if !IsLongStay(pets[i]) {
				continue
			}
			if top == nil || pets[i].DaysInShelter > top.DaysInShelter {
				p := pets[i]
				top = &p
			}
		}
		if top != nil {
			fmt.Fprintf(c.Out, "★ Featured long-stay friend — please consider %s!\n", top.Name)
			fmt.Fprintln(c.Out, "")
		}
	}

	styleStr, err := c.Flags.Variant(FlagPetCardStyle, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	style, err := ParsePetCardStyle(styleStr)
	if err != nil {
		return c.flagError(err)
	}

	for _, p := range pets {
		c.renderPet(p, style)
	}
	return 0
}

// ── show ────────────────────────────────────────────────────────────────

func (c *CLI) runShow(args []string) int {
	if len(args) < 1 {
		fmt.Fprintln(c.Err, "usage: pawmatch show <pet>")
		return 2
	}
	return c.Show(args[0])
}

// Show implements the `show` command.
func (c *CLI) Show(slug string) int {
	pet, ok := FindPetBySlug(slug)
	if !ok {
		fmt.Fprintf(c.Err, "Unknown pet '%s'. Try 'pawmatch browse'.\n", slug)
		return 1
	}

	c.renderPet(pet, PetCardDetailed)
	fmt.Fprintf(c.Out, "  Needs: %s\n", pet.Needs)
	tag := ""
	if IsLongStay(pet) {
		tag = " (long-stay)"
	}
	fmt.Fprintf(c.Out, "  Days in shelter: %d%s\n", pet.DaysInShelter, tag)
	return 0
}

// ── match ───────────────────────────────────────────────────────────────

type matchFactor struct {
	flag string
	tags []string
}

var matchFactors = []matchFactor{
	{flag: "has-kids", tags: []string{"good-with-kids", "gentle"}},
	{flag: "quiet-home", tags: []string{"mellow", "calm", "solo", "lap-cat"}},
	{flag: "active", tags: []string{"high-energy", "playful"}},
	{flag: "first-time", tags: []string{"gentle", "calm", "low-energy"}},
	{flag: "multiple-pets", tags: []string{"social"}},
	{flag: "small-home", tags: []string{"lap-cat", "solo", "low-energy"}},
}

var popularityTags = map[string]struct{}{
	"social":         {},
	"good-with-kids": {},
	"calm":           {},
	"mellow":         {},
	"gentle":         {},
}

func (c *CLI) runMatch(args []string) int {
	fs := flag.NewFlagSet("match", flag.ContinueOnError)
	fs.SetOutput(c.Err)
	prefs := MatchPreferences{}
	fs.BoolVar(&prefs.HasKids, "has-kids", false, "Family with children.")
	fs.BoolVar(&prefs.QuietHome, "quiet-home", false, "Quiet, calm household.")
	fs.BoolVar(&prefs.Active, "active", false, "Active, outdoor lifestyle.")
	fs.BoolVar(&prefs.FirstTime, "first-time", false, "First-time pet adopter.")
	fs.BoolVar(&prefs.MultiplePets, "multiple-pets", false, "Other pets at home.")
	fs.BoolVar(&prefs.SmallHome, "small-home", false, "Small home or apartment.")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	return c.Match(prefs)
}

// Match implements the `match` command.
func (c *CLI) Match(prefs MatchPreferences) int {
	strategyStr, err := c.Flags.Variant(FlagRecommendationStrategy, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	strategy, err := ParseMatchStrategy(strategyStr)
	if err != nil {
		return c.flagError(err)
	}

	depthStr, err := c.Flags.Variant(FlagMatchQuizDepth, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	depth, err := ParseMatchDepth(depthStr)
	if err != nil {
		return c.flagError(err)
	}

	factors := factorsForDepth(depth)
	userFlags := activeFlagSet(prefs)
	wants := map[string]struct{}{}
	for _, f := range factors {
		if _, ok := userFlags[f.flag]; !ok {
			continue
		}
		for _, tag := range f.tags {
			wants[tag] = struct{}{}
		}
	}

	fmt.Fprintf(c.Out, "Strategy: %s • Quiz depth: %s (%d factor(s) considered)\n",
		strategy, depth, len(factors))
	if preferencesEmpty(prefs) {
		fmt.Fprintln(c.Out, "(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
	}
	fmt.Fprintln(c.Out, "")

	ranked := make([]Pet, len(AllPets))
	copy(ranked, AllPets)
	switch strategy {
	case StrategyPopularity:
		sort.SliceStable(ranked, func(i, j int) bool {
			return countTagMatches(ranked[j].Tags, popularityTags) <
				countTagMatches(ranked[i].Tags, popularityTags)
		})
	case StrategyLongestStay:
		sort.SliceStable(ranked, func(i, j int) bool {
			return ranked[j].DaysInShelter < ranked[i].DaysInShelter
		})
	case StrategyMatchQuiz:
		sort.SliceStable(ranked, func(i, j int) bool {
			return countTagMatches(ranked[j].Tags, wants) <
				countTagMatches(ranked[i].Tags, wants)
		})
	}

	limit := 3
	if len(ranked) < limit {
		limit = len(ranked)
	}
	for _, p := range ranked[:limit] {
		fmt.Fprintf(c.Out, "  • %s (%s, %dy) — %s\n", p.Name, p.Breed, p.AgeYears, strings.Join(p.Tags, ", "))
	}

	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
	return 0
}

// ── apply ───────────────────────────────────────────────────────────────

func (c *CLI) runApply(args []string) int {
	if len(args) < 1 {
		fmt.Fprintln(c.Err, "usage: pawmatch apply <pet>")
		return 2
	}
	return c.Apply(args[0])
}

// Apply implements the `apply` command.
func (c *CLI) Apply(slug string) int {
	pet, ok := FindPetBySlug(slug)
	if !ok {
		fmt.Fprintf(c.Err, "Unknown pet '%s'. Try 'pawmatch browse'.\n", slug)
		return 1
	}

	fmt.Fprintf(c.Out, "Adoption application for %s\n", pet.Name)
	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "Next steps:")
	fmt.Fprintln(c.Out, "  1. Application reviewed by an adoption counselor (1–2 days).")
	fmt.Fprintln(c.Out, "  2. Meet-and-greet scheduled at the shelter.")
	fmt.Fprintln(c.Out, "  3. 48-hour reflection period before finalizing.")
	fmt.Fprintln(c.Out, "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

	followup, err := c.Flags.Enabled(FlagHomeCheckFollowup, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	if followup {
		fmt.Fprintln(c.Out, "  5. Two-week follow-up check from a counselor to see how you're settling in.")
	}

	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "Returns are always accepted, no questions asked.")

	suggestDonate, err := c.Flags.Enabled(FlagSuggestDonateAfterAdopt, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	if suggestDonate {
		fmt.Fprintln(c.Out, "")
		fmt.Fprintf(c.Out, "If %s brings you joy, please consider donating to a shelter:\n", pet.Name)
		fmt.Fprintln(c.Out, "  pawmatch donate")
	}
	return 0
}

// ── fees ────────────────────────────────────────────────────────────────

func (c *CLI) runFees(_ []string) int { return c.Fees() }

// Fees implements the `fees` command.
func (c *CLI) Fees() int {
	detailed, err := c.Flags.Enabled(FlagFeeBreakdownDetailed, c.Context)
	if err != nil {
		return c.flagError(err)
	}

	fmt.Fprintln(c.Out, "Adoption fees")
	fmt.Fprintln(c.Out, "")
	if detailed {
		fmt.Fprintln(c.Out, "  Dog adoption — $150 total:")
		fmt.Fprintln(c.Out, "    $60   spay / neuter surgery")
		fmt.Fprintln(c.Out, "    $45   core vaccinations")
		fmt.Fprintln(c.Out, "    $25   microchip and registration")
		fmt.Fprintln(c.Out, "    $20   intake exam and deworming")
		fmt.Fprintln(c.Out, "")
		fmt.Fprintln(c.Out, "  Cat adoption — $90 total:")
		fmt.Fprintln(c.Out, "    $50   spay / neuter surgery")
		fmt.Fprintln(c.Out, "    $25   core vaccinations")
		fmt.Fprintln(c.Out, "    $15   microchip and registration")
		fmt.Fprintln(c.Out, "")
		fmt.Fprintln(c.Out, "  Small animal — $35 total (intake exam + microchip).")
	} else {
		fmt.Fprintln(c.Out, "  Dog adoption           $150")
		fmt.Fprintln(c.Out, "  Cat adoption            $90")
		fmt.Fprintln(c.Out, "  Small animal            $35")
		fmt.Fprintln(c.Out, "")
		fmt.Fprintln(c.Out, "  Fees cover spay/neuter, vaccines, and microchip.")
	}

	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "No one is turned away for inability to pay — ask about our subsidy fund.")
	return 0
}

// ── return-support ──────────────────────────────────────────────────────

func (c *CLI) runReturnSupport(_ []string) int { return c.ReturnSupport() }

// ReturnSupport implements the `return-support` command.
func (c *CLI) ReturnSupport() int {
	fmt.Fprintln(c.Out, "Return support")
	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "If your adoption isn't working out, we're here to help.")
	fmt.Fprintln(c.Out, "  • Free behavior consultation with our trainers.")
	fmt.Fprintln(c.Out, "  • No-judgment returns at any time — your pet stays in our care.")
	fmt.Fprintln(c.Out, "  • Connections to low-cost vet and food assistance programs.")
	fmt.Fprintln(c.Out, "")
	fmt.Fprintln(c.Out, "Returning a pet is not a failure. Reach out as soon as you'd like support.")
	return 0
}

// ── donate ──────────────────────────────────────────────────────────────

func (c *CLI) runDonate(args []string) int {
	fs := flag.NewFlagSet("donate", flag.ContinueOnError)
	fs.SetOutput(c.Err)
	focus := fs.String("focus", "", "Charity focus (all|shelters|rescue|policy).")
	open := fs.Bool("open", false, "Open the charity's donation URL in a browser.")
	// stdlib flag stops at the first non-flag argument, so accept the slug
	// either before or after the flags by splitting positional args out
	// ahead of parsing.
	slug, rest := splitLeadingPositional(args)
	if err := fs.Parse(rest); err != nil {
		return 2
	}
	if slug == "" && fs.NArg() > 0 {
		slug = fs.Arg(0)
	}

	var focusPtr *string
	if *focus != "" {
		focusPtr = focus
	}
	return c.Donate(slug, focusPtr, *open)
}

// splitLeadingPositional pulls out a single leading positional argument (one
// that does not start with "-") from args. Flags-then-positional and
// positional-then-flags are both supported by callers.
func splitLeadingPositional(args []string) (positional string, rest []string) {
	if len(args) == 0 {
		return "", args
	}
	if strings.HasPrefix(args[0], "-") {
		return "", args
	}
	return args[0], args[1:]
}

// Donate implements the `donate` command. focusOverride is nil when the user
// did not pass `--focus`, in which case the default is read from the
// `donate-focus-default` variant flag.
func (c *CLI) Donate(slug string, focusOverride *string, open bool) int {
	defaultFocusStr, err := c.Flags.Variant(FlagDonateFocusDefault, c.Context)
	if err != nil {
		return c.flagError(err)
	}
	defaultFocus, err := ParseDonateFocus(defaultFocusStr)
	if err != nil {
		return c.flagError(err)
	}
	focus := string(defaultFocus)
	if focusOverride != nil {
		focus = *focusOverride
	}

	showRatings, err := c.Flags.Enabled(FlagShowCharityRatings, c.Context)
	if err != nil {
		return c.flagError(err)
	}

	if slug != "" {
		charity, ok := FindCharityBySlug(slug)
		if !ok {
			fmt.Fprintf(c.Err, "Unknown charity '%s'.\n", slug)
			return 1
		}
		if open {
			return c.openURL(charity.URL)
		}
		c.renderCharity(charity, showRatings)
		return 0
	}

	list := FilterCharitiesByFocus(focus)
	fmt.Fprintf(c.Out, "Animal-welfare charities (focus: %s)\n", focus)
	fmt.Fprintln(c.Out, "")
	for _, charity := range list {
		c.renderCharity(charity, showRatings)
		fmt.Fprintln(c.Out, "")
	}

	fmt.Fprintln(c.Out, CharitiesDisclaimer)
	if !showRatings {
		fmt.Fprintln(c.Out, "Ratings hidden — set show-charity-ratings to surface them inline.")
	}
	return 0
}

// ── helpers ─────────────────────────────────────────────────────────────

func (c *CLI) renderPet(p Pet, style PetCardStyle) {
	badge := ""
	if IsLongStay(p) {
		badge = " ★"
	}
	switch style {
	case PetCardCompact:
		fmt.Fprintf(c.Out, "  %-10s %-14s %-10s %dy%s\n", p.Slug, p.Name, p.Species, p.AgeYears, badge)
	case PetCardPlayful:
		fmt.Fprintf(c.Out, "  🐾 %s%s — a %d-year-old %s who is %s.\n",
			p.Name, badge, p.AgeYears, strings.ToLower(p.Breed), strings.Join(p.Tags, " & "))
	default:
		fmt.Fprintf(c.Out, "  %s%s  [%s]\n", p.Name, badge, p.Slug)
		fmt.Fprintf(c.Out, "    %s, %d years old\n", p.Breed, p.AgeYears)
		fmt.Fprintf(c.Out, "    Tags: %s\n", strings.Join(p.Tags, ", "))
		fmt.Fprintln(c.Out, "")
	}
}

func (c *CLI) renderCharity(charity Charity, showRatings bool) {
	fmt.Fprintf(c.Out, "  %s  [%s]\n", charity.Name, charity.Slug)
	fmt.Fprintf(c.Out, "    Focus: %s\n", charity.Focus)
	fmt.Fprintf(c.Out, "    %s\n", charity.Description)
	fmt.Fprintf(c.Out, "    Donate: %s\n", charity.URL)
	if showRatings {
		fmt.Fprintf(c.Out, "    Rating: %s\n", charity.RatingNote)
	}
}

func (c *CLI) openURL(url string) int {
	opener := c.OpenURL
	if opener == nil {
		opener = openURLDefault
	}
	if err := opener(url); err != nil {
		fmt.Fprintf(c.Err, "Unable to open browser (%T). URL: %s\n", err, url)
		return 1
	}
	return 0
}

func (c *CLI) flagError(err error) int {
	fmt.Fprintf(c.Err, "pawmatch: %v\n", err)
	return 1
}

func factorsForDepth(d MatchDepth) []matchFactor {
	take := 4
	switch d {
	case DepthShort:
		take = 2
	case DepthThorough:
		take = 6
	}
	if take > len(matchFactors) {
		take = len(matchFactors)
	}
	return matchFactors[:take]
}

func countTagMatches(tags []string, target map[string]struct{}) int {
	count := 0
	for _, t := range tags {
		if _, ok := target[t]; ok {
			count++
		}
	}
	return count
}

func openURLDefault(url string) error {
	var name string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		name = "open"
		args = []string{url}
	case "windows":
		name = "cmd"
		args = []string{"/c", "start", "", url}
	default:
		name = "xdg-open"
		args = []string{url}
	}
	return exec.Command(name, args...).Start()
}

func defaultSessionID() string {
	for _, env := range []string{"USER", "USERNAME", "LOGNAME"} {
		if v := os.Getenv(env); v != "" {
			return v
		}
	}
	return "anonymous"
}
