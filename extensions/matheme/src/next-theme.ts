import { Toast, showToast } from "@raycast/api";
import { currentTheme, listThemes, switchTheme } from "./lib/matheme";

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "寻找下一个主题",
  });

  try {
    const [themes, current] = await Promise.all([listThemes(), currentTheme()]);
    const names = themes
      .filter((theme) => !theme.error)
      .map((theme) => theme.name);

    if (names.length === 0) {
      throw new Error("没有可用主题");
    }

    const index = names.indexOf(current.theme);
    const next = names[(index + 1) % names.length];
    toast.title = `切换到 ${next}`;

    const report = await switchTheme(next);
    const failed = report.targets.filter(
      (target) => !target.skipped && !target.ok,
    );

    if (report.ok) {
      toast.style = Toast.Style.Success;
      toast.title = `已切换到 ${next}`;
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `${next} 未完全应用`;
      toast.message = [
        ...failed.map((target) => `${target.name}: ${target.error}`),
        report.error,
      ]
        .filter(Boolean)
        .join("\n");
    }
  } catch (caught) {
    toast.style = Toast.Style.Failure;
    toast.title = "切换失败";
    toast.message = caught instanceof Error ? caught.message : String(caught);
  }
}
