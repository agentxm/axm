/// Questionnaire preferences expressed as flags on an immutable record.
library;

final class MatchPreferences {
  const MatchPreferences({
    this.hasKids = false,
    this.quietHome = false,
    this.active = false,
    this.firstTime = false,
    this.multiplePets = false,
    this.smallHome = false,
  });

  final bool hasKids;
  final bool quietHome;
  final bool active;
  final bool firstTime;
  final bool multiplePets;
  final bool smallHome;

  bool get isEmpty =>
      !hasKids &&
      !quietHome &&
      !active &&
      !firstTime &&
      !multiplePets &&
      !smallHome;

  Set<String> toFlagSet() {
    final result = <String>{};
    if (hasKids) result.add('has-kids');
    if (quietHome) result.add('quiet-home');
    if (active) result.add('active');
    if (firstTime) result.add('first-time');
    if (multiplePets) result.add('multiple-pets');
    if (smallHome) result.add('small-home');
    return result;
  }
}
