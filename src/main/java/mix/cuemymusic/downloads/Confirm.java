package mix.cuemymusic.downloads;

/**
 * One automatically matched song waiting for the player to say whether it's the
 * right one. The download thread waits until the Downloads page answers, or the
 * download is cancelled.
 */
final class Confirm {
    enum Decision { KEEP, SKIP, SKIP_ALL }

    /** The Spotify track and the YouTube match the player is checking. */
    record Match(String spotifyTitle, String spotifyArtist, int spotifySeconds,
            String youtubeTitle, String youtubeArtist, int youtubeSeconds, String youtubeUrl) {
    }

    private static Match pending;
    private static Decision decision;

    private Confirm() {
    }

    /** The match waiting for an answer, or null. */
    static synchronized Match pending() {
        return pending;
    }

    /** Shows {@code match} and waits for Keep, Skip or Skip all. */
    static synchronized Decision ask(Match match) throws InterruptedException {
        pending = match;
        decision = null;
        while (decision == null) Confirm.class.wait();
        pending = null;
        Decision answer = decision;
        decision = null;
        return answer;
    }

    static synchronized void keep() {
        answer(Decision.KEEP);
    }

    static synchronized void skip() {
        answer(Decision.SKIP);
    }

    static synchronized void skipAll() {
        answer(Decision.SKIP_ALL);
    }

    /** Lets the download thread go, so Cancel doesn't wait for an answer. */
    static synchronized void cancel() {
        answer(Decision.SKIP);
    }

    private static void answer(Decision answer) {
        decision = answer;
        Confirm.class.notifyAll();
    }
}
