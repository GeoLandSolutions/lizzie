# The Landlord's Game (1906)

A playable, browser-based recreation of Lizzie J. Magie's *The Landlord's Game* —
the anti-monopoly classic that became the ancestor of Monopoly — using the actual
1906 Economic Game Co. board art.

Built with **Node + TanStack Start + React 19 + Tailwind v4**.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Build / preview:

```bash
npm run build
npm run preview
```

Deploy to **https://lizzie.valuebase.ai/** (Cloudflare Workers, static assets):

```bash
bun install
bunx wrangler login    # Valuebase Cloudflare account
bun run deploy
```

Local Workers preview: `bun run preview:cf`

CI: pushes to `main` deploy via `.github/workflows/deploy.yml` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets).

## How it works

- **`public/board.jpg`** — the real antique board photograph. The game UI is an
  overlay layer on top of it; tokens, ownership tints, and house pips are
  positioned using per-square bounding boxes (normalized 0–1000, `[y1,x1,y2,x2]`)
  derived from a vision analysis of the photo. See `src/game/board.ts`.
- **`src/game/board.ts`** — all 40 squares (names, prices, rents, types) plus
  game constants.
- **`src/game/engine.ts`** — a pure-ish reducer holding every rule: dice & doubles,
  wages from Mother Earth, buying lots/railroads/utilities, scaling fares, rent,
  houses, the Chance deck, Absolute-Necessity taxes, Luxury, jail, bankruptcy,
  and end-game net-worth scoring.
- **`src/components/Board.tsx`** — the image + overlay renderer.
- **`src/routes/index.tsx`** — setup screen, sidebar, dice, ledger, and the
  property inspector.

## Rules implemented (per the 1906 EGC rules)

- 2–4 players start with $600 / $500 / $400 respectively.
- Move clockwise from **Mother Earth**; passing or landing on it draws **$100 wages**.
- Buy unowned lots, railroads, and utilities; pay **land rent** to owners.
- **Railroad fares** scale by count owned ($5 → $10 → $20 → $50). **Utilities**
  charge $5, or $25 if one player owns both ("municipal cinch").
- Build up to **3 houses** per lot at $100 each; each adds **$10** to the rent.
- **Absolute Necessities** (Food, Fuel, Clothing) cost $10. **Luxury** costs $75
  and is worth 100 points at the end.
- **No Trespassing** spaces (Hogg's Game Preserves & Lord Blueblood's Estate) send
  you to **Jail**; leave by rolling doubles or paying a $50 fine.
- **Chance** draws from a period-themed red deck.
- The game ends when a player has drawn wages **5 times**; the richest player
  (cash + holdings + houses + luxury cards) wins.
