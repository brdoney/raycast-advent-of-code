import {
  Form,
  ActionPanel,
  Action,
  showToast,
  getPreferenceValues,
  Toast,
  captureException,
  launchCommand,
  LaunchType,
  LocalStorage,
} from "@raycast/api";
import { FormValidation, useCachedPromise, useForm } from "@raycast/utils";
import { AocError, sendSolution, useIncompleteDays, useYears } from "./util/api";
import { removeKeys } from "./util/utils";

type Values = {
  year: string;
  day: string;
  part: string;
  answer: string;
};

/**
 * Handle errors, either by surfacing them as toasts if they are expected, or
 * by capturing them.
 * @param e - error to handle
 */
function handleSubmitError(e: unknown) {
  if (e instanceof AocError) {
    if (e.name === "RATE_LIMIT") {
      showToast({
        style: Toast.Style.Failure,
        title: "Rate limit",
        message: e.message,
      });
    } else if (e.name === "INVALID_SESSION_TOKEN") {
      showToast({
        style: Toast.Style.Failure,
        title: "Invalid session token",
        message: "Check session token in extension preferences",
      });
    } else if (e.name === "SOLVE_ERROR") {
      showToast({
        style: Toast.Style.Failure,
        title: "Unable to submit answer",
        message: e.message,
      });
    } else {
      captureException(e);
      showToast({
        style: Toast.Style.Failure,
        title: "Unable to submit answer",
      });
    }
  }
}

/**
 * Convert from the string value to the part type, since Raycast forces
 * dropdown values to be `string`.
 * @param part - string version of part, either "1" or "2" (form validation
 * prevents other values)
 */
function parsePart(part: string): 1 | 2 {
  const p = parseInt(part);
  if (p === 1 || p === 2) {
    return p;
  }
  throw new Error(`Invalid part ${p}`);
}

/**
 * Get the local storage key used for a given year and day combo.
 * @param year - year to retrieve data for
 * @param day - day to retrieve data for
 * @param part - part (1 or 2) to retrieve data for
 * @returns the key used in local storage for the year, day combo
 */
function storageKey(year: string, day: string, part: string): string {
  return `${year}/${day}/${part}`;
}

/**
 * Log a submission in local storage, so we can retrieve the submitted answer
 * later.
 * @param values - submission form values to log
 */
async function logSubmission(values: Values) {
  const key = storageKey(values.year, values.day, values.part);
  const prev = await LocalStorage.getItem(key);
  const next = prev ? prev + "\n" + values.answer : values.answer;
  await LocalStorage.setItem(key, next);
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.SubmitSolution>();

  const { handleSubmit, itemProps, values, reset } = useForm<Values>({
    async onSubmit(values) {
      showToast({
        style: Toast.Style.Animated,
        title: "Submitting answer",
      });
      try {
        const res = await sendSolution(
          parseInt(values.year),
          parseInt(values.day),
          parsePart(values.part),
          values.answer,
          preferences.sessionToken,
        );
        if (res.status === "wait") {
          showToast({
            style: Toast.Style.Failure,
            title: "Rate limit",
            message: res.message,
          });
        } else {
          // Save our submission, since it went through
          logSubmission(values);

          if (res.status === "success") {
            // Respect preference for showing confetti
            try {
              if (preferences.showConfetti) {
                launchCommand({
                  name: "confetti",
                  extensionName: "raycast",
                  ownerOrAuthorName: "raycast",
                  type: LaunchType.UserInitiated,
                });
              }
            } catch {
              // Not important if the command errors, since it's just for flair
            }
            showToast({
              style: Toast.Style.Success,
              title: `Solved ${values.year}/${values.day} part ${values.part}!`,
            });
          } else if (res.status === "wrong") {
            showToast({
              style: Toast.Style.Failure,
              title: "Wrong answer",
              message: res.message,
            });
          }
        }
      } catch (e: unknown) {
        handleSubmitError(e);
      }
    },
    validation: {
      year: FormValidation.Required,
      day: FormValidation.Required,
      answer: FormValidation.Required,
      // Only accept parts 1 or 2 (shouldn't be an issue b/c we use a dropdown w/ a default)
      part: (val) => (val === "1" || val === "2" ? undefined : `Invalid part: part ${val}`),
    },
  });

  const { isLoading: yearsLoading, data: years } = useYears();

  const { isLoading: daysLoading, data: days } = useIncompleteDays(
    parseInt(values.year),
    preferences.sessionToken,
    // Reset selected day whenever we need to load choices
    () => reset(removeKeys(values, "day", "part")),
  );

  // Load records of past answers, or undefined if there's nothing
  const { isLoading: pastAnswersLoading, data: pastAnswers } = useCachedPromise(
    async (year: string, day: string, part: string) => LocalStorage.getItem<string>(storageKey(year, day, part)),
    [values.year, values.day, values.part],
  );

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Submit a solution for Advent of Code" />

      <Form.Dropdown title="Year" isLoading={yearsLoading} placeholder="Select Year" {...itemProps.year} storeValue>
        {years &&
          years.map((year) => (
            <Form.Dropdown.Item key={year.toString()} value={year.toString()} title={year.toString()} />
          ))}
      </Form.Dropdown>

      <Form.Dropdown title="Day" isLoading={daysLoading} placeholder="Select Day" {...itemProps.day}>
        {days &&
          days.map((day) => <Form.Dropdown.Item key={day.toString()} value={day.toString()} title={day.toString()} />)}
      </Form.Dropdown>

      <Form.Dropdown title="Part" placeholder="Select part" {...itemProps.part}>
        <Form.Dropdown.Item key={1} value={"1"} title="Part 1" />
        <Form.Dropdown.Item key={2} value={"2"} title="Part 2" />
      </Form.Dropdown>

      <Form.Description
        title="Submissions"
        text={pastAnswersLoading ? "Loading..." : (pastAnswers ?? "No submissions made yet")}
      />

      <Form.TextArea title="Solution" placeholder="Enter solution" {...itemProps.answer} />
    </Form>
  );
}
