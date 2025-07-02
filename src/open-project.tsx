import { Action, ActionPanel, getPreferenceValues, List } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import fs from "node:fs/promises";
import path from "node:path";
import { useEffect, useState } from "react";
import os from "node:os";
import { Project, completedDays } from "./util/projects";

function YearDropdown({ years, onChange }: { years: number[]; onChange: (newYear: number) => void }) {
  return (
    <List.Dropdown
      tooltip="Select Year"
      storeValue={true}
      defaultValue="all"
      onChange={(val) => onChange(parseInt(val, 10))}
    >
      <List.Dropdown.Item key="all" title="All" value={"all"} />
      {years.map((year) => (
        <List.Dropdown.Item key={year} title={year.toString()} value={year.toString()} />
      ))}
    </List.Dropdown>
  );
}

const ignore = new Set([
  ".git/",
  ".gitignore",
  // Dependencies
  "node_modules/",
  // Build files
  "out/",
  "target/",
  "build/",
  // Caches
  ".pytest_cache/",
  "__pycache__/",
  ".mypy_cache/",
  // Editor folders
  ".vscode/",
  ".idea/",
  ".vim/",
  // Files
  ".DS_Store",
  "input.txt",
]);

async function getFileTreeString(dir: string, indent: string = ""): Promise<string> {
  const pairs = (await fs.readdir(dir, { withFileTypes: true }))
    .map((d) => [d, `${d.name}${d.isDirectory() ? "/" : ""}`] as const)
    .filter(([_, name]) => !ignore.has(name))
    .toSorted(([aD, aName], [bD, bName]) => {
      const aDir = aD.isDirectory();
      const bDir = bD.isDirectory();
      if (aDir && bDir) {
        return aName.localeCompare(bName);
      } else if (aDir) {
        return -1;
      } else if (bDir) {
        return 1;
      } else {
        return aName.localeCompare(bName);
      }
    });

  let treeString = "";
  for (const [i, [d, name]] of pairs.entries()) {
    const isLast = i === pairs.length - 1;

    treeString += `${indent}${isLast ? "└─ " : "├─ "}${name}\n`;

    if (d.isDirectory()) {
      const p = path.join(d.parentPath, d.name);
      treeString += await getFileTreeString(p, indent + (isLast ? "   " : "│  "));
    }
  }
  return treeString;
}

async function getTreeMarkdown(dir: string): Promise<string> {
  const tree = await getFileTreeString(dir);
  return "# Tree\n```\n" + tree + "```";
}

function formatDate(date: Date): string {
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `${datePart} at ${timePart}`;
}

function contractTilde(absolutePath: string): string {
  const homeDir = os.homedir();
  if (absolutePath.startsWith(homeDir)) {
    return "~" + absolutePath.substring(homeDir.length);
  }
  return absolutePath;
}

function ProjectMetadata(props: { day: Project; modified: Date; accessed: Date; created: Date }) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Metadata" />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Full Path" text={contractTilde(props.day.path)} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Created" text={formatDate(props.created)} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Modified" text={formatDate(props.modified)} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Last Opened" text={formatDate(props.accessed)} />
      <List.Item.Detail.Metadata.Separator />
    </List.Item.Detail.Metadata>
  );
}

function ProjectDetail({ day }: { day: Project }) {
  const { isLoading: treeIsLoading, data: tree } = useCachedPromise(getTreeMarkdown, [day.path]);
  const { isLoading: metadataIsLoading, data: metadata } = useCachedPromise(
    async (p) => {
      const stat = await fs.stat(p);
      return {
        modified: stat.mtime,
        accessed: stat.atime,
        created: stat.birthtime,
      };
    },
    [day.path],
  );

  const isLoading = treeIsLoading || metadataIsLoading;
  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={tree}
      metadata={!isLoading && metadata && <ProjectMetadata day={day} {...metadata} />}
    />
  );
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.OpenProject>();

  const { isLoading, data } = usePromise(completedDays, [preferences.projectDirectory]);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [items, setItems] = useState<[number, Project[]][]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Sort by year - we already sort by day within each year
  useEffect(() => {
    if (!data) {
      return;
    }

    let filtered: [number, Project[]][] | null = null;
    if (yearFilter) {
      filtered = [[yearFilter, data.get(yearFilter) ?? []]];
    }
    const values = filtered ?? Array.from(data.entries());
    values.sort((a, b) => b[0] - a[0]);
    setItems(values);
  }, [yearFilter, data]);

  return (
    <List
      filtering
      navigationTitle="Search projects"
      searchBarPlaceholder="Search for an Advent of Code project"
      searchBarAccessory=<YearDropdown years={items.map((it) => it[0])} onChange={setYearFilter} />
      isLoading={isLoading}
      onSelectionChange={setSelected}
      isShowingDetail
    >
      {items.map(([year, days]) => (
        <List.Section title={`Year ${year}`} key={year}>
          {days.map((day) => (
            <List.Item
              id={day.path}
              key={day.path}
              title={`${year}/${day.day}`}
              keywords={[`day ${day.day} ${year}`, `${year} day ${day.day}`, day.name]}
              icon={{ fileIcon: day.path }}
              subtitle={{ value: day.name, tooltip: "Project name" }}
              actions={
                <ActionPanel>
                  <Action.Open title="Open Project" target={day.path} application={preferences.openApp} />
                  <Action.OpenWith path={day.path} />
                </ActionPanel>
              }
              detail={selected == day.path && <ProjectDetail day={day} />}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
