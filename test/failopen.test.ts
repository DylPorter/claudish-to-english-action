/**
 * The fail-open contract, pinned.
 *
 * This Action must never fail a workflow run. These tests exist because that
 * promise is easy to break with an innocent-looking `throw` three refactors
 * from now, and nothing else in the suite would notice.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  getInput: vi.fn((_name: string): string => ""),
  info: vi.fn((_message: string) => {}),
  warning: vi.fn((_message: string) => {}),
  setFailed: vi.fn((_message: string) => {}),
}));

const context = vi.hoisted(() => ({
  payload: {} as { pull_request?: unknown },
  repo: { owner: "DylPorter", repo: "demo" },
}));

const getOctokit = vi.hoisted(() => vi.fn());

vi.mock("@actions/core", () => core);
vi.mock("@actions/github", () => ({ context, getOctokit }));

const { main } = await import("../src/run.js");

const longBody = "This pull request provides enhanced observability. ".repeat(8);

function pullRequest(overrides: Record<string, unknown> = {}) {
  return { number: 7, title: "Refactor", body: longBody, labels: [], ...overrides };
}

/** An octokit whose calls all succeed, so only the LLM can fail. */
function healthyOctokit(overrides: Record<string, unknown> = {}) {
  return {
    rest: {
      pulls: { listFiles: vi.fn(async () => ({ data: [{ filename: "src/a.ts" }] })) },
      issues: {
        listComments: vi.fn(async (_params: unknown) => ({ data: [] as Array<{ id: number; body?: string }> })),
        createComment: vi.fn(async (_params: { body: string }) => ({})),
        updateComment: vi.fn(async (_params: { body: string }) => ({})),
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  context.payload = { pull_request: pullRequest() };
  core.getInput.mockImplementation((name: string) =>
    name === "api-key" || name === "github-token" ? "tok" : "",
  );
  getOctokit.mockReturnValue(healthyOctokit());
  vi.unstubAllGlobals();
});

describe("fail-open contract", () => {
  it("never calls setFailed, whatever happens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await main();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when the model errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(main()).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledOnce();
    expect(core.warning.mock.calls[0]?.[0]).toContain("never fails your build");
  });

  it("survives a rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(main()).resolves.toBeUndefined();
    expect(core.warning.mock.calls[0]?.[0]).toMatch(/rate limit/);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(main()).resolves.toBeUndefined();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("survives a malformed configuration", async () => {
    core.getInput.mockImplementation((name: string) =>
      name === "min-chars" ? "not-a-number" : "tok",
    );
    await expect(main()).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledOnce();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("survives being denied permission to post the comment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "plain" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    getOctokit.mockReturnValue(
      healthyOctokit({
        rest: {
          pulls: { listFiles: vi.fn(async () => ({ data: [] })) },
          issues: {
            listComments: vi.fn(async (_params: unknown) => ({ data: [] })),
            createComment: vi.fn(async (_params: unknown): Promise<unknown> => {
              throw new Error("Resource not accessible by integration");
            }),
            updateComment: vi.fn(),
          },
        },
      }),
    );

    await expect(main()).resolves.toBeUndefined();
    expect(core.warning.mock.calls[0]?.[0]).toContain("not accessible");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("still rewrites when the changed-file list cannot be fetched", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "plain" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const octokit = healthyOctokit();
    octokit.rest.pulls.listFiles = vi.fn(async () => {
      throw new Error("403");
    });
    getOctokit.mockReturnValue(octokit);

    await main();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(octokit.rest.issues.createComment).toHaveBeenCalledOnce();
    expect(core.warning).not.toHaveBeenCalled();
  });
});

describe("non-pull-request events", () => {
  it("does nothing quietly when there is no pull request", async () => {
    context.payload = {};
    await main();
    expect(core.info).toHaveBeenCalledWith("Not a pull request event — nothing to do.");
    expect(core.warning).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  it("posts the rewrite as a comment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "Loads data faster." } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const octokit = healthyOctokit();
    getOctokit.mockReturnValue(octokit);

    await main();

    expect(octokit.rest.issues.createComment).toHaveBeenCalledOnce();
    const call = octokit.rest.issues.createComment.mock.calls[0]?.[0];
    expect(call?.body).toContain("Loads data faster.");
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("makes no model call at all when the pull request is skipped", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    context.payload = { pull_request: pullRequest({ body: "too short" }) };

    await main();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(core.info.mock.calls[0]?.[0]).toContain("Skipping");
  });
});
