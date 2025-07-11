import fs from "node:fs/promises";
import { useCachedPromise } from "@raycast/utils";
import * as cheerio from "cheerio";
import { pathDoesntExist, Project } from "./projects";
import path from "node:path";

export const API_URL = "https://adventofcode.com";

const USER_AGENT_HEADER = {
  "User-Agent": "github.com/brdoney/raycast-advent-of-code by bre.doney@gmail.com",
};

/**
 * Returns the options to use with fetch to an AoC page that requires user authentication.
 * @param sessionToken - user's AoC session token to use for authentication
 * @returns options to use for the request
 */
function authenticatedOptions(sessionToken: string) {
  return {
    headers: {
      cookie: `session=${sessionToken}`,
      ...USER_AGENT_HEADER,
    },
  };
}

let canSubmit = true;
let delayStart = 0;
let delayAmount = 0;

type AocErrorName = "INVALID_SESSION_TOKEN" | "SOLVE_ERROR" | "RATE_LIMIT";

export class AocError extends Error {
  name: AocErrorName;

  constructor(name: AocErrorName, message?: string | undefined) {
    super(message);
    this.name = name;
  }
}

function handleErrors(e: unknown): never {
  if (e instanceof Error && (e.message === "400" || e.message === "500")) {
    throw new AocError("INVALID_SESSION_TOKEN");
  }
  throw e;
}

/**
 * Download and save input for the given year and day to `input.txt` in the given project path.
 *
 * @param year - input's year
 * @param day - input's day
 * @param projectPath - directory to save the input in
 * @param sessionToken - user's AoC session token
 */
export async function saveInput(year: number, day: number, projectPath: string, sessionToken: string): Promise<void> {
  // Project folder should exist already
  await fs.access(projectPath, fs.constants.R_OK | fs.constants.W_OK);

  // We shouldn't have an input.txt already
  const inputPath = path.join(projectPath, "input.txt");
  await pathDoesntExist(inputPath);

  // The file doesn't exist yet, so continue
  try {
    const res = await fetch(`${API_URL}/${year}/day/${day}/input`, authenticatedOptions(sessionToken));

    if (res.status !== 200) {
      throw new Error(String(res.status));
    }

    const text = await res.text();
    await fs.writeFile(inputPath, text.replace(/\n$/, ""));
  } catch (e: unknown) {
    handleErrors(e);
  }
}

/**
 * Get the number of stars the user has for each year.
 *
 * @param sessionToken - user's AoC session token
 * @return map from year to stars for the year
 */
export async function getStars(sessionToken: string): Promise<Map<number, number>> {
  try {
    const res = await fetch(`${API_URL}/events`, authenticatedOptions(sessionToken));

    if (res.status !== 200) {
      throw new Error(String(res.status));
    }

    const body = await res.text();
    const $ = cheerio.load(body);
    return new Map(
      $(".eventlist-event")
        .map((_, el) => $(el).text())
        .toArray()
        .map((text) => {
          const [yearString, starsString] = text.split(" ");
          const year = parseInt(yearString.slice(1, -1)); // Remove brackets
          const stars = parseInt(starsString.slice(0, -1)); // Cut off asterisk symbol
          return [year, stars];
        }),
    );
  } catch (e: unknown) {
    handleErrors(e);
  }
}

/**
 * Get the number of stars the user has for each day in a given year.
 *
 * @param year - the year to get stars for
 * @param sessionToken - user's AoC session token
 * @return map from day to stars for the day
 */
export async function getStarsForYear(year: number, sessionToken: string): Promise<Map<number, number>> {
  try {
    const res = await fetch(`${API_URL}/${year}`, authenticatedOptions(sessionToken));

    if (res.status !== 200) {
      throw new Error(String(res.status));
    }

    const body = await res.text();
    const $ = cheerio.load(body);
    return new Map(
      $(".calendar a")
        .map((_, el) => {
          const e = $(el);
          const day = parseInt(e.attr("href")?.split("/").at(-1) ?? "0");
          if (e.hasClass("calendar-complete")) {
            return { day: day, stars: 1 };
          } else if (e.hasClass("calendar-verycomplete")) {
            return { day: day, stars: 2 };
          } else {
            return { day: day, stars: 0 };
          }
        })
        .toArray()
        .map(({ day, stars }) => [day, stars]),
    );
  } catch (e: unknown) {
    handleErrors(e);
  }
}

type SolveStatus = { status: "success" } | { status: "wrong"; message: string } | { status: "wait"; message: string };

const SolveStatus = {
  Success(): SolveStatus {
    return { status: "success" };
  },
  Wrong(message: string): SolveStatus {
    return { status: "wrong", message };
  },
  Wait(message: string): SolveStatus {
    return { status: "wait", message };
  },
} as const;

function timeToReadable(d: number, h: number, m: number, s: number): string {
  return (d !== 0 ? `${d}d ` : "") + (h !== 0 ? `${h}h ` : "") + (m !== 0 ? `${m}m ` : "") + (s !== 0 ? `${s}s ` : "");
}

function msToReadable(ms: number): string {
  const msSecond = 1000;
  const msMinute = 60 * msSecond;
  const msHour = 60 * msMinute;
  const msDay = 24 * msHour;

  const d = Math.floor(ms / msDay);
  const h = Math.floor((ms - msDay * d) / msHour);
  const m = Math.floor((ms - msDay * d - msHour * h) / msMinute);
  const s = Math.floor((ms - msDay * d - msHour * h - msMinute * m) / msSecond);

  return timeToReadable(d, h, m, s);
}

const strToNum = (time: string) => {
  const entries: { [key: string]: number } = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  return entries[time] || NaN;
};

/**
 * Try to turn an AoC rate limit info message into an error with a readable message.
 * @param info - the info returned by AoC that includes rate limit info.
 */
function handleRateLimit(info: string): never {
  const waitStr = info.match(/(one|two|three|four|five|six|seven|eight|nine|ten) (second|minute|hour|day)/);
  const waitNum = info.match(/\d+\s*(s|m|h|d)/g);

  if (waitStr !== null || waitNum !== null) {
    const waitTime: { [key: string]: number } = {
      s: 0,
      m: 0,
      h: 0,
      d: 0,
    };

    if (waitStr !== null) {
      const [_, time, unit] = waitStr;
      waitTime[unit[0]] = strToNum(time);
    } else if (waitNum !== null) {
      for (const x of waitNum) {
        waitTime[x.slice(-1)] = Number(x.slice(0, -1));
      }
    }

    canSubmit = false;
    delayStart = Date.now();
    delayAmount = (waitTime.d * 24 * 60 * 60 + waitTime.h * 60 * 60 + waitTime.m * 60 + waitTime.s) * 1000;

    const delayStr = timeToReadable(waitTime.d, waitTime.h, waitTime.m, waitTime.s);

    throw new AocError("RATE_LIMIT", `Next request possible in: ${delayStr}`);
  }
  throw new AocError("SOLVE_ERROR", info);
}

// TODO: Make this use the user's AoC stars, rather than completed projects
export function useYears(completedProjects?: Map<number, Project[]> | undefined) {
  return useCachedPromise(
    async (completed) => {
      const res = await fetch(`${API_URL}/events`, {
        headers: {
          ...USER_AGENT_HEADER,
        },
      });
      const body = await res.text();
      const $ = cheerio.load(body);
      const years = $(".eventlist-event a")
        .map((_, el) => parseInt($(el).text().slice(1, -1))) // Remove the square brackets around each year
        .toArray();
      if (completedProjects) {
        return years.filter((year) => {
          const comp = completed.get(year);
          return comp && comp.length < 25;
        });
      }
      return years;
    },
    [completedProjects],
  );
}

/**
 * Submit a solution to a given AoC challenge and return its result.
 * @param year - solution's year
 * @param day - solution's day
 * @param part - solution's part (1 or 2)
 * @param solution - the solution's text content
 * @param sessionToken - the user's AoC session token
 * @returns the solution's result
 */
export async function sendSolution(
  year: number,
  day: number,
  part: 1 | 2,
  solution: string,
  sessionToken: string,
): Promise<SolveStatus> {
  if (!canSubmit) {
    const now = Date.now();
    const remainingMs = delayAmount - (now - delayStart);

    if (remainingMs <= 0) {
      canSubmit = true;
    } else {
      return SolveStatus.Wait(`You have to wait: ${msToReadable(remainingMs)}`);
    }
  }

  try {
    const res = await fetch(`${API_URL}/${year}/day/${day}/answer`, {
      headers: {
        cookie: `session=${sessionToken}`,
        "content-type": "application/x-www-form-urlencoded",
        ...USER_AGENT_HEADER,
      },
      method: "POST",
      body: `level=${part}&answer=${solution}`,
    });
    if (res.status !== 200) {
      throw new Error(String(res.status));
    }

    const body = await res.text();
    const $ = cheerio.load(body);
    const $main = $("main");

    const info =
      $main.length !== 0
        ? $main
          .text()
          .replace(/\[.*\]/, "")
          .trim()
        : "Can't find the main element";

    if (info.includes("That's the right answer")) {
      return SolveStatus.Success();
    } else if (info.includes("That's not the right answer")) {
      return SolveStatus.Wrong(info);
    } else if (info.includes("You gave an answer too recently")) {
      handleRateLimit(info);
    } else {
      throw new AocError("SOLVE_ERROR", info);
    }
  } catch (e: unknown) {
    handleErrors(e);
  }
}
