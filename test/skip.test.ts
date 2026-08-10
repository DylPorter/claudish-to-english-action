import { describe, expect, it } from "vitest";
import { proseLength, shouldSkip, stripCodeBlocks } from "../src/skip.js";

const base = { labels: [] as string[], minChars: 200, skipLabel: "no-claudish" };
const longProse = "a".repeat(120) + " " + "b".repeat(120);

describe("stripCodeBlocks", () => {
  it("removes fenced blocks and their fences", () => {
    expect(stripCodeBlocks("before\n```\ncode\n```\nafter")).toBe("before\nafter");
  });

  it("keeps prose that merely mentions backticks inline", () => {
    expect(stripCodeBlocks("use `npm run build` now")).toBe("use `npm run build` now");
  });

  it("handles a language-tagged fence", () => {
    expect(stripCodeBlocks("hi\n```ts\nconst x = 1\n```\nbye")).toBe("hi\nbye");
  });

  it("swallows the remainder of an unterminated fence", () => {
    // Under-counting is the safe direction: we skip rather than rewrite noise.
    expect(stripCodeBlocks("intro\n```\ndangling")).toBe("intro");
  });

  it("strips an indented fence", () => {
    expect(stripCodeBlocks("a\n  ```\n  code\n  ```\nb")).toBe("a\nb");
  });
});

describe("proseLength", () => {
  it("counts only non-whitespace characters", () => {
    expect(proseLength("a b\tc\nd")).toBe(4);
  });

  it("excludes fenced code from the count", () => {
    expect(proseLength("ab\n```\nlots of code here\n```\ncd")).toBe(4);
  });
});

describe("shouldSkip", () => {
  it("skips an empty description", () => {
    const result = shouldSkip({ ...base, body: "" });
    expect(result).toMatchObject({ skip: true });
    expect(result).toHaveProperty("reason", expect.stringContaining("no description"));
  });

  it("skips a null description", () => {
    expect(shouldSkip({ ...base, body: null }).skip).toBe(true);
  });

  it("skips a whitespace-only description", () => {
    expect(shouldSkip({ ...base, body: "   \n\t  " }).skip).toBe(true);
  });

  it("skips when the skip label is present", () => {
    const result = shouldSkip({ ...base, body: longProse, labels: ["no-claudish"] });
    expect(result).toMatchObject({ skip: true });
    expect(result).toHaveProperty("reason", expect.stringContaining("labelled"));
  });

  it("matches the skip label case-insensitively", () => {
    expect(shouldSkip({ ...base, body: longProse, labels: ["No-Claudish"] }).skip).toBe(true);
  });

  it("ignores unrelated labels", () => {
    expect(shouldSkip({ ...base, body: longProse, labels: ["bug", "p1"] }).skip).toBe(false);
  });

  it("skips a description below the prose floor", () => {
    const result = shouldSkip({ ...base, body: "short one" });
    expect(result).toMatchObject({ skip: true });
    expect(result).toHaveProperty("reason", expect.stringContaining("below the 200"));
  });

  it("skips a description that only clears the floor because of code", () => {
    const body = "tiny note\n```\n" + "x".repeat(500) + "\n```";
    expect(shouldSkip({ ...base, body }).skip).toBe(true);
  });

  it("rewrites a long enough description", () => {
    expect(shouldSkip({ ...base, body: longProse }).skip).toBe(false);
  });

  it("treats exactly minChars as long enough", () => {
    expect(shouldSkip({ ...base, body: "a".repeat(200) }).skip).toBe(false);
  });

  it("treats one below minChars as too short", () => {
    expect(shouldSkip({ ...base, body: "a".repeat(199) }).skip).toBe(true);
  });

  it("respects a custom floor", () => {
    expect(shouldSkip({ ...base, body: "a".repeat(50), minChars: 10 }).skip).toBe(false);
  });

  it("respects a custom skip label", () => {
    expect(
      shouldSkip({ ...base, body: longProse, labels: ["quiet"], skipLabel: "quiet" }).skip,
    ).toBe(true);
  });
});
