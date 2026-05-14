/// PawMatch — community pet-adoption CLI example.
library;

export 'src/cli.dart' show buildRunner, runCli;
export 'src/flags.dart';
export 'src/match_preferences.dart' show MatchPreferences;
export 'src/pets.dart' show Pet, allPets, findPetBySlug, filterPetsBySpecies;
export 'src/charities.dart'
    show
        Charity,
        allCharities,
        charityDisclaimer,
        findCharityBySlug,
        filterCharitiesByFocus;
export 'src/variants.dart'
    show DonateFocus, MatchDepth, MatchStrategy, PetCardStyle;
