import { Action, ActionPanel, getPreferenceValues, Icon, Image, List } from "@raycast/api";
import { getProgressIcon, usePromise } from "@raycast/utils";
import { API_URL, getStars, getStarsForYear } from "./util/api";
import { useState } from "react";

function passesFilter(stars: number, filter: string, maxStars: number): boolean {
  if (filter === "incomplete") {
    return stars < maxStars;
  } else if (filter === "complete") {
    return stars == maxStars;
  } else {
    return true;
  }
}
function icon(stars: number, maxStars: number): Image.Asset | Image {
  if (stars === 2) {
    return { source: Icon.CheckCircle, tintColor: "#ffff66" };
  } else {
    return getProgressIcon(stars / maxStars, "#ffff66");
  }
}

function Year({ year }: { year: number }) {
  const preferences = getPreferenceValues<Preferences.SubmitSolution>();

  const { isLoading, data } = usePromise(getStarsForYear, [year, preferences.sessionToken]);
  const [filter, setFilter] = useState("all");

  return (
    <List
      navigationTitle={`Stars for ${year}`}
      searchBarPlaceholder="Enter day"
      isLoading={isLoading}
      searchBarAccessory=<FilterDropdown onChange={setFilter} />
    >
      {passesFilter(year, filter, 2) &&
        Array.from(data?.entries() ?? []).map(([day, stars]) => (
          <List.Item
            key={day}
            title={`Day: ${day}`}
            subtitle={`${stars}/2`}
            icon={icon(stars, 2)}
            actions=<ActionPanel>
              <Action.OpenInBrowser url={`${API_URL}/${year}/day/${day}`} />
            </ActionPanel>
          />
        ))}
    </List>
  );
}

function FilterDropdown({ onChange }: { onChange: (newValue: string) => void }) {
  return (
    <List.Dropdown tooltip="Select Filter" storeValue={true} onChange={onChange}>
      <List.Dropdown.Item title="All" value="all" />
      <List.Dropdown.Item title="Incomplete" value="incomplete" />
      <List.Dropdown.Item title="Complete" value="complete" />
    </List.Dropdown>
  );
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.SubmitSolution>();

  const { isLoading, data } = usePromise(getStars, [preferences.sessionToken]);
  const [filter, setFilter] = useState("all");

  return (
    <List
      navigationTitle="Stars"
      searchBarPlaceholder="Enter year"
      isLoading={isLoading}
      searchBarAccessory=<FilterDropdown onChange={setFilter} />
    >
      {Array.from(data?.entries() ?? []).map(
        ([year, stars]) =>
          passesFilter(stars, filter, 50) && (
            <List.Item
              key={year}
              title={year.toString()}
              subtitle={`${stars}/50`}
              icon={icon(stars, 50)}
              actions=<ActionPanel>
                <Action.Push title={`View Stars for ${year}`} icon={Icon.Star} target=<Year year={year} /> />
                <Action.OpenInBrowser url={`${API_URL}/${year}`} />
              </ActionPanel>
            />
          ),
      )}
    </List>
  );
}
