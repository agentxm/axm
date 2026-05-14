// Lifestyle preferences collected by the `match` command's questionnaire.

import Foundation

struct MatchPreferences: Equatable {
    var hasKids = false
    var quietHome = false
    var active = false
    var firstTime = false
    var multiplePets = false
    var smallHome = false

    var isEmpty: Bool {
        !hasKids && !quietHome && !active && !firstTime && !multiplePets && !smallHome
    }

    func activeFlags() -> Set<String> {
        var flags = Set<String>()
        if hasKids { flags.insert("has-kids") }
        if quietHome { flags.insert("quiet-home") }
        if active { flags.insert("active") }
        if firstTime { flags.insert("first-time") }
        if multiplePets { flags.insert("multiple-pets") }
        if smallHome { flags.insert("small-home") }
        return flags
    }
}
