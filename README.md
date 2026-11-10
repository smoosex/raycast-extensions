# raycast-extensions

Personal Raycast extensions, developed together.

| Extension | What it does |
| --- | --- |
| [`extensions/matheme`](extensions/matheme) | Picks a base16 theme and applies it to terminals, editors, the bar, the system appearance and the wallpaper through the local `matheme` binary |

## Layout

Bun workspaces; every extension is a self-contained Raycast package under `extensions/` with its own
`package.json`, `tsconfig.json` and `eslint.config.js`. `node_modules` is hoisted to the root, which
`ray build` resolves normally.

```
extensions/
└── matheme/
    ├── package.json     # manifest: commands, preferences, icon
    ├── src/             # one file per command
    ├── assets/          # extension-icon.png + extension-icon@dark.png
    └── scripts/         # icon generator
```

## Development

```sh
bun install
bun run dev          # ray develop for extensions/matheme
bun run build        # build every extension
bun run lint         # lint every extension
```

## Install

```sh
git clone git@github.com:smoosex/raycast-extensions.git
cd raycast-extensions
bun install
cd extensions/matheme && bunx ray build -e dist
```

Then run **Import Extension** in Raycast and select `extensions/matheme` (pick the `dist` folder if
it asks for the built output). The extension then stays installed without a dev server running;
repeat the build and the import after pulling changes.

If a previous `ray develop` session registered the same extension, quit it first — both write to
`~/.config/raycast/extensions/matheme` and the last writer wins.

## Why this is not on the Store

Store review requires executable dependencies to come from a trusted location with hash
verification, and `matheme` is a Go binary built locally from source. Publishing it (GitHub releases
or a Homebrew tap) would be the prerequisite; until then the import flow above is the supported way
to install this extension.
