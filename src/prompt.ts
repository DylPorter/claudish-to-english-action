/**
 * Builds the messages sent to the model.
 *
 * The system prompt is taken verbatim from gvzdv/claudish-to-english's
 * rewrite.sh, adapted only where the domain differs ("the assistant's
 * message" -> "the pull request description").
 */

export interface Message {
  role: "system" | "user";
  content: string;
}

export interface PromptContext {
  title: string;
  body: string;
  changedFiles: readonly string[];
}

/** How many file paths to include as grounding before it stops being cheap. */
export const MAX_CONTEXT_FILES = 40;

const BASE_SYSTEM_PROMPT =
  "You rewrite the pull request description into much simpler, plain English. " +
  "Keep every fact, name, number, and file path. Use short sentences and everyday words. " +
  "Leave fenced code blocks unchanged. " +
  "Output ONLY the rewritten description with no preamble, labels, or commentary.";

/**
 * The original passes the user's question as context-only, with an explicit
 * instruction never to answer or repeat it. Same mechanism here, filled with
 * the PR title and the paths it touches — enough to ground the rewrite in the
 * real change without paying for diff content.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const files = ctx.changedFiles.slice(0, MAX_CONTEXT_FILES);
  const truncated = ctx.changedFiles.length - files.length;

  if (files.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const fileList = files.map((f) => `- ${f}`).join("\n");
  const more = truncated > 0 ? `\n- ...and ${truncated} more files` : "";

  return (
    BASE_SYSTEM_PROMPT +
    "\n\n" +
    `For context, this pull request is titled "${ctx.title}" and changes these files:\n` +
    fileList +
    more +
    "\n\nUse this only to understand the description. Do NOT rewrite, answer, or repeat " +
    "the title or the file list — rewrite only the description that follows."
  );
}

export function buildMessages(ctx: PromptContext): Message[] {
  return [
    { role: "system", content: buildSystemPrompt(ctx) },
    { role: "user", content: ctx.body },
  ];
}
