# WHO AM I? — Kalyon Edition

A responsive starter build for the character-guessing game. It includes a solo-mode interface, category/subcategory selection, a starter character file, and a first Firebase room/lobby connection.

**Branding:** WHO AM I? — Created & built by ChatGPT · Thought up by Kalyon

## Important: what this build does and does not do

Included now:
- Responsive dark purple/blue game interface
- Solo character selection from the included starter data
- Six main categories and subcategory filters
- Room creation/joining with a six-character code
- Anonymous Firebase sign-in and a live room lobby/player list
- Basic chat write action for room messages
- Character/title guess inputs and scoring feedback

Not finished yet:
- The requested 2,000 Anime + 2,000 other characters (this package currently has a small starter list, not 4,000)
- Real character portraits/posters for the whole collection
- Host start/kick/settings controls, synchronized secret assignments, synchronized YES/NEITHER/NO voting, turn/round state, and secure server-side scoring
- Full reconnect/rematch/statistics/modes and anti-cheat protections

This is an honest first development build, not yet a complete production-ready multiplayer game. Do not invite people to rely on it for a full match yet.

## Firebase setup (free Spark plan)

1. In Firebase Console, open your project `who-am-i-kalyon`.
2. Go to **Build → Authentication → Sign-in method** and enable **Anonymous**.
3. Go to **Build → Firestore Database** and create a database. Choose a nearby region. You do not need to upgrade to a paid plan for this starter.
4. Open the Firestore **Rules** tab and paste the contents of `firestore.rules`, then publish.
5. Keep `firebase-config.js` in the project. Firebase web config is visible to website visitors by design; never put a service-account key or password in it.

**Security warning:** The included Firestore rules are development rules. They allow any signed-in anonymous player to read/update room documents. This is not secure enough for a public competitive game. Before a public launch, the room rules and scoring need to be redesigned and tested to prevent cheating.

## Publish using GitHub Pages

1. Open your GitHub repository `who-am-i-kalyon`.
2. Upload all files and folders from this package into the repository root (keep `data/characters.json` inside the `data` folder).
3. In the repository, open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**, branch **main**, folder **/(root)**, then Save.
5. Wait for GitHub Pages to publish the site. GitHub will show the website address in the Pages section.

If the repository uses another default branch name, choose that branch instead.

## Adding the full character collection

The data format in `data/characters.json` is:
- `id`: unique stable ID
- `name`: character name
- `franchise`: series/title
- `category`: one of the six main categories
- `subcategory`: array of tags
- `difficulty`: Easy, Medium, or Hard
- `aliases`: accepted alternate names
- `image`: image URL (empty until a properly sourced image is added)

The target catalog is 4,000 total: **2,000 Anime + 2,000 across Western Animation, Movies, TV Shows, Video Games, and Comics**. This starter does not claim to contain that catalog yet. The large collection should be imported from reliable sources and checked for duplicates, correct categories, and image-use rights before being added.

## Character catalog update
The `data/characters.json` file now contains 200 curated character records with names, franchise/title, category, subcategories, difficulty and aliases. Artwork is loaded on demand: anime uses the public Jikan API; other categories use a best-effort Wikimedia Commons search. External image availability is not guaranteed, and placeholders are shown when no suitable image is found. See `CATALOG_200.md`.


## Free Solo character knowledge (no paid AI API)

Solo Mode now has a free encyclopedia lookup helper. It requests public English Wikipedia page summaries for the selected character and title, caches results for the current browser session, and only returns short source-based sentences. It does not use a paid AI model or require an API key.

Important limitations:
- This is a free knowledge lookup, not a conversational large language model.
- Wikipedia summaries do not contain every detail (for example, exact hair or eye colour may be missing).
- If a fact is not found in the source text, the game says it cannot verify it rather than inventing an answer.
- The first lookup needs an internet connection. The lookup may fail if Wikipedia is unavailable or the browser blocks the request.
- Multiplayer chat and game logic are left as they were in the uploaded build.
