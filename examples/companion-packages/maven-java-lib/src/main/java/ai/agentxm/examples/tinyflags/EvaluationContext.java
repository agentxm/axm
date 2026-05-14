package ai.agentxm.examples.tinyflags;

import java.util.Optional;

/**
 * Identity attributes used to bucket a flag evaluation deterministically.
 *
 * <p>Pass a stable identifier ({@code userId}, {@code accountId}, or
 * {@code sessionId}) so a given caller receives stable rollout decisions.
 * Callers without any identifier share a single "anonymous" bucket.
 */
public record EvaluationContext(
        Optional<String> userId,
        Optional<String> accountId,
        Optional<String> sessionId) {

    /** An evaluation context with no identity attributes. */
    public static final EvaluationContext EMPTY = new EvaluationContext(
            Optional.empty(), Optional.empty(), Optional.empty());

    /** Returns a context with the given user id. */
    public static EvaluationContext ofUser(String userId) {
        return new EvaluationContext(Optional.of(userId), Optional.empty(), Optional.empty());
    }

    /** Returns a context with the given account id. */
    public static EvaluationContext ofAccount(String accountId) {
        return new EvaluationContext(Optional.empty(), Optional.of(accountId), Optional.empty());
    }

    /** Returns a context with the given session id. */
    public static EvaluationContext ofSession(String sessionId) {
        return new EvaluationContext(Optional.empty(), Optional.empty(), Optional.of(sessionId));
    }
}
