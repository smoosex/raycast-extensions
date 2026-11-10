import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { listThemes, SwitchReport, switchTheme, Theme } from "./lib/matheme";

type Filter = "all" | "dark" | "light";

const TYPE_LABEL: Record<string, string> = { dark: "暗", light: "亮" };

export default function Command() {
  const { push } = useNavigation();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, error, mutate } = useCachedPromise(listThemes, [], {
    keepPreviousData: true,
  });

  const themes = (data ?? []).filter(
    (theme) => filter === "all" || theme.type === filter,
  );

  async function apply(theme: Theme, options: { force?: boolean } = {}) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: options.force ? `重新应用 ${theme.name}` : `切换到 ${theme.name}`,
    });

    try {
      const report = await switchTheme(theme.name, options.force);
      const failed = report.targets.filter(
        (target) => !target.skipped && !target.ok,
      );
      const applied = report.targets.filter(
        (target) => !target.skipped && target.ok,
      );

      if (report.ok) {
        toast.style = Toast.Style.Success;
        toast.title = report.changed
          ? `已切换到 ${theme.name}`
          : `${theme.name} 已是当前主题`;
        toast.message = report.changed
          ? `${applied.length} 个目标已更新`
          : undefined;
      } else {
        // The theme itself landed, only some target complained, so say so instead of implying the
        // switch did nothing.
        toast.style = Toast.Style.Failure;
        toast.title = `${theme.name} 已应用，${failed.length} 个目标失败`;
        toast.message = [
          ...failed.map((target) => target.name),
          ...(report.chezmoi.ok ? [] : ["chezmoi"]),
        ].join("、");
        toast.primaryAction = {
          title: "查看详情",
          onAction: () =>
            push(
              <ReportDetail
                report={report}
                onRetry={() => apply(theme, { force: true })}
              />,
            ),
        };
      }

      await mutate();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "切换失败";
      toast.message = caught instanceof Error ? caught.message : String(caught);
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="搜索主题"
      searchBarAccessory={
        <List.Dropdown
          tooltip="类型"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
        >
          <List.Dropdown.Item title="全部" value="all" />
          <List.Dropdown.Item title="暗色" value="dark" />
          <List.Dropdown.Item title="亮色" value="light" />
        </List.Dropdown>
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="无法读取主题"
          description={error.message}
        />
      ) : (
        themes.map((theme) => (
          <List.Item
            key={theme.name}
            title={theme.name}
            subtitle={theme.error}
            icon={{ source: Icon.CircleFilled, tintColor: theme.accent }}
            accessories={[
              ...(theme.type
                ? [{ tag: { value: TYPE_LABEL[theme.type] ?? theme.type } }]
                : []),
              ...(theme.accent ? [{ tag: theme.accent.toUpperCase() }] : []),
              ...(theme.current
                ? [{ icon: Icon.CheckCircle, tooltip: "当前主题" }]
                : []),
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="切换到此主题"
                  icon={Icon.Switch}
                  onAction={() => apply(theme)}
                />
                <Action
                  title="强制重新应用"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                  onAction={() => apply(theme, { force: true })}
                />
                <Action.ShowInFinder
                  path={theme.path}
                  title="在 Finder 中显示主题文件"
                />
                <Action.CopyToClipboard
                  content={theme.accent}
                  title="复制强调色"
                />
                <Action.CopyToClipboard
                  content={theme.name}
                  title="复制主题名"
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function ReportDetail({
  report,
  onRetry,
}: {
  report: SwitchReport;
  onRetry: () => void;
}) {
  const rows = report.targets.map((target) => {
    const status = target.skipped ? "跳过" : target.ok ? "成功" : "失败";
    return `| ${target.name} | ${status} | ${target.error ?? ""} |`;
  });

  const chezmoi = report.chezmoi.skipped
    ? "跳过"
    : report.chezmoi.ok
      ? `已同步 ${report.chezmoi.files} 个文件`
      : (report.chezmoi.error ?? "失败");

  const markdown = [
    `# ${report.theme}`,
    report.error ? `> ${report.error}` : "",
    "| 目标 | 结果 | 错误 |",
    "| --- | --- | --- |",
    ...rows,
    "",
    `- chezmoi：${chezmoi}`,
    `- 状态文件：${report.stateWritten ? "已写入" : "未写入，重试时会重新应用"}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="重试（强制重新应用）"
            icon={Icon.ArrowClockwise}
            onAction={onRetry}
          />
          <Action.CopyToClipboard content={markdown} title="复制报告" />
        </ActionPanel>
      }
    />
  );
}
