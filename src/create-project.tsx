import { Form, ActionPanel, Action, showToast, getPreferenceValues, Toast, open } from "@raycast/api";
import { AocError, saveInput, useYears } from "./util/api";
import { useEffect, useMemo } from "react";
import { FormValidation, useForm, usePromise } from "@raycast/utils";
import { completedDays, pathDoesntExist, ProjectError, yearDirectories } from "./util/projects";
import fs from "node:fs/promises";
import path from "node:path";

type Values = {
  year: string;
  day: string;
  projectName: string;
  downloadInput: boolean;
  openAfter: boolean;
};

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

  const { handleSubmit, itemProps, setValidationError, reset, values, setValue } = useForm<Values>({
    async onSubmit(values) {
      try {
        showToast({
          style: Toast.Style.Animated,
          title: "Creating project",
        });

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
          showToast({
            style: Toast.Style.Failure,
            title: "Error creating project",
          });
          throw e;
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

  // The days to choose from, based on the current year and what projects already exist
  const days = useMemo(() => {
    if (!projects || !values.year) {
      return [];
    }
    const completed = new Set(projects.get(parseInt(values.year))?.map((p) => p.day) ?? []);

    // Reset day-related items since the choices are about to change
    reset({ ...values, day: undefined, projectName: undefined });

    return Array.from({ length: 25 }, (_, i) => i + 1).filter((v) => !completed.has(v));
  }, [values.year, projects]);

  // Change project name on day change - exact timing doesn't matter b/c we do
  // validation later, so useEffect is fine
  useEffect(() => {
    if (values.day) {
      setValue("projectName", `day${values.day}`);
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
        isLoading={yearsLoading}
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
