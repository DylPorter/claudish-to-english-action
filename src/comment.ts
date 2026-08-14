/**
 * The sticky comment: one per pull request, edited in place on every run.
 *
 * Identified by a hidden HTML marker rather than by author, so it keeps
 * working when the token identity changes (github-actions[bot] on one repo,
 * a GitHub App on another) and so a human can delete it without the next
 * push resurrecting a duplicate alongside it.
 */

export const MARKER = "<!-- claudish-to-english -->";

/** The minimum Octokit surface this module needs, so tests can pass a fake. */
export interface CommentApi {
  listComments(params: {
    owner: string;
    repo: string;
    issue_number: number;
  }): Promise<Array<{ id: number; body?: string | undefined }>>;
  createComment(params: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<unknown>;
  updateComment(params: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }): Promise<unknown>;
}

export interface CommentTarget {
  owner: string;
  repo: string;
  prNumber: number;
}

const REPO = "https://github.com/DylPorter/claudish-to-english-action";

export function renderComment(rewrite: string): string {
  return [
    MARKER,
    "### 💬 In plain English",
    "",
    rewrite,
    "",
    // The AI-generated disclosure and the feedback link are required of
    // products that interact with generative AI, per the GitHub Marketplace
    // Developer Agreement §3.4(ii) and §3.4(iii). Keep both.
    `<sub>🤖 **AI-generated.** Rewritten from the author's description by a language model via ` +
      `[claudish-to-english](${REPO}) — it can be wrong, so the original is unchanged above. ` +
      `[Report a bad rewrite](${REPO}/issues/new) · Add the \`no-claudish\` label to turn this off.</sub>`,
  ].join("\n");
}

export function findSticky(
  comments: ReadonlyArray<{ id: number; body?: string | undefined }>,
): number | undefined {
  return comments.find((c) => c.body?.includes(MARKER))?.id;
}

/** Creates the comment, or edits the existing one. Returns what it did. */
export async function upsertComment(
  api: CommentApi,
  target: CommentTarget,
  rewrite: string,
): Promise<"created" | "updated"> {
  const body = renderComment(rewrite);
  const existing = findSticky(
    await api.listComments({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.prNumber,
    }),
  );

  if (existing !== undefined) {
    await api.updateComment({
      owner: target.owner,
      repo: target.repo,
      comment_id: existing,
      body,
    });
    return "updated";
  }

  await api.createComment({
    owner: target.owner,
    repo: target.repo,
    issue_number: target.prNumber,
    body,
  });
  return "created";
}
