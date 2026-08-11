import { describe, expect, it } from "vitest";
import {
  MAX_BODY_CHARS,
  MAX_CONTEXT_FILES,
  buildMessages,
  buildSystemPrompt,
  truncateBody,
} from "../src/prompt.js";

const ctx = {
  title: "Refactor ingestion",
  body: "Some description",
  changedFiles: ["src/ingest/loader.ts", "src/ingest/parse.ts"],
};

describe("buildSystemPrompt", () => {
  it("keeps the original prompt's load-bearing instructions", () => {
    const prompt = buildSystemPrompt({ ...ctx, changedFiles: [] });
    // These phrases are the contract inherited from gvzdv's rewrite.sh.
    expect(prompt).toContain("plain English");
    expect(prompt).toContain("Keep every fact, name, number, and file path");
    expect(prompt).toContain("Leave fenced code blocks unchanged");
    expect(prompt).toContain("no preamble, labels, or commentary");
  });

  it("adds no context section when nothing changed", () => {
    expect(buildSystemPrompt({ ...ctx, changedFiles: [] })).not.toContain("For context");
  });

  it("includes the title and changed paths as context", () => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Refactor ingestion");
    expect(prompt).toContain("- src/ingest/loader.ts");
    expect(prompt).toContain("- src/ingest/parse.ts");
  });

  it("forbids the model from answering or repeating the context", () => {
    // Without this the model tends to summarise the file list instead of the body.
    expect(buildSystemPrompt(ctx)).toContain("Do NOT rewrite, answer, or repeat");
  });

  it("truncates a very large file list and says how many were dropped", () => {
    const files = Array.from({ length: MAX_CONTEXT_FILES + 7 }, (_, i) => `src/f${i}.ts`);
    const prompt = buildSystemPrompt({ ...ctx, changedFiles: files });

    expect(prompt).toContain(`src/f${MAX_CONTEXT_FILES - 1}.ts`);
    expect(prompt).not.toContain(`src/f${MAX_CONTEXT_FILES}.ts`);
    expect(prompt).toContain("and 7 more files");
  });
});

describe("buildMessages", () => {
  it("sends the description as the user message, unmodified", () => {
    const messages = buildMessages(ctx);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "Some description" });
  });

  it("truncates an enormous description before sending it", () => {
    // Cost guard: on a public repo anyone can open a PR, and an unbounded
    // description would spend unbounded tokens.
    const huge = "x".repeat(MAX_BODY_CHARS + 5000);
    const sent = buildMessages({ ...ctx, body: huge })[1]?.content ?? "";

    expect(sent.length).toBeLessThan(huge.length);
    expect(sent).toContain("[description truncated for length]");
  });
});

describe("truncateBody", () => {
  it("leaves a normal description alone", () => {
    expect(truncateBody("short")).toBe("short");
  });

  it("leaves a description at exactly the limit alone", () => {
    const exact = "y".repeat(MAX_BODY_CHARS);
    expect(truncateBody(exact)).toBe(exact);
  });

  it("marks a truncated description so the model knows it is partial", () => {
    const over = "z".repeat(MAX_BODY_CHARS + 1);
    expect(truncateBody(over)).toContain("[description truncated for length]");
  });
});
