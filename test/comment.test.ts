import { describe, expect, it, vi } from "vitest";
import { MARKER, findSticky, renderComment, upsertComment, type CommentApi } from "../src/comment.js";

const target = { owner: "DylPorter", repo: "demo", prNumber: 7 };

function fakeApi(existing: Array<{ id: number; body?: string }> = []): CommentApi & {
  createComment: ReturnType<typeof vi.fn>;
  updateComment: ReturnType<typeof vi.fn>;
} {
  return {
    listComments: vi.fn(async () => existing),
    createComment: vi.fn(async () => ({})),
    updateComment: vi.fn(async () => ({})),
  };
}

describe("renderComment", () => {
  it("embeds the marker so later runs can find it", () => {
    expect(renderComment("hello")).toContain(MARKER);
  });

  it("includes the rewrite verbatim", () => {
    expect(renderComment("Loads data faster.")).toContain("Loads data faster.");
  });

  it("tells the reader how to turn it off", () => {
    expect(renderComment("x")).toContain("no-claudish");
  });

  // Required of generative-AI products by the GitHub Marketplace Developer
  // Agreement. Removing either of these breaks the listing's compliance, so
  // they are pinned rather than left to good intentions.
  it("discloses that the content is AI-generated (Marketplace §3.4.ii)", () => {
    const body = renderComment("x");
    expect(body).toContain("AI-generated");
    expect(body).toContain("language model");
  });

  it("offers a way to report a bad output (Marketplace §3.4.iii)", () => {
    expect(renderComment("x")).toContain("/issues/new");
  });

  it("says the model can be wrong and the original is preserved", () => {
    const body = renderComment("x");
    expect(body).toContain("can be wrong");
    expect(body).toContain("original is unchanged");
  });
});

describe("findSticky", () => {
  it("finds the comment carrying the marker", () => {
    expect(findSticky([{ id: 1, body: "hi" }, { id: 2, body: `${MARKER}\nx` }])).toBe(2);
  });

  it("returns undefined when no comment carries it", () => {
    expect(findSticky([{ id: 1, body: "hi" }])).toBeUndefined();
  });

  it("tolerates comments with no body", () => {
    expect(findSticky([{ id: 1, body: undefined }])).toBeUndefined();
  });

  it("returns the first match when duplicates somehow exist", () => {
    expect(findSticky([{ id: 5, body: MARKER }, { id: 9, body: MARKER }])).toBe(5);
  });
});

describe("upsertComment", () => {
  it("creates a comment when none exists", async () => {
    const api = fakeApi();
    await expect(upsertComment(api, target, "plain words")).resolves.toBe("created");

    expect(api.createComment).toHaveBeenCalledOnce();
    expect(api.updateComment).not.toHaveBeenCalled();
    expect(api.createComment.mock.calls[0]?.[0]).toMatchObject({
      owner: "DylPorter",
      repo: "demo",
      issue_number: 7,
    });
  });

  it("edits the existing comment instead of adding a second one", async () => {
    const api = fakeApi([{ id: 42, body: `${MARKER}\nold text` }]);
    await expect(upsertComment(api, target, "new text")).resolves.toBe("updated");

    expect(api.createComment).not.toHaveBeenCalled();
    expect(api.updateComment).toHaveBeenCalledOnce();

    const call = api.updateComment.mock.calls[0]?.[0] as { comment_id: number; body: string };
    expect(call.comment_id).toBe(42);
    expect(call.body).toContain("new text");
    expect(call.body).not.toContain("old text");
  });

  it("ignores unrelated comments from other bots", async () => {
    const api = fakeApi([
      { id: 1, body: "<!-- some-other-bot -->\ncoverage report" },
      { id: 2, body: "a human said something" },
    ]);
    await expect(upsertComment(api, target, "x")).resolves.toBe("created");
  });
});
