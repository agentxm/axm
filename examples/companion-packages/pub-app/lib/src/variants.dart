/// Variant enums and kebab-case helpers.
library;

enum PetCardStyle {
  compact('compact'),
  detailed('detailed'),
  playful('playful');

  const PetCardStyle(this.value);
  final String value;

  static PetCardStyle fromValue(String value) {
    for (final v in PetCardStyle.values) {
      if (v.value == value) return v;
    }
    throw ArgumentError("Unknown PetCardStyle: '$value'");
  }
}

enum MatchStrategy {
  popularity('popularity'),
  matchQuiz('match-quiz'),
  longestStay('longest-stay');

  const MatchStrategy(this.value);
  final String value;

  static MatchStrategy fromValue(String value) {
    for (final v in MatchStrategy.values) {
      if (v.value == value) return v;
    }
    throw ArgumentError("Unknown MatchStrategy: '$value'");
  }
}

enum MatchDepth {
  short('short'),
  standard('standard'),
  thorough('thorough');

  const MatchDepth(this.value);
  final String value;

  static MatchDepth fromValue(String value) {
    for (final v in MatchDepth.values) {
      if (v.value == value) return v;
    }
    throw ArgumentError("Unknown MatchDepth: '$value'");
  }
}

enum DonateFocus {
  all('all'),
  shelters('shelters'),
  rescue('rescue'),
  policy('policy');

  const DonateFocus(this.value);
  final String value;

  static DonateFocus fromValue(String value) {
    for (final v in DonateFocus.values) {
      if (v.value == value) return v;
    }
    throw ArgumentError("Unknown DonateFocus: '$value'");
  }
}
