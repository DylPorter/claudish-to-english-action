/**
 * Pure decision layer: should this pull request be rewritten at all?
 *
 * No network, no Actions runtime, no Octokit — everything this needs arrives
 * as arguments so the rules can be tested directly.
 */

export interface SkipContext {
  body: string | null | undefined;
  labels: readonly string[];
  minChars: number;
  skipLabel: string;
}

export type SkipDecision = { skip: true; reason: string } | { skip: false };

/**
 * Remove fenced code blocks. The original plugin does this with an awk
 * toggle on lines starting with ```; a description that is mostly a stack
 * trace or a config dump has very little prose to simplify, and counting
 * the code would let it sneak past the length floor.
 *
 * An unterminated fence swallows the rest of the string, which matches awk's
 * behaviour and is the safe direction — we under-count rather than over-count.
 */
export function stripCodeBlocks(markdown: string): string {
  const kept: string[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) kept.push(line);
  }

  return kept.join("\n");
}

/** Non-whitespace character count of the prose, ignoring fenced code. */
export function proseLength(markdown: string): number {
  return stripCodeBlocks(markdown).replace(/\s/g, "").length;
}

export function shouldSkip(ctx: SkipContext): SkipDecision {
  const body = ctx.body?.trim() ?? "";

  if (body.length === 0) {
    return { skip: true, reason: "pull request has no description" };
  }

  const label = ctx.labels.find(
    (l) => l.toLowerCase() === ctx.skipLabel.toLowerCase(),
  );
  if (label !== undefined) {
    return { skip: true, reason: `pull request is labelled "${label}"` };
  }

  const length = proseLength(body);
  if (length < ctx.minChars) {
    return {
      skip: true,
      reason: `description is ${length} characters of prose, below the ${ctx.minChars} minimum`,
    };
  }

  return { skip: false };
}
