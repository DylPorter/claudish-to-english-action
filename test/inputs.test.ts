import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULTS, parseConfig } from "../src/inputs.js";

/** Mimics core.getInput, which returns "" for anything unset. */
function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? "";
}

const minimal = { "api-key": "tok", "github-token": "ghtok" };

describe("parseConfig", () => {
  it("fills every default from an otherwise empty config", () => {
    expect(parseConfig(reader(minimal))).toEqual({
      model: DEFAULTS.model,
      apiBase: DEFAULTS.apiBase,
      apiKey: "tok",
      githubToken: "ghtok",
      minChars: DEFAULTS.minChars,
      timeoutSeconds: DEFAULTS.timeoutSeconds,
      skipLabel: DEFAULTS.skipLabel,
    });
  });

  it("keeps the inference key and the GitHub token separate", () => {
    // The whole point: api-key may belong to Anthropic while comments still
    // need a GitHub credential.
    const config = parseConfig(reader({ "api-key": "sk-ant-xxx", "github-token": "ghs_yyy" }));
    expect(config.apiKey).toBe("sk-ant-xxx");
    expect(config.githubToken).toBe("ghs_yyy");
  });

  it("overrides defaults when values are supplied", () => {
    const config = parseConfig(
      reader({
        ...minimal,
        model: "claude-haiku-4-5",
        "api-base": "https://api.anthropic.com/v1",
        "min-chars": "50",
        timeout: "10",
        "skip-label": "quiet",
      }),
    );
    expect(config).toMatchObject({
      model: "claude-haiku-4-5",
      apiBase: "https://api.anthropic.com/v1",
      minChars: 50,
      timeoutSeconds: 10,
      skipLabel: "quiet",
    });
  });

  it("treats whitespace-only input as unset", () => {
    expect(parseConfig(reader({ ...minimal, model: "   " })).model).toBe(DEFAULTS.model);
  });

  it("rejects an empty inference key with an actionable message", () => {
    expect(() => parseConfig(reader({ "github-token": "x" }))).toThrow(ConfigError);
    expect(() => parseConfig(reader({ "github-token": "x" }))).toThrow(/api-key` is required/);
  });

  it("says why there is no keyless default", () => {
    // GitHub Models was retired 2026-07-30; without this note the error reads
    // like a bug in the action rather than a dead upstream.
    expect(() => parseConfig(reader({ "github-token": "x" }))).toThrow(/GitHub Models was retired/);
  });

  it("rejects an empty GitHub token", () => {
    expect(() => parseConfig(reader({ "api-key": "x" }))).toThrow(ConfigError);
  });

  it.each(["0", "-5", "1.5", "many", "12abc"])("rejects min-chars of %s", (value) => {
    expect(() => parseConfig(reader({ ...minimal, "min-chars": value }))).toThrow(ConfigError);
  });

  it("rejects a non-numeric timeout", () => {
    expect(() => parseConfig(reader({ ...minimal, timeout: "soon" }))).toThrow(/positive whole number/);
  });
});
