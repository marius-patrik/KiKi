/**
 * Extracts the issue numbers a pull request claims to act on.
 *
 * Two conventions are in use in this repository, and each applies to exactly
 * one field. GitHub's closing keywords carry the link in the body. A trailing
 * `(#123)` reference carries it in the title, which is how merged pull requests
 * here name the issue they close.
 *
 * The fields are matched separately on purpose. A body is prose, and prose
 * mentions issues it is not acting on — "it does not provision the CI node
 * itself (#114)" names an issue precisely to say the pull request leaves it
 * alone. Matching the parenthesised form against body text turns that sentence
 * into a link and drags the wrong issue through the pull request's lifecycle.
 *
 * @module @dsh-stack/scripts/parse-linked-issue-numbers
 */

const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const TITLE_REFERENCE = /\(#(\d+)\)/g;

/**
 * Collects every issue number a pull request links, by convention and field.
 *
 * @param {string} title - The pull request title; scanned for `(#123)` and for
 *   closing keywords.
 * @param {string} body - The pull request body; scanned for closing keywords
 *   only, so a parenthesised mention in prose is not a link.
 * @returns {number[]} Linked issue numbers, ascending, without duplicates.
 */
export function parseLinkedIssueNumbers(title, body) {
  const found = new Set();
  const scan = (text, pattern) => {
    pattern.lastIndex = 0;
    for (const match of (text ?? "").matchAll(pattern)) found.add(Number(match[1]));
  };

  scan(title, TITLE_REFERENCE);
  scan(title, CLOSING_KEYWORD);
  scan(body, CLOSING_KEYWORD);

  return [...found].sort((a, b) => a - b);
}
