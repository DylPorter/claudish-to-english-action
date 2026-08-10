/**
 * One OpenAI-compatible chat completion, with a timeout.
 *
 * Deliberately hand-rolled over `fetch` rather than pulling in a provider SDK:
 * the whole surface is a single POST, and every byte of dependency ends up in
 * the committed dist/ bundle that action consumers download on every run.
 */

import type { Message } from "./prompt.js";

export interface LlmOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  fetchImpl?: typeof fetch;
}

/** Thrown for every failure mode so main.ts has one thing to catch. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "rate-limit" | "http" | "malformed" | "network",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export async function rewrite(
  messages: readonly Message[],
  options: LlmOptions,
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${options.apiBase.replace(/\/+$/, "")}/chat/completions`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.3,
        stream: false,
        messages,
      }),
      signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError(
        `the model did not respond within ${options.timeoutSeconds}s`,
        "timeout",
      );
    }
    throw new LlmError(
      `could not reach ${options.apiBase}: ${error instanceof Error ? error.message : String(error)}`,
      "network",
    );
  }

  if (response.status === 429) {
    throw new LlmError(
      "hit the inference rate limit. On the GitHub Models free tier this resets daily — " +
        "see the README on raising the limit or supplying your own api-key.",
      "rate-limit",
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new LlmError(
      `${options.apiBase} returned ${response.status}${detail ? `: ${detail}` : ""}`,
      "http",
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new LlmError("the model returned a response that was not JSON", "malformed");
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new LlmError("the model returned an empty rewrite", "malformed");
  }

  return content;
}
