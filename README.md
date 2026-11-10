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

## Installing without running the dev server

```sh
cd extensions/matheme
bunx ray build -e dist
```

Then run **Import Extension** from Raycast and select the `extensions/matheme` folder. The extension
stays installed until you import it again, so there is no `ray develop` process to keep alive after
every reboot. Repeat the two steps after pulling changes.

## Publishing to the Store

Store submission is a PR against [raycast/extensions](https://github.com/raycast/extensions) that
`ray publish` opens for you, so the requirements below have to be met before running it.

- A **public** git repository containing the extension
- `author` in `package.json` must be your **Raycast** account username, not the GitHub handle
- `license: MIT`, current `@raycast/api`, at least one `categories` entry
- A `package-lock.json` created with **npm** (Store CI builds with npm; `bun.lock` is not read)
- `README.md` in the extension folder when setup is non-trivial, plus optional `CHANGELOG.md`
- Screenshots captured with Raycast's **Capture Window** command (2000×1250 PNG, up to six)

```sh
cd extensions/matheme
npm install            # produces the package-lock.json the CI expects
bun run publish        # npx @raycast/api@latest publish
```

`matheme` itself is a local binary built from source, and Raycast review rejects extensions whose
binary dependency cannot be fetched from a trusted location with hash verification. Publishing the
binary (GitHub releases or a Homebrew tap) is the prerequisite for a Store release; until then the
import flow above is the supported way to run this extension.
