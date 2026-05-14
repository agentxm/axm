/// Args-based CLI for PawMatch — community pet-adoption example.
library;

import 'dart:io';

import 'package:agentxm_example_tinyflags/agentxm_example_tinyflags.dart';
import 'package:args/command_runner.dart';

import 'charities.dart';
import 'flags.dart' as flags;
import 'match_preferences.dart';
import 'pets.dart';
import 'variants.dart';

const List<List<Object>> _allFactors = [
  ['has-kids', ['good-with-kids', 'gentle']],
  ['quiet-home', ['mellow', 'calm', 'solo', 'lap-cat']],
  ['active', ['high-energy', 'playful']],
  ['first-time', ['gentle', 'calm', 'low-energy']],
  ['multiple-pets', ['social']],
  ['small-home', ['lap-cat', 'solo', 'low-energy']],
];

const Set<String> _popularityTags = {
  'social',
  'good-with-kids',
  'calm',
  'mellow',
  'gentle',
};

String _sessionId() {
  final env = Platform.environment;
  final user = env['USER'] ?? env['USERNAME'] ?? env['LOGNAME'];
  if (user != null && user.isNotEmpty) return user;
  return 'anonymous';
}

FlagContext _context() => FlagContext(sessionId: _sessionId());

List<List<Object>> _factorsForDepth(MatchDepth depth) {
  final take = switch (depth) {
    MatchDepth.short => 2,
    MatchDepth.thorough => 6,
    _ => 4,
  };
  return _allFactors.sublist(0, take.clamp(0, _allFactors.length));
}

void _renderPet(Pet pet, PetCardStyle style, IOSink out) {
  final longStayBadge = pet.isLongStay ? ' ★' : '';
  switch (style) {
    case PetCardStyle.compact:
      final slug = pet.slug.padRight(10);
      final name = pet.name.padRight(14);
      final species = pet.species.padRight(10);
      out.writeln('  $slug $name $species ${pet.ageYears}y$longStayBadge');
    case PetCardStyle.playful:
      final tagPhrase = pet.tags.join(' & ');
      out.writeln(
        '  🐾 ${pet.name}$longStayBadge — a ${pet.ageYears}-year-old '
        '${pet.breed.toLowerCase()} who is $tagPhrase.',
      );
    case PetCardStyle.detailed:
      out.writeln('  ${pet.name}$longStayBadge  [${pet.slug}]');
      out.writeln('    ${pet.breed}, ${pet.ageYears} years old');
      out.writeln('    Tags: ${pet.tags.join(', ')}');
      out.writeln();
  }
}

void _renderCharity(Charity charity, bool showRatings, IOSink out) {
  out.writeln('  ${charity.name}  [${charity.slug}]');
  out.writeln('    Focus: ${charity.focus}');
  out.writeln('    ${charity.description}');
  out.writeln('    Donate: ${charity.url}');
  if (showRatings) {
    out.writeln('    Rating: ${charity.ratingNote}');
  }
}

int _openUrl(String url, IOSink err) {
  try {
    if (Platform.isMacOS) {
      Process.runSync('open', [url]);
    } else if (Platform.isLinux) {
      Process.runSync('xdg-open', [url]);
    } else if (Platform.isWindows) {
      Process.runSync('cmd', ['/c', 'start', '', url], runInShell: true);
    } else {
      err.writeln('Unable to open browser on this platform. URL: $url');
      return 1;
    }
    return 0;
  } on Exception catch (e) {
    err.writeln('Unable to open browser (${e.runtimeType}). URL: $url');
    return 1;
  }
}

/// Build the [CommandRunner] for the `pawmatch` CLI.
///
/// [out] and [err] default to `stdout` / `stderr` but can be replaced in
/// tests to capture output.
CommandRunner<int> buildRunner({IOSink? out, IOSink? err}) {
  final stdoutSink = out ?? stdout;
  final stderrSink = err ?? stderr;
  final runner = CommandRunner<int>(
    'pawmatch',
    'pawmatch — community pet adoption CLI.',
  )
    ..addCommand(_BrowseCommand(stdoutSink))
    ..addCommand(_ShowCommand(stdoutSink, stderrSink))
    ..addCommand(_MatchCommand(stdoutSink))
    ..addCommand(_ApplyCommand(stdoutSink, stderrSink))
    ..addCommand(_FeesCommand(stdoutSink))
    ..addCommand(_ReturnSupportCommand(stdoutSink))
    ..addCommand(_DonateCommand(stdoutSink, stderrSink));
  return runner;
}

class _BrowseCommand extends Command<int> {
  _BrowseCommand(this._out) {
    argParser.addOption(
      'species',
      help: 'Filter by species (dog|cat|rabbit|guinea-pig).',
    );
  }

  final IOSink _out;

  @override
  String get name => 'browse';

  @override
  String get description => 'Browse adoptable pets.';

  @override
  int run() {
    final results = argResults!;
    final species = results['species'] as String?;
    final matching = filterPetsBySpecies(species);
    if (matching.isEmpty) {
      _out.writeln("No adoptable pets found for species '$species'.");
      return 0;
    }

    final tf = flags.createFlags();
    final ctx = _context();
    if (tf.enabled(flags.longStayHighlight, ctx)) {
      final longStay = matching.where((p) => p.isLongStay).toList()
        ..sort((a, b) => b.daysInShelter.compareTo(a.daysInShelter));
      if (longStay.isNotEmpty) {
        final featured = longStay.first;
        _out.writeln(
          '★ Featured long-stay friend — please consider ${featured.name}!',
        );
        _out.writeln();
      }
    }

    final style = PetCardStyle.fromValue(tf.variant(flags.petCardStyle, ctx));
    for (final pet in matching) {
      _renderPet(pet, style, _out);
    }
    return 0;
  }
}

class _ShowCommand extends Command<int> {
  _ShowCommand(this._out, this._err);

  final IOSink _out;
  final IOSink _err;

  @override
  String get name => 'show';

  @override
  String get description => 'Show details for a pet.';

  @override
  String get invocation => 'pawmatch show <pet>';

  @override
  int run() {
    final rest = argResults!.rest;
    if (rest.isEmpty) {
      _err.writeln("Missing pet slug. Try 'pawmatch browse'.");
      return 1;
    }
    final found = findPetBySlug(rest.first);
    if (found == null) {
      _err.writeln("Unknown pet '${rest.first}'. Try 'pawmatch browse'.");
      return 1;
    }

    _renderPet(found, PetCardStyle.detailed, _out);
    _out.writeln('  Needs: ${found.needs}');
    final suffix = found.isLongStay ? ' (long-stay)' : '';
    _out.writeln('  Days in shelter: ${found.daysInShelter}$suffix');
    return 0;
  }
}

class _MatchCommand extends Command<int> {
  _MatchCommand(this._out) {
    argParser
      ..addFlag('has-kids', help: 'Family with children.', negatable: false)
      ..addFlag('quiet-home', help: 'Quiet, calm household.', negatable: false)
      ..addFlag('active', help: 'Active, outdoor lifestyle.', negatable: false)
      ..addFlag('first-time', help: 'First-time pet adopter.', negatable: false)
      ..addFlag('multiple-pets', help: 'Other pets at home.', negatable: false)
      ..addFlag('small-home', help: 'Small home or apartment.', negatable: false);
  }

  final IOSink _out;

  @override
  String get name => 'match';

  @override
  String get description => 'Match pets to your lifestyle.';

  @override
  int run() {
    final r = argResults!;
    final preferences = MatchPreferences(
      hasKids: r['has-kids'] as bool,
      quietHome: r['quiet-home'] as bool,
      active: r['active'] as bool,
      firstTime: r['first-time'] as bool,
      multiplePets: r['multiple-pets'] as bool,
      smallHome: r['small-home'] as bool,
    );

    final tf = flags.createFlags();
    final ctx = _context();
    final strategy = MatchStrategy.fromValue(
      tf.variant(flags.recommendationStrategy, ctx),
    );
    final depth = MatchDepth.fromValue(tf.variant(flags.matchQuizDepth, ctx));
    final factors = _factorsForDepth(depth);
    final userFlags = preferences.toFlagSet();
    final wants = <String>{};
    for (final factor in factors) {
      final factorFlag = factor[0] as String;
      final tags = factor[1] as List<String>;
      if (!userFlags.contains(factorFlag)) continue;
      wants.addAll(tags);
    }

    _out.writeln(
      'Strategy: ${strategy.value} • Quiz depth: ${depth.value} '
      '(${factors.length} factor(s) considered)',
    );
    if (preferences.isEmpty) {
      _out.writeln(
        '(no preference flags provided — try --has-kids --quiet-home --active --first-time)',
      );
    }
    _out.writeln();

    List<Pet> ranked;
    switch (strategy) {
      case MatchStrategy.popularity:
        ranked = [...allPets]..sort(
          (a, b) => _popularityCount(b).compareTo(_popularityCount(a)),
        );
      case MatchStrategy.longestStay:
        ranked = [...allPets]
          ..sort((a, b) => b.daysInShelter.compareTo(a.daysInShelter));
      case MatchStrategy.matchQuiz:
        ranked = [...allPets]..sort(
          (a, b) => _wantMatches(b, wants).compareTo(_wantMatches(a, wants)),
        );
    }

    for (final pet in ranked.take(3)) {
      _out.writeln(
        '  • ${pet.name} (${pet.breed}, ${pet.ageYears}y) — ${pet.tags.join(', ')}',
      );
    }

    _out.writeln();
    _out.writeln(
      "Adoption is a conversation — book a meet-and-greet to see if it's a fit.",
    );
    return 0;
  }

  int _popularityCount(Pet pet) =>
      pet.tags.where(_popularityTags.contains).length;

  int _wantMatches(Pet pet, Set<String> wants) =>
      pet.tags.where(wants.contains).length;
}

class _ApplyCommand extends Command<int> {
  _ApplyCommand(this._out, this._err);

  final IOSink _out;
  final IOSink _err;

  @override
  String get name => 'apply';

  @override
  String get description => 'Start an adoption application.';

  @override
  String get invocation => 'pawmatch apply <pet>';

  @override
  int run() {
    final rest = argResults!.rest;
    if (rest.isEmpty) {
      _err.writeln("Missing pet slug. Try 'pawmatch browse'.");
      return 1;
    }
    final found = findPetBySlug(rest.first);
    if (found == null) {
      _err.writeln("Unknown pet '${rest.first}'. Try 'pawmatch browse'.");
      return 1;
    }

    _out.writeln('Adoption application for ${found.name}');
    _out.writeln();
    _out.writeln('Next steps:');
    _out.writeln(
      '  1. Application reviewed by an adoption counselor (1–2 days).',
    );
    _out.writeln('  2. Meet-and-greet scheduled at the shelter.');
    _out.writeln('  3. 48-hour reflection period before finalizing.');
    _out.writeln(
      '  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.',
    );

    final tf = flags.createFlags();
    final ctx = _context();
    if (tf.enabled(flags.homeCheckFollowup, ctx)) {
      _out.writeln(
        "  5. Two-week follow-up check from a counselor to see how you're settling in.",
      );
    }

    _out.writeln();
    _out.writeln('Returns are always accepted, no questions asked.');

    if (tf.enabled(flags.suggestDonateAfterAdoption, ctx)) {
      _out.writeln();
      _out.writeln(
        'If ${found.name} brings you joy, please consider donating to a shelter:',
      );
      _out.writeln('  pawmatch donate');
    }
    return 0;
  }
}

class _FeesCommand extends Command<int> {
  _FeesCommand(this._out);

  final IOSink _out;

  @override
  String get name => 'fees';

  @override
  String get description => 'Show adoption fees.';

  @override
  int run() {
    _out.writeln('Adoption fees');
    _out.writeln();
    final tf = flags.createFlags();
    final ctx = _context();
    if (tf.enabled(flags.feeBreakdownDetailed, ctx)) {
      _out.writeln('  Dog adoption — \$150 total:');
      _out.writeln('    \$60   spay / neuter surgery');
      _out.writeln('    \$45   core vaccinations');
      _out.writeln('    \$25   microchip and registration');
      _out.writeln('    \$20   intake exam and deworming');
      _out.writeln();
      _out.writeln('  Cat adoption — \$90 total:');
      _out.writeln('    \$50   spay / neuter surgery');
      _out.writeln('    \$25   core vaccinations');
      _out.writeln('    \$15   microchip and registration');
      _out.writeln();
      _out.writeln('  Small animal — \$35 total (intake exam + microchip).');
    } else {
      _out.writeln('  Dog adoption           \$150');
      _out.writeln('  Cat adoption            \$90');
      _out.writeln('  Small animal            \$35');
      _out.writeln();
      _out.writeln('  Fees cover spay/neuter, vaccines, and microchip.');
    }

    _out.writeln();
    _out.writeln(
      'No one is turned away for inability to pay — ask about our subsidy fund.',
    );
    return 0;
  }
}

class _ReturnSupportCommand extends Command<int> {
  _ReturnSupportCommand(this._out);

  final IOSink _out;

  @override
  String get name => 'return-support';

  @override
  String get description => 'Return support information.';

  @override
  int run() {
    _out.writeln('Return support');
    _out.writeln();
    _out.writeln("If your adoption isn't working out, we're here to help.");
    _out.writeln('  • Free behavior consultation with our trainers.');
    _out.writeln(
      '  • No-judgment returns at any time — your pet stays in our care.',
    );
    _out.writeln(
      '  • Connections to low-cost vet and food assistance programs.',
    );
    _out.writeln();
    _out.writeln(
      "Returning a pet is not a failure. Reach out as soon as you'd like support.",
    );
    return 0;
  }
}

class _DonateCommand extends Command<int> {
  _DonateCommand(this._out, this._err) {
    argParser
      ..addOption(
        'focus',
        help: 'Charity focus (all|shelters|rescue|policy).',
      )
      ..addFlag(
        'open',
        help: "Open the charity's donation URL in a browser.",
        negatable: false,
      );
  }

  final IOSink _out;
  final IOSink _err;

  @override
  String get name => 'donate';

  @override
  String get description => 'Browse animal-welfare charities to support.';

  @override
  String get invocation => 'pawmatch donate [<charity-slug>]';

  @override
  int run() {
    final r = argResults!;
    final focus = r['focus'] as String?;
    final openFlag = r['open'] as bool;
    final rest = r.rest;

    final tf = flags.createFlags();
    final ctx = _context();
    final defaultFocus =
        DonateFocus.fromValue(tf.variant(flags.donateFocusDefault, ctx));
    final effectiveFocus = focus ?? defaultFocus.value;
    final showRatings = tf.enabled(flags.showCharityRatings, ctx);

    if (rest.isNotEmpty) {
      final slug = rest.first;
      final target = findCharityBySlug(slug);
      if (target == null) {
        _err.writeln("Unknown charity '$slug'.");
        return 1;
      }
      if (openFlag) {
        return _openUrl(target.url, _err);
      }
      _renderCharity(target, showRatings, _out);
      return 0;
    }

    final listing = filterCharitiesByFocus(effectiveFocus);
    _out.writeln('Animal-welfare charities (focus: $effectiveFocus)');
    _out.writeln();
    for (final entry in listing) {
      _renderCharity(entry, showRatings, _out);
      _out.writeln();
    }

    _out.writeln(charityDisclaimer);
    if (!showRatings) {
      _out.writeln(
        'Ratings hidden — set show-charity-ratings to surface them inline.',
      );
    }
    return 0;
  }
}

/// Run the CLI with the given arguments. Returns the process exit code.
Future<int> runCli(List<String> args) async {
  final runner = buildRunner();
  try {
    final result = await runner.run(args);
    return result ?? 0;
  } on UsageException catch (e) {
    stderr.writeln(e);
    return 64;
  }
}
