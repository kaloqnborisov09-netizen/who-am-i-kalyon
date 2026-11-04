# Character catalog and artwork

Each entry in `data/characters.json` stores:
- `name`: character name used for guesses
- `aliases`: accepted alternate names
- `franchise`: anime / show / movie / game / comic title used for title guesses
- `category`, `subcategory`, `difficulty`
- `image`: optional direct character image URL
- `franchiseImage`: optional direct series/poster image URL

For Anime entries, the prototype attempts to retrieve character portrait and anime poster from the public Jikan API (MyAnimeList-linked data) at round start. This is best-effort and may be rate-limited or unavailable. The game falls back to its stylized art panel when an image cannot load. For other categories, direct image URLs can be filled into the two image fields.

## Current data status

This package currently contains **90 entries (80 anime and 10 across other categories)**. This is an expanded starter catalog, **not the planned 4,000-character catalog**. Please do not advertise 4,000 as already included. The non-anime entries still need curated artwork sources. The full multiplayer secret assignment / synchronized game logic is also still in development.
