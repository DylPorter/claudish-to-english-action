/**
 * Input parsing, kept separate from the Actions runtime so it can be tested
 * against a plain lookup function.
 */

export interface Config {
  model: string;
  apiBase: string;
  /** Credential for the inference endpoint. */
  apiKey: string;
  /** Credential for the GitHub API. Distinct from apiKey — when someone points
   *  api-base at Anthropic or a local ollama, api-key is not a GitHub token. */
  githubToken: string;
  minChars: number;
  timeoutSeconds: number;
  skipLabel: string;
}

export const DEFAULTS = {
  model: "openai/gpt-4o-mini",
  apiBase: "https://models.github.ai/inference",
  minChars: 200,
  timeoutSeconds: 45,
  skipLabel: "no-claudish",
} as const;

export type InputReader = (name: string) => string;

export class ConfigError extends Error {}

function positiveInt(raw: string, name: string, fallback: number): number {
  const value = raw.trim();
  if (value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`\`${name}\` must be a positive whole number, got "${raw}"`);
  }
  return parsed;
}

function orDefault(raw: string, fallback: string): string {
  const value = raw.trim();
  return value === "" ? fallback : value;
}

export function parseConfig(read: InputReader): Config {
  const apiKey = read("api-key").trim();
  if (apiKey === "") {
    throw new ConfigError(
      "`api-key` is empty. Leave it unset to use the workflow's GITHUB_TOKEN, " +
        "and make sure the job grants `models: read`.",
    );
  }

  const githubToken = read("github-token").trim();
  if (githubToken === "") {
    throw new ConfigError(
      "`github-token` is empty. It defaults to the workflow's GITHUB_TOKEN and is " +
        "needed to post the comment, separately from `api-key`.",
    );
  }

  return {
    model: orDefault(read("model"), DEFAULTS.model),
    apiBase: orDefault(read("api-base"), DEFAULTS.apiBase),
    apiKey,
    githubToken,
    minChars: positiveInt(read("min-chars"), "min-chars", DEFAULTS.minChars),
    timeoutSeconds: positiveInt(read("timeout"), "timeout", DEFAULTS.timeoutSeconds),
    skipLabel: orDefault(read("skip-label"), DEFAULTS.skipLabel),
  };
}
