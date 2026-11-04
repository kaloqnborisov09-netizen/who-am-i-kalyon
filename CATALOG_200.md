# WHO AM I? — KALYON EDITION: 200-character catalog

The bundled `data/characters.json` now contains 200 curated entries. Each entry includes a stable ID, character name, franchise/title, category, subcategories, difficulty and accepted aliases.

## Artwork behaviour
- Anime character portraits and anime cover art are looked up from the public Jikan API (MyAnimeList-derived data).
- For Western animation, movies, TV, games and comics, the game makes a best-effort Wikimedia Commons image search for a character image and a separate title image.
- Artwork is loaded when a round opens, not all at once, to reduce requests and loading time.
- These public services can rate-limit requests or return no suitable image. In that case the game's image placeholder remains visible. The catalog contains 200 character records; it does not claim 200 locally stored or individually verified image files.

## Categories
The current 200 entries include anime and all five other game categories. Category counts are available by running:

```js
const counts = characters.reduce((out, item) => {
  out[item.category] = (out[item.category] || 0) + 1;
  return out;
}, {});
```

Images are loaded from their respective providers at runtime. Check each provider's terms and image-specific licenses before redistributing images or caching them permanently.
