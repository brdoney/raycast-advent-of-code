import { Form, ActionPanel, Action, showToast, getPreferenceValues, Toast, open, captureException } from "@raycast/api";
import { AocError, saveInput, useIncompleteDays, useYears } from "./util/api";
import { useEffect } from "react";
import { FormValidation, useForm, usePromise } from "@raycast/utils";
import { completedDays, pathDoesntExist, ProjectError, yearDirectories } from "./util/projects";
import fs from "node:fs/promises";
import path from "node:path";
import { removeKeys } from "./util/utils";

interface ProjectValues {
  year: string;
  day: string;
  projectName: string;
  downloadInput: boolean;
  openAfter: boolean;
}

/**
 * Create the project in the appropriate year's directory, creating the year
 * directory if necessary (defaults to `advent{year}`).
 * @param baseDir - the base projects directory
 * @param currYear - the year of the project
 * @param day - the day of the project
 * @param projectName - the desired name of the project folder
 * @param sessionToken - the session token, to download input.txt
 * @returns the path of the created project
 */
async function createProject(
  baseDir: string,
  currYear: number,
  day: number,
  projectName: string,
  sessionToken: string,
): Promise<string> {
  const dirs = await yearDirectories(baseDir);
  const yearPath = dirs.get(currYear) ?? path.join(baseDir, `advent${currYear}`);
  const projectPath = path.join(yearPath, projectName);

  await pathDoesntExist(projectPath);

  // The project doesn't exist already, so make it
  await fs.mkdir(projectPath, { recursive: true });
  await saveInput(currYear, day, projectPath, sessionToken);
  return projectPath;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.CreateProject>();

  const { handleSubmit, itemProps, setValidationError, reset, values, setValue } = useForm<ProjectValues>({
    async onSubmit(values) {
      try {
        showToast({
          style: Toast.Style.Animated,
          title: "Creating project",
        });

        // Try creating the project in the directory
        const projectPath = await createProject(
          preferences.projectDirectory,
          parseInt(values.year),
          parseInt(values.day),
          values.projectName,
          preferences.sessionToken,
        );

        showToast({
          style: Toast.Style.Success,
          title: `Created project ${values.projectName} for ${values.year}/${values.day}`,
          message: `${values.projectName} created`,
        });

        // Open the project automatically if desired
        if (values.openAfter) {
          await open(projectPath, preferences.openApp);
        }
      } catch (e) {
        if (e instanceof AocError) {
          showToast({
            style: Toast.Style.Failure,
            title: "Unable to download input",
            message: "Check session token in extension preferences",
          });
        } else if (e instanceof ProjectError) {
          // Came from an fs operation
          setValidationError("projectName", "Project with name already exists");
          showToast({
            style: Toast.Style.Failure,
            title: "Project already exists",
            message: `Project path: "${e.path}"`,
          });
        } else {
          captureException(e);
          showToast({
            style: Toast.Style.Failure,
            title: "Error creating project",
          });
        }
      }
    },
    initialValues: {
      downloadInput: true,
      openAfter: true,
    },
    validation: {
      year: (value) => {
        if (!value) {
          return "Item is required";
        } else if (days && days.length == 0) {
          return "All days complete";
        }
      },
      day: FormValidation.Required,
      projectName: FormValidation.Required,
    },
  });

  const { data: projects } = usePromise(completedDays, [preferences.projectDirectory]);

  // List of possible years and the currently selected year, to filter days
  const { isLoading: yearsLoading, data: years } = useYears(projects);

  const { isLoading: daysLoading, data: days } = useIncompleteDays(
    parseInt(values.year),
    preferences.sessionToken,
    // Reset selected day whenever we need to load choices
    (newValue) => {
      if (newValue !== undefined && newValue.length > 0) {
        // Update the selected day value to a reasonable default
        setValue("day", newValue[0].toString());
      } else {
        // There's nothing we could select, so just remove the current value
        reset(removeKeys(values, "day"));
      }
    },
  );

  // Change project name on day change - exact timing doesn't matter b/c we do
  // validation later, so useEffect is fine
  useEffect(() => {
    if (values.day) {
      // We have a selected value, so use it
      setValue("projectName", `day${values.day}`);
    } else {
      // We don't have a selected value for day yet
      reset(removeKeys(values, "projectName"));
    }
  }, [values.day]);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Create a project for Advent of Code" />

      <Form.Dropdown
        title="Year"
        info="Years with days to complete"
        isLoading={yearsLoading}
        placeholder="Select Year"
        {...itemProps.year}
      >
        {years &&
          years.map((year) => (
            <Form.Dropdown.Item key={year.toString()} value={year.toString()} title={year.toString()} />
          ))}
      </Form.Dropdown>

      <Form.Dropdown
        title="Day"
        info="Days not attempted for selected year"
        isLoading={daysLoading}
        placeholder="Select Day"
        {...itemProps.day}
      >
        {days &&
          days.map((day) => <Form.Dropdown.Item key={day.toString()} value={day.toString()} title={day.toString()} />)}
      </Form.Dropdown>

      <Form.TextField title="Project Name" placeholder="Enter Year and Day" {...itemProps.projectName} />

      <Form.Checkbox label="Download Input" info="Download the day's input to input.txt" {...itemProps.downloadInput} />

      <Form.Checkbox
        label="Open After Creation"
        info="Open the project in the configured or default app"
        {...itemProps.openAfter}
      />
    </Form>
  );
}
