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
} from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { AocError, sendSolution, useYears } from "./util/api";

type Values = {
  year: string;
  day: string;
  part: string;
  answer: string;
};

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

function parsePart(part: string): 1 | 2 {
  const p = parseInt(part);
  if (p === 1 || p === 2) {
    return p;
  }
  throw new Error(`Invalid part ${p}`);
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.SubmitSolution>();

  const { isLoading: yearsLoading, data: years } = useYears();

  const { handleSubmit, itemProps } = useForm<Values>({
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
        if (res.status === "success") {
          try {
            launchCommand({
              name: "confetti",
              extensionName: "raycast",
              ownerOrAuthorName: "raycast",
              type: LaunchType.UserInitiated,
            });
          } catch {
            // Not important if the command errors, since it's just for flair
          }
          showToast({
            style: Toast.Style.Success,
            title: `Solved ${values.year}/${values.day} part ${values.part}!`,
          });
        } else if (res.status === "wait") {
          showToast({
            style: Toast.Style.Failure,
            title: "Rate limit",
            message: res.message,
          });
        } else if (res.status === "wrong") {
          showToast({
            style: Toast.Style.Failure,
            title: "Wrong answer",
            message: res.message,
          });
        }
      } catch (e: unknown) {
        handleSubmitError(e);
      }
    },
    validation: {
      year: FormValidation.Required,
      day: FormValidation.Required,
      answer: FormValidation.Required,
      part: (val) => (val === "1" || val === "2" ? undefined : `Invalid part: part ${val}`),
    },
  });

  const days = Array.from({ length: 25 }, (_, i) => i + 1);

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

      <Form.Dropdown title="Day" placeholder="Select Day" {...itemProps.day} storeValue>
        {days.map((day) => (
          <Form.Dropdown.Item key={day.toString()} value={day.toString()} title={day.toString()} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown title="Part" placeholder="Select part" {...itemProps.part}>
        <Form.Dropdown.Item key={1} value={"1"} title="Part 1" />
        <Form.Dropdown.Item key={2} value={"2"} title="Part 2" />
      </Form.Dropdown>

      <Form.TextArea title="Solution" placeholder="Enter solution" {...itemProps.answer} />
    </Form>
  );
}
