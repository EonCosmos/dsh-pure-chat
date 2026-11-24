/**
 * Host half of the dsh-pure-chat bundle.
 *
 * This entry exists so the package appears as a top-level Loader row named after
 * itself: the Web client discovers `dsh.client` and serves `client.js` from the
 * profile tree's entries, and an entry mounted only inside a preset's own tree is
 * never scanned. All preset-scoped behavior lives in `./preset.js`, mounted by
 * the `preset-pure-chat` declaration.
 */
export function apply() {}
