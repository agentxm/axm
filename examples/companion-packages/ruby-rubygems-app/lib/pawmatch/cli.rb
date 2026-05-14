# frozen_string_literal: true

require "etc"
require "optparse"
require "pawmatch/pets"
require "pawmatch/charities"
require "pawmatch/flags"

module Pawmatch
  # Command-line entrypoint for the pawmatch example app. Subcommands are
  # parsed with stdlib `optparse` to avoid third-party CLI dependencies.
  module Cli
    USAGE = <<~USAGE
      pawmatch — community pet-adoption CLI.

      Usage: pawmatch <command> [options]

      Commands:
        browse [--species SPECIES]   List adoptable pets
        show <pet>                   Show details for a pet
        match [match flags]          Match pets to your lifestyle
        apply <pet>                  Start an adoption application
        fees                         Show adoption fees
        return-support               No-judgment return information
        donate [--focus FOCUS]       Browse charities to support
        donate <slug> --open         Open a charity's donation URL
    USAGE

    POPULARITY_TAGS = %w[social good-with-kids calm mellow gentle].freeze

    # Ordered (factor flag, [matching pet tags]) tuples — the quiz depth
    # variant controls how many factors are considered.
    ALL_FACTORS = [
      ["has-kids",       %w[good-with-kids gentle]],
      ["quiet-home",     %w[mellow calm solo lap-cat]],
      ["active",         %w[high-energy playful]],
      ["first-time",     %w[gentle calm low-energy]],
      ["multiple-pets",  %w[social]],
      ["small-home",     %w[lap-cat solo low-energy]]
    ].freeze

    module_function

    def run(argv, stdout: $stdout, stderr: $stderr)
      command = argv.shift
      if command.nil? || command == "--help" || command == "-h"
        stdout.puts USAGE
        return 0
      end

      case command
      when "browse"         then cmd_browse(argv, stdout, stderr)
      when "show"           then cmd_show(argv, stdout, stderr)
      when "match"          then cmd_match(argv, stdout, stderr)
      when "apply"          then cmd_apply(argv, stdout, stderr)
      when "fees"           then cmd_fees(argv, stdout, stderr)
      when "return-support" then cmd_return_support(argv, stdout, stderr)
      when "donate"         then cmd_donate(argv, stdout, stderr)
      else
        stderr.puts "Unknown command: #{command}"
        stderr.puts USAGE
        1
      end
    end

    def cmd_browse(argv, stdout, _stderr)
      species = nil
      OptionParser.new do |opts|
        opts.banner = "Usage: pawmatch browse [--species SPECIES]"
        opts.on("--species SPECIES", "Filter by species (dog|cat|rabbit|guinea-pig)") { |v| species = v }
      end.parse!(argv)

      matching = Pets.filter_by_species(species)
      if matching.empty?
        stdout.puts "No adoptable pets found for species '#{species}'."
        return 0
      end

      flags = Flags.build_registry
      ctx = context

      if flags.enabled?(Flags::LONG_STAY_HIGHLIGHT, ctx)
        long_stay = matching.select(&:long_stay?).sort_by { |p| -p.days_in_shelter }
        unless long_stay.empty?
          featured = long_stay.first
          stdout.puts "* Featured long-stay friend — please consider #{featured.name}!"
          stdout.puts
        end
      end

      style = flags.variant(Flags::PET_CARD_STYLE, ctx)
      matching.each { |pet| render_pet(pet, style, stdout) }
      0
    end

    def cmd_show(argv, stdout, stderr)
      slug = argv.shift
      if slug.nil?
        stderr.puts "Usage: pawmatch show <pet>"
        return 1
      end

      pet = Pets.find_by_slug(slug)
      if pet.nil?
        stderr.puts "Unknown pet '#{slug}'. Try 'pawmatch browse'."
        return 1
      end

      render_pet(pet, "detailed", stdout)
      stdout.puts "  Needs: #{pet.needs}"
      suffix = pet.long_stay? ? " (long-stay)" : ""
      stdout.puts "  Days in shelter: #{pet.days_in_shelter}#{suffix}"
      0
    end

    def cmd_match(argv, stdout, _stderr)
      preferences = {
        "has-kids"      => false,
        "quiet-home"    => false,
        "active"        => false,
        "first-time"    => false,
        "multiple-pets" => false,
        "small-home"    => false
      }
      OptionParser.new do |opts|
        opts.banner = "Usage: pawmatch match [preferences]"
        opts.on("--has-kids", "Family with children.") { preferences["has-kids"] = true }
        opts.on("--quiet-home", "Quiet, calm household.") { preferences["quiet-home"] = true }
        opts.on("--active", "Active, outdoor lifestyle.") { preferences["active"] = true }
        opts.on("--first-time", "First-time pet adopter.") { preferences["first-time"] = true }
        opts.on("--multiple-pets", "Other pets at home.") { preferences["multiple-pets"] = true }
        opts.on("--small-home", "Small home or apartment.") { preferences["small-home"] = true }
      end.parse!(argv)

      flags = Flags.build_registry
      ctx = context
      strategy = flags.variant(Flags::RECOMMENDATION_STRATEGY, ctx)
      depth = flags.variant(Flags::MATCH_QUIZ_DEPTH, ctx)
      factors = factors_for_depth(depth)

      wants = []
      factors.each do |factor, tags|
        next unless preferences[factor]

        wants.concat(tags)
      end

      stdout.puts "Strategy: #{strategy} • Quiz depth: #{depth} (#{factors.length} factor(s) considered)"
      if preferences.values.none?
        stdout.puts "(no preference flags provided — try --has-kids --quiet-home --active --first-time)"
      end
      stdout.puts

      ranked =
        case strategy
        when "popularity"
          Pets::ALL.sort_by { |p| -p.tags.count { |t| POPULARITY_TAGS.include?(t) } }
        when "longest-stay"
          Pets::ALL.sort_by { |p| -p.days_in_shelter }
        else
          Pets::ALL.sort_by { |p| -p.tags.count { |t| wants.include?(t) } }
        end

      ranked.first(3).each do |pet|
        stdout.puts "  • #{pet.name} (#{pet.breed}, #{pet.age_years}y) — #{pet.tags.join(', ')}"
      end

      stdout.puts
      stdout.puts "Adoption is a conversation — book a meet-and-greet to see if it's a fit."
      0
    end

    def cmd_apply(argv, stdout, stderr)
      slug = argv.shift
      if slug.nil?
        stderr.puts "Usage: pawmatch apply <pet>"
        return 1
      end

      pet = Pets.find_by_slug(slug)
      if pet.nil?
        stderr.puts "Unknown pet '#{slug}'. Try 'pawmatch browse'."
        return 1
      end

      stdout.puts "Adoption application for #{pet.name}"
      stdout.puts
      stdout.puts "Next steps:"
      stdout.puts "  1. Application reviewed by an adoption counselor (1-2 days)."
      stdout.puts "  2. Meet-and-greet scheduled at the shelter."
      stdout.puts "  3. 48-hour reflection period before finalizing."
      stdout.puts "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip."

      flags = Flags.build_registry
      ctx = context
      if flags.enabled?(Flags::HOME_CHECK_FOLLOWUP, ctx)
        stdout.puts "  5. Two-week follow-up check from a counselor to see how you're settling in."
      end

      stdout.puts
      stdout.puts "Returns are always accepted, no questions asked."

      if flags.enabled?(Flags::SUGGEST_DONATE_AFTER_ADOPTION, ctx)
        stdout.puts
        stdout.puts "If #{pet.name} brings you joy, please consider donating to a shelter:"
        stdout.puts "  pawmatch donate"
      end

      0
    end

    def cmd_fees(_argv, stdout, _stderr)
      flags = Flags.build_registry
      ctx = context

      stdout.puts "Adoption fees"
      stdout.puts
      if flags.enabled?(Flags::FEE_BREAKDOWN_DETAILED, ctx)
        stdout.puts "  Dog adoption — $150 total:"
        stdout.puts "    $60   spay / neuter surgery"
        stdout.puts "    $45   core vaccinations"
        stdout.puts "    $25   microchip and registration"
        stdout.puts "    $20   intake exam and deworming"
        stdout.puts
        stdout.puts "  Cat adoption — $90 total:"
        stdout.puts "    $50   spay / neuter surgery"
        stdout.puts "    $25   core vaccinations"
        stdout.puts "    $15   microchip and registration"
        stdout.puts
        stdout.puts "  Small animal — $35 total (intake exam + microchip)."
      else
        stdout.puts "  Dog adoption           $150"
        stdout.puts "  Cat adoption            $90"
        stdout.puts "  Small animal            $35"
        stdout.puts
        stdout.puts "  Fees cover spay/neuter, vaccines, and microchip."
      end

      stdout.puts
      stdout.puts "No one is turned away for inability to pay — ask about our subsidy fund."
      0
    end

    def cmd_return_support(_argv, stdout, _stderr)
      stdout.puts "Return support"
      stdout.puts
      stdout.puts "If your adoption isn't working out, we're here to help."
      stdout.puts "  • Free behavior consultation with our trainers."
      stdout.puts "  • No-judgment returns at any time — your pet stays in our care."
      stdout.puts "  • Connections to low-cost vet and food assistance programs."
      stdout.puts
      stdout.puts "Returning a pet is not a failure. Reach out as soon as you'd like support."
      0
    end

    def cmd_donate(argv, stdout, stderr)
      focus = nil
      open_flag = false
      parser = OptionParser.new do |opts|
        opts.banner = "Usage: pawmatch donate [<slug>] [--focus FOCUS] [--open]"
        opts.on("--focus FOCUS", "Charity focus (all|shelters|rescue|policy)") { |v| focus = v }
        opts.on("--open", "Open the charity's donation URL in a browser") { open_flag = true }
      end
      parser.parse!(argv)
      charity_slug = argv.shift

      flags = Flags.build_registry
      ctx = context
      default_focus = flags.variant(Flags::DONATE_FOCUS_DEFAULT, ctx)
      effective_focus = focus || default_focus
      show_ratings = flags.enabled?(Flags::SHOW_CHARITY_RATINGS, ctx)

      if charity_slug
        target = Charities.find_by_slug(charity_slug)
        if target.nil?
          stderr.puts "Unknown charity '#{charity_slug}'."
          return 1
        end

        return open_url(target.url, stdout, stderr) if open_flag

        render_charity(target, show_ratings, stdout)
        return 0
      end

      listing = Charities.filter_by_focus(effective_focus)
      stdout.puts "Animal-welfare charities (focus: #{effective_focus})"
      stdout.puts
      listing.each do |c|
        render_charity(c, show_ratings, stdout)
        stdout.puts
      end

      stdout.puts Charities::DISCLAIMER
      stdout.puts "Ratings hidden — set show-charity-ratings to surface them inline." unless show_ratings
      0
    end

    # ── helpers ──────────────────────────────────────────────────────

    def context
      { session_id: session_id }
    end

    def session_id
      Etc.getlogin || ENV["USER"] || ENV["USERNAME"] || "anonymous"
    rescue StandardError
      ENV["USER"] || ENV["USERNAME"] || "anonymous"
    end

    def factors_for_depth(depth)
      take =
        case depth
        when "short"    then 2
        when "thorough" then 6
        else                 4
        end
      ALL_FACTORS.first(take)
    end

    def render_pet(pet, style, stdout)
      long_stay_badge = pet.long_stay? ? " *" : ""
      case style
      when "compact"
        stdout.puts format(
          "  %<slug>-10s %<name>-14s %<species>-10s %<age>dy%<badge>s",
          slug: pet.slug, name: pet.name, species: pet.species, age: pet.age_years, badge: long_stay_badge
        )
      when "playful"
        tag_phrase = pet.tags.join(" & ")
        stdout.puts "  paw #{pet.name}#{long_stay_badge} — a #{pet.age_years}-year-old " \
                    "#{pet.breed.downcase} who is #{tag_phrase}."
      else
        stdout.puts "  #{pet.name}#{long_stay_badge}  [#{pet.slug}]"
        stdout.puts "    #{pet.breed}, #{pet.age_years} years old"
        stdout.puts "    Tags: #{pet.tags.join(', ')}"
        stdout.puts
      end
    end

    def render_charity(charity, show_ratings, stdout)
      stdout.puts "  #{charity.name}  [#{charity.slug}]"
      stdout.puts "    Focus: #{charity.focus}"
      stdout.puts "    #{charity.description}"
      stdout.puts "    Donate: #{charity.url}"
      stdout.puts "    Rating: #{charity.rating_note}" if show_ratings
    end

    def open_url(url, _stdout, stderr)
      cmd =
        case RbConfig::CONFIG["host_os"]
        when /darwin/    then ["open", url]
        when /linux/     then ["xdg-open", url]
        when /mswin|mingw|cygwin/ then ["cmd", "/c", "start", "", url]
        end

      if cmd.nil?
        stderr.puts "Unable to open browser on this platform. URL: #{url}"
        return 1
      end

      Process.spawn(*cmd, out: File::NULL, err: File::NULL)
      0
    rescue StandardError => e
      stderr.puts "Unable to open browser (#{e.class}). URL: #{url}"
      1
    end
  end
end
