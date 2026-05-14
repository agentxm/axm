package ai.agentxm.examples.pawmatch;

import java.util.LinkedHashSet;
import java.util.Set;

/** User-supplied preferences for the {@code match} command. */
public record MatchPreferences(
        boolean hasKids,
        boolean quietHome,
        boolean active,
        boolean firstTime,
        boolean multiplePets,
        boolean smallHome) {

    public static final MatchPreferences EMPTY =
            new MatchPreferences(false, false, false, false, false, false);

    public Set<String> activeFlags() {
        Set<String> flags = new LinkedHashSet<>();
        if (hasKids) flags.add("has-kids");
        if (quietHome) flags.add("quiet-home");
        if (active) flags.add("active");
        if (firstTime) flags.add("first-time");
        if (multiplePets) flags.add("multiple-pets");
        if (smallHome) flags.add("small-home");
        return flags;
    }

    public boolean isEmpty() {
        return !hasKids && !quietHome && !active && !firstTime && !multiplePets && !smallHome;
    }
}
