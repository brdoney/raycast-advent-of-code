import fs from "node:fs/promises";
import path from "node:path";

export type Project = { day: number; name: string; path: string };

const dayRegex = /(\d{1,2})/;
const yearRegex = /(\d{2,4})/;

export async function* walkYearDir(yearDir: string): AsyncGenerator<Project> {
  const entries = await fs.opendir(yearDir);
  for await (const entry of entries) {
    if (entry.isDirectory()) {
      const m = dayRegex.exec(entry.name);
      if (m) {
        const p = path.join(entry.parentPath, entry.name);
        yield { day: parseInt(m[1], 10), name: entry.name, path: p };
      }
    }
  }
}

async function toArray<T>(f: AsyncGenerator<T>): Promise<T[]> {
  const res = [];
  for await (const x of f) {
    res.push(x);
  }
  return res;
}

export async function completedDaysForYear(projectsDir: string, year: number): Promise<Project[]> {
  const entries = await fs.opendir(projectsDir);

  for await (const entry of entries) {
    if (entry.isDirectory()) {
      const m = yearRegex.exec(entry.name);
      if (m && m[1] == year.toString()) {
        const fullPath = path.join(entry.parentPath, entry.name);
        return toArray(walkYearDir(fullPath));
      }
    }
  }

  return [];
}

export async function completedDays(projectsDir: string): Promise<Map<number, Project[]>> {
  const entries = await fs.opendir(projectsDir);
  // Maps from year to a list of days found
  const years = new Map<number, Project[]>();

  for await (const entry of entries) {
    if (entry.isDirectory()) {
      const m = yearRegex.exec(entry.name);
      if (m) {
        const year = parseInt(m[1], 10);
        const fullPath = path.join(entry.parentPath, entry.name);
        const days = await toArray(walkYearDir(fullPath));
        days.sort((a, b) => b.day - a.day);
        years.set(year, days);
      }
    }
  }

  return years;
}

export async function yearDirectories(projectsDir: string): Promise<Map<number, string>> {
  const entries = await fs.opendir(projectsDir);
  const directories = new Map<number, string>();
  for await (const entry of entries) {
    if (entry.isDirectory()) {
      const m = yearRegex.exec(entry.name);
      if (m) {
        const year = parseInt(m[1], 10);
        const fullPath = path.join(entry.parentPath, entry.name);
        directories.set(year, fullPath);
      }
    }
  }
  return directories;
}

// Type guard for Node.js errors with a `code` property
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export class ProjectError extends Error {
  path: string;

  constructor(message: string, path: string) {
    super(message);
    this.path = path;
  }
}

export async function pathDoesntExist(path: string): Promise<void> {
  // We don't want to overwrite a project, so check for this
  // This can happen if a user enters a custom project name that already exists
  try {
    await fs.access(path, fs.constants.F_OK);
    throw new ProjectError("Project already exists", path);
  } catch (e: unknown) {
    if (isNodeError(e) && e.code === "ENOENT") {
      return;
    }
    throw e;
  }
}
