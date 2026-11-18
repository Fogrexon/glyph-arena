/**
 * A compiler diagnostic, rewritten so a log reader does not treat it as a failure.
 *
 * `tsc` prints `file.ts(11,3): error TS2305: …`, and GitHub's runner has a matcher for exactly that
 * shape: the line comes back as an `##[error]` annotation. A `PEND` line is a statement about a
 * release — the run is green, the documents are simply ahead of the registry — so a red annotation
 * on it says something false about the run. Dropping the position keeps every word of the message
 * and the code, and stops the line from matching.
 *
 * This is only for lines that are *not* failures. A real failure should be annotated; there the
 * position is the first thing a reader wants.
 */
export function quietDiagnostic(line) {
  return String(line).replace(/^(.+?)\(\d+,\d+\):\s*error\s+(TS\d+):/, "$1: $2:");
}
