import { describe, expect, it, vi } from "vitest";
import { LlmError, rewrite } from "../src/llm.js";

const messages = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: "hi" }];

const options = {
  apiBase: "https://models.github.ai/inference",
  apiKey: "tok",
  model: "openai/gpt-4o-mini",
  timeoutSeconds: 45,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("rewrite", () => {
  it("returns the model's content, trimmed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "  plain words  " } }] }),
    );
    await expect(rewrite(messages, { ...options, fetchImpl })).resolves.toBe("plain words");
  });

  it("posts to /chat/completions with bearer auth and the model", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "x" } }] }),
    );
    await rewrite(messages, { ...options, fetchImpl });

    const call = fetchImpl.mock.calls[0];
    const url = call?.[0];
    const init = call?.[1] as RequestInit;
    expect(url).toBe("https://models.github.ai/inference/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "openai/gpt-4o-mini",
      stream: false,
      messages,
    });
  });

  it("does not produce a double slash when api-base has a trailing one", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "x" } }] }),
    );
    await rewrite(messages, { ...options, apiBase: "https://example.com/v1/", fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://example.com/v1/chat/completions");
  });

  it("flags a rate limit distinctly and explains the reset", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    const error = await rewrite(messages, { ...options, fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("rate-limit");
    expect(error.message).toMatch(/resets daily/);
  });

  it("reports an HTTP failure with the status and some detail", async () => {
    const fetchImpl = vi.fn(async () => new Response("no such model", { status: 400 }));
    const error = await rewrite(messages, { ...options, fetchImpl }).catch((e) => e);

    expect(error.kind).toBe("http");
    expect(error.message).toContain("400");
    expect(error.message).toContain("no such model");
  });

  it("reports a timeout as a timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    });
    const error = await rewrite(messages, { ...options, timeoutSeconds: 3, fetchImpl }).catch((e) => e);

    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("3s");
  });

  it("reports an unreachable endpoint as a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await rewrite(messages, { ...options, fetchImpl }).catch((e) => e);

    expect(error.kind).toBe("network");
    expect(error.message).toContain("models.github.ai");
  });

  it("rejects a body that is not JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    const error = await rewrite(messages, { ...options, fetchImpl }).catch((e) => e);

    expect(error.kind).toBe("malformed");
  });

  it.each([
    ["no choices", {}],
    ["empty choices", { choices: [] }],
    ["null content", { choices: [{ message: { content: null } }] }],
    ["whitespace content", { choices: [{ message: { content: "   " } }] }],
  ])("rejects a response with %s", async (_label, body) => {
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const error = await rewrite(messages, { ...options, fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("malformed");
  });
});
