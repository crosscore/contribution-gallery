<div align="center">

# contribution-gallery

**A gallery of animations for your GitHub contribution graph — a Splatoon-style territory battle, plus six ambient scenes.**

<img src="docs/splatoon-dark.svg" alt="contribution-gallery demo" width="720" />

*Inspired by [Splatoon](https://en.wikipedia.org/wiki/Splatoon) — two AI snakes race across your contribution graph, painting territory and stealing each other's ground.*

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## What is this?

A GitHub Action that generates an animated SVG of two snakes battling for territory on your GitHub contribution graph — like a Splatoon ink battle.

Unlike the classic [Platane/snk](https://github.com/Platane/snk) (single snake eating cells), this project features:

- **Two competing snakes** — starting from opposite corners of the grid
- **Territory painting** — each snake claims cells in Hot Pink or Cyan
- **Competitive AI** — 9 heuristic factors + stagnation-aware ε-greedy exploration
- **Score display** — live territory percentage bar
- **Dark mode support** — separate palettes for light/dark themes

## How it Works

Each snake evaluates moves using a **multi-factor scoring system** that balances local efficiency with global exploration:

| Factor | Weight | Purpose |
|--------|--------|---------|
| Distance-decayed BFS | variable | Prioritize nearby unpainted cells |
| Frontier bonus | +15 | Reward painting fresh ground |
| Global compass | +10 | Head toward unexplored regions |
| Opponent avoidance | +10/−8 | Separate snakes for coverage |
| Escape route check | −5/−20 | Avoid dead-ends |
| Long-range navigation | +30/−10 | March toward nearest target when stuck |
| Loop detection | force random | Break positional cycles |
| Stagnation ε-greedy | 0.5%→15% | Increasing randomness when stuck |

This achieves **100% grid coverage** with natural variation in territory split.

**[→ Full algorithm documentation](docs/ALGORITHM.md)**

## ✨ Ambient Mode

An alternative renderer: six quiet, cell-based animation scenes rotate every minute on one seamless loop — no reset, no pause.

<img src="docs/ambient-dark.svg" alt="ambient mode demo" width="720" />

| Scene | Description |
|-------|-------------|
| 🌌 Aurora | A teal→blue→violet color field drifts across your active cells |
| 💧 Ripple | Waves radiate from your most active cells |
| 💓 Pulse | The graph breathes; amplitude follows contribution level |
| 🌧️ Rain | Light drops fall down each column at its own pace |
| ✨ Fireflies | Active cells glow in and out like fireflies |
| 🦠 Life | Conway's Game of Life seeded from your actual contributions |

The scene order is fully shuffled on every regeneration (seeded by generation date), and so are the random details — ripple origins, rain speeds, firefly picks. Five scenes are compact CSS keyframe loops (each cell only carries a phase offset), so the whole file stays around ~200 KB, roughly a third of the splatoon animation.

Enable it with `?mode=ambient` in the action outputs:

```yaml
outputs: |
  dist/ambient.svg?mode=ambient
  dist/ambient-dark.svg?palette=dark&mode=ambient
```

Or via CLI: `npx tsx src/cli.ts --user <name> --mode ambient [--dark]`

## Quick Start

```yaml
# .github/workflows/splatoon.yml
name: Generate Splatoon Animation

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: crosscore/contribution-gallery@v1
        with:
          github_user_name: ${{ github.repository_owner }}
          outputs: |
            dist/splatoon.svg
            dist/splatoon-dark.svg?palette=dark

      - uses: crazy-max/ghaction-github-pages@v4
        with:
          target_branch: output
          build_dir: dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Then add to your profile README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<user>/<user>/output/splatoon-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/<user>/<user>/output/splatoon.svg" />
  <img alt="contribution-gallery" src="https://raw.githubusercontent.com/<user>/<user>/output/splatoon-dark.svg" />
</picture>
```

## Customization

| Option | Default | Description |
|--------|---------|-------------|
| `color_snake_1` | `#E8006A` | Hot Pink — Snake 1 body |
| `color_snake_2` | `#008CC8` | Cyan — Snake 2 body |
| `color_trail_1` | `#FF85AA` | Light Pink — Snake 1 trail |
| `color_trail_2` | `#5DD4FF` | Light Cyan — Snake 2 trail |
| `speed` | `1` | Animation speed multiplier |
| `strategy` | `aggressive` | AI strategy: `aggressive`, `balanced`, `random` |

## Architecture

```
src/
├── fetcher/          # GitHub contribution graph API
├── solver/           # Snake AI — multi-factor heuristic scoring
│   └── index.ts      # chooseDirection(), BFS, loop detection
├── renderer/         # SVG animation generator
│   ├── grid.ts       # Contribution grid rendering
│   ├── animation.ts  # Keyframe animation engine (splatoon battle)
│   └── ambient.ts    # Ambient mode — six scenes rotating per minute
├── game/             # Game loop & territory logic
│   ├── engine.ts     # Turn-based simulation + stagnation tracking
│   ├── snake.ts      # Snake state & movement
│   └── territory.ts  # Score calculation
└── cli.ts            # Local dev entry point
```

## Development

```bash
npm install
npm run dev        # Local dev server with live preview
npm run build      # Build the GitHub Action
npm run test       # Run tests
```

## License

MIT

