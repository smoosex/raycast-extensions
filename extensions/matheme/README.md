# Matheme for Raycast

Raycast front-end for [matheme](https://github.com/matheme/matheme): pick a base16 theme and apply it
to your terminals, editors, bar, window borders, input method, the macOS appearance and the desktop
wallpaper in one go.

The extension is a thin UI over the local `matheme` binary — it does not reimplement any theming
logic, so the CLI and Raycast always agree.

## Requirements

- macOS
- A `matheme` build that supports `--json` (the commands below), see [Development](#development)
- The binary is **not** on `PATH`; the extension calls it by absolute path

## Commands

| Command | Mode | What it does |
| --- | --- | --- |
| Switch Theme | view | Lists themes with type and accent, marks the active one, applies on ↵ |
| Next Theme | no-view | Cycles to the next theme, handy with a hotkey |

## Settings

Everything configurable lives in the extension settings page — Raycast → Extensions → Matheme → the
gear icon. There is deliberately no "configure" command.

| Group | Preferences |
| --- | --- |
| 运行环境 | matheme binary path, PATH for its child processes |
| 全局开关 | chezmoi sync, wallpaper, macOS appearance |
| 集成开关 | Neovim, Alacritty, Ghostty, Kitty, Tmux, Starship, SketchyBar, Herdr, opencode, pi, Rime, Borders |
| 路径 | The file each integration writes, 14 fields |

Raycast stores those values itself, while the binary reads `~/.config/matheme/config.toml`, so the
extension reconciles them before every switch: it reads `matheme config --json`, pushes only the keys
that differ through `matheme config set`, and then switches. Editing a managed key by hand in
`config.toml` is therefore pointless — the settings page wins on the next switch. Keys the page does
not own (`wallpaper.wallpapers.*`, `[chezmoi]` extras) stay hand-edited.

A blank path field means "leave this path alone" rather than "unset it".

The PATH preference exists because Raycast starts commands with the launchd `PATH`. `matheme` spawns
`chezmoi`, `sketchybar`, `nvim` and friends by bare name, so without Homebrew on `PATH` a switch
would apply the theme files and then fail to sync them into the dotfiles.

## How failures are surfaced

`matheme switch --json` reports one result per target and exits non-zero when a target fails. The
extension shows the failing target names in the toast and pushes a detail view with the full table
and a retry action.

The recorded theme is written as soon as the theme actually landed on at least one target, so a
single unhappy integration no longer leaves the UI claiming the old theme is still active. A failed
target is reported, `ok` stays false, and the next run re-applies everything; a switch that recorded
nothing can be retried with `--force` (⌘⇧↵ in the list).

## Development

```sh
bun install
bun run dev            # ray develop
bun run build          # one-off bundle
bun run icon           # regenerate assets/extension-icon.png
```

Point the `matheme Binary` preference at a fresh build:

```sh
cd ~/Documents/Code/mine/matheme
go build -o ~/.config/matheme/bin/matheme .
```
