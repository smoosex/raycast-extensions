import { getPreferenceValues } from "@raycast/api";
import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";

// Raycast child processes get the launchd PATH, which has no Homebrew directory. matheme spawns
// chezmoi, sketchybar and friends by bare name, so the PATH has to be provided explicitly.
const DEFAULT_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const DEFAULT_BINARY = "~/.config/matheme/bin/matheme";
const TIMEOUT_MS = 60_000;

interface MathemePreferences {
  mathemePath: string;
  shellPath?: string;
}

interface ConfigField {
  pref: string;
  key: string;
  kind: "boolean" | "string";
}

// The settings page is the only place config is edited, but the binary reads config.toml, so the
// two are reconciled before every switch. Only the keys listed here are owned by the settings
// page; everything else in config.toml (wallpaper.wallpapers, the rest) stays hand-edited.
const CONFIG_FIELDS: ConfigField[] = [
  { pref: "chezmoiEnable", key: "chezmoi.enable", kind: "boolean" },
  { pref: "wallpaperAuto", key: "wallpaper.auto", kind: "boolean" },
  {
    pref: "macosAppearanceEnable",
    key: "macos_system_appearance.enable",
    kind: "boolean",
  },
  { pref: "neovimEnable", key: "neovim.enable", kind: "boolean" },
  { pref: "alacrittyEnable", key: "alacritty.enable", kind: "boolean" },
  { pref: "ghosttyEnable", key: "ghostty.enable", kind: "boolean" },
  { pref: "kittyEnable", key: "kitty.enable", kind: "boolean" },
  { pref: "tmuxEnable", key: "tmux.enable", kind: "boolean" },
  { pref: "starshipEnable", key: "starship.enable", kind: "boolean" },
  { pref: "sketchybarEnable", key: "sketchybar.enable", kind: "boolean" },
  { pref: "herdrEnable", key: "herdr.enable", kind: "boolean" },
  { pref: "opencodeEnable", key: "opencode.enable", kind: "boolean" },
  { pref: "piEnable", key: "pi.enable", kind: "boolean" },
  { pref: "rimeEnable", key: "rime.enable", kind: "boolean" },
  { pref: "bordersEnable", key: "borders.enable", kind: "boolean" },
  {
    pref: "alacrittyConfigPath",
    key: "alacritty.config_path",
    kind: "string",
  },
  {
    pref: "alacrittyThemePath",
    key: "alacritty.theme_path",
    kind: "string",
  },
  { pref: "ghosttyThemePath", key: "ghostty.theme_path", kind: "string" },
  { pref: "kittyThemePath", key: "kitty.theme_path", kind: "string" },
  { pref: "neovimInitPath", key: "neovim.init_path", kind: "string" },
  { pref: "neovimChadrcPath", key: "neovim.chadrc_path", kind: "string" },
  {
    pref: "sketchybarThemePath",
    key: "sketchybar.theme_path",
    kind: "string",
  },
  { pref: "starshipConfigPath", key: "starship.config_path", kind: "string" },
  {
    pref: "tmuxSwitchScriptPath",
    key: "tmux.switch_script_path",
    kind: "string",
  },
  {
    pref: "tmuxCurrentThemePath",
    key: "tmux.current_theme_path",
    kind: "string",
  },
  { pref: "herdrConfigPath", key: "herdr.config_path", kind: "string" },
  { pref: "opencodeThemePath", key: "opencode.theme_path", kind: "string" },
  { pref: "piControlFilePath", key: "pi.control_file_path", kind: "string" },
  { pref: "rimeConfigDir", key: "rime.config_dir", kind: "string" },
];

export type ThemeType = "dark" | "light";

export interface Theme {
  name: string;
  type: ThemeType;
  accent: string;
  path: string;
  current: boolean;
  base16: Record<string, string>;
  error?: string;
}

export interface TargetResult {
  name: string;
  ok: boolean;
  skipped: boolean;
  error?: string;
}

export interface ChezmoiResult {
  enabled: boolean;
  ok: boolean;
  skipped: boolean;
  files: number;
  error?: string;
}

export interface SwitchReport {
  ok: boolean;
  theme: string;
  changed: boolean;
  dryRun?: boolean;
  planned?: string[];
  stateWritten: boolean;
  targets: TargetResult[];
  chezmoi: ChezmoiResult;
  error?: string;
}

export interface CurrentReport {
  theme: string;
  path: string;
  exists: boolean;
}

export interface ConfigReport {
  path: string;
  values: Record<string, string | number | boolean>;
}

function preferences(): MathemePreferences {
  return getPreferenceValues<MathemePreferences>();
}

export function binaryPath(): string {
  const configured = preferences().mathemePath?.trim() || DEFAULT_BINARY;
  return configured.startsWith("~")
    ? join(homedir(), configured.slice(1))
    : configured;
}

export function toolPath(): string {
  return preferences().shellPath?.trim() || DEFAULT_PATH;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(args: string[]): Promise<ExecResult> {
  const binary = binaryPath();

  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        env: { ...process.env, PATH: toolPath() },
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "string") {
          reject(
            new Error(
              error.code === "ENOENT"
                ? `找不到 matheme：${binary}\n请在扩展设置里改 "matheme Binary"`
                : `${error.message}\n${stderr.trim()}`,
            ),
          );
          return;
        }

        resolve({
          code: error && typeof error.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

/**
 * matheme prints its JSON report even when a target fails, so the payload is parsed regardless of
 * the exit code and only unparseable output becomes an exception.
 */
async function runJSON<T>(args: string[]): Promise<T> {
  const result = await exec([...args, "--json"]);
  const text = result.stdout.trim();

  if (!text) {
    throw new Error(result.stderr.trim() || `matheme 退出码 ${result.code}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`matheme 返回了无法解析的输出：${text.slice(0, 200)}`);
  }
}

export function listThemes(): Promise<Theme[]> {
  return runJSON<Theme[]>(["ls"]);
}

export function currentTheme(): Promise<CurrentReport> {
  return runJSON<CurrentReport>(["current"]);
}

export function readConfig(): Promise<ConfigReport> {
  return runJSON<ConfigReport>(["config"]);
}

export function switchTheme(
  name: string,
  force = false,
): Promise<SwitchReport> {
  return syncConfig().then(() =>
    runJSON<SwitchReport>([
      "switch",
      "-t",
      name,
      ...(force ? ["--force"] : []),
    ]),
  );
}

/**
 * Pushes anything the settings page disagrees with into config.toml and reports how many keys
 * changed, so a switch always runs against what the user last saw.
 */
export async function syncConfig(): Promise<number> {
  const prefs = getPreferenceValues() as Record<string, unknown>;
  const { values } = await readConfig();
  const changes: [string, string][] = [];

  for (const field of CONFIG_FIELDS) {
    if (field.kind === "boolean") {
      const want = prefs[field.pref] !== false;
      if (values[field.key] !== want) changes.push([field.key, String(want)]);
      continue;
    }

    const raw = prefs[field.pref];
    const want = typeof raw === "string" ? raw.trim() : "";
    // A blank field means "leave this path alone", not "unset it".
    if (want !== "" && want !== values[field.key]) {
      changes.push([field.key, want]);
    }
  }

  if (changes.length > 0) await writeConfig(changes);
  return changes.length;
}

export function writeConfig(
  changes: [string, string][],
): Promise<ConfigReport> {
  const assignments = changes.map(([key, value]) => `${key}=${value}`);
  return runJSON<ConfigReport>(["config", "set", ...assignments]);
}
