import { Action, ActionPanel, getPreferenceValues, List } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import fs from "node:fs/promises";
import path from "node:path";
import { useEffect, useState } from "react";
import os from "node:os";
import { Project, completedDays } from "./util/projects";
import ignore, { Ignore } from "ignore";
import { Dirent } from "node:fs";

interface YearDropdownProps {
  /** Years to show in the dropdown */
  years: number[];
  /** Callback to trigger when the dropdown's selected year changes */
  onChange: (newYear: number) => void;
}

function YearDropdown({ years, onChange }: YearDropdownProps) {
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

/**
 * Sort a and b, placing directories earlier and breaking any ties by lexicographic order.
 * @param a - file or directory in a tree
 * @param b - file or directory in a tree
 * @returns a negative number if a is smaller than b, 0 if they are equal, or a
 * positive number b is greater than a
 */
function sortTreeEntries(a: Dirent, b: Dirent): number {
  const aDir = a.isDirectory();
  const bDir = b.isDirectory();
  if (aDir && !bDir) {
    return -1;
  } else if (!aDir && bDir) {
    return 1;
  } else {
    return a.name.localeCompare(b.name);
  }
}

/**
 * @param dir - directory to convert to a tree
 * @param baseIgnore - files to ignore, regardless of path (from extension preferences)
 * @param ignores - the ignores we've built up from recursing through
 * directories. Includes the patterns and the directory they were found in, so
 * we can test paths relative to that directory.
 * @param indent - the current indent characters, built through recursion
 * @returns tree string starting from the given directory
 */
async function getFileTreeString(
  dir: string,
  baseIgnore: Ignore,
  ignores: [Ignore, string][],
  respectGitignore: boolean,
  indent: string = "",
): Promise<string> {
  if (respectGitignore) {
    // Extent the ignore with the additional info
    try {
      const gitignorePath = path.join(dir, ".gitignore");
      await fs.access(gitignorePath, fs.constants.R_OK);
      const gitignoreContent = await fs.readFile(gitignorePath);
      ignores = [...ignores, [ignore().add(gitignoreContent.toString()), dir]];
    } catch {
      // There's no gitignore, so just carry on with base ignore rules
    }
  }

  const pairs = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(
      (d) =>
        // Always filter from bast ignore set
        !baseIgnore.ignores(d.name) &&
        // Also filter from set of ignores we've found while walking the tree
        // Paths need to be relative to the directory we found the ignore rules in
        !ignores.some(([ig, relativeTo]) => ig.ignores(path.relative(relativeTo, path.join(d.parentPath, d.name)))),
    )
    .toSorted(sortTreeEntries);

  let treeString = "";
  for (const [i, d] of pairs.entries()) {
    const isLast = i === pairs.length - 1;

    const name = `${d.name}${d.isDirectory() ? "/" : ""}`;
    treeString += `${indent}${isLast ? "└─ " : "├─ "}${name}\n`;

    // Recursively add children to the tree string with the appropriate indent
    if (d.isDirectory()) {
      const p = path.join(d.parentPath, d.name);
      treeString += await getFileTreeString(
        p,
        baseIgnore,
        ignores,
        respectGitignore,
        indent + (isLast ? "   " : "│  "),
      );
    }
  }
  return treeString;
}

/**
 * @param dir - directory to convert to a tree
 * @returns a markdown string containing the tree for `dir`
 */
async function getTreeMarkdown(dir: string): Promise<string> {
  const preferences = getPreferenceValues<Preferences.OpenProject>();
  // Remove padding and trailing slashes, so we don't have to add them as we're testing files later
  const ignoreList = preferences.ignoreList.split(",").map((val) => val.trim().replace(/\/$/, ""));
  const baseIgnore = ignore().add(ignoreList);

  const tree = await getFileTreeString(dir, baseIgnore, [], preferences.respectGitignore);
  return "# Tree\n```\n" + tree + "```";
}

/**
 * Formats dates into a short form (according to locale) like "01/01 at 12:41pm".
 * @param date - date to format
 * @returns formatted version of date
 */
function formatDate(date: Date): string {
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `${datePart} at ${timePart}`;
}

/**
 * Replace the home directory portion of a path with `~`, if it is present.
 * @param absolutePath - absolute path to potentially contract
 * @returns the path, with the home directory portion replaced by `~` if found
 */
function contractTilde(absolutePath: string): string {
  const homeDir = os.homedir();
  if (absolutePath.startsWith(homeDir)) {
    return "~" + absolutePath.substring(homeDir.length);
  }
  return absolutePath;
}

interface ProjectMetadataProps {
  /** The project the metadata is for */
  project: Project;
  /** When the project folder was last modified */
  modified: Date;
  /** When the project folder was last accessed */
  accessed: Date;
  /** When the project folder was created */
  created: Date;
}

function ProjectMetadata(props: ProjectMetadataProps) {
  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Metadata" />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Full Path" text={contractTilde(props.project.path)} />
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
  // We have both promises here, because Metadata components don't have an
  // isLoading property (only the parent Detail component does)
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
      metadata={!isLoading && metadata && <ProjectMetadata project={day} {...metadata} />}
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
      navigationTitle="Search Projects"
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
