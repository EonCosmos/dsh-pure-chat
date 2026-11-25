# Changelog

## 1.4.2

- Documentation only: clear context is presented as its own capability instead of
  the last step of a three-step quick start. The READMEs now open with four
  independent capabilities, keep the quick start to chatting, searching and
  export, and give clearing the context its own section; the Plugins detail
  documents and the locale descriptions say the same.

## 1.4.1

- The preset label follows the host language instead of mixing both: **纯对话**
  on a Chinese system, **Pure chat** otherwise. DSH never translates
  user-authored preset metadata (and Loader expressions do not apply to a preset
  declaration, which is an entry group), so the host row now registers the
  preset itself with the copy of the resolved language; the patch inserts no
  preset declaration anymore.
- The language comes from the explicit DSH language setting when the host
  exposes one, otherwise from the host locale.

## 1.4.0

- npm support: `repository.url` now uses the `git+https://` form npm expects,
  `publishConfig.access` is declared, and the package publishes with a clean
  `npm publish --dry-run`. Install with `dsh plugin --profile <profile> add
  dsh-pure-chat` once it is published; npm-installed bundles can be updated from
  the Plugins page, unlike Git installs.
- Rewrote both READMEs: a short summary and quick start first, then the preset,
  the three tools, the clear-context behavior, how it works, and the limitations.
- The Plugins detail page now shows a Chinese introduction for Chinese locales:
  `meta.detail` points at `docs/DETAIL.zh.md` (English: `docs/DETAIL.md`), with a
  text-free feature illustration.

## 1.3.1

- Fixed the clear-context control never appearing: the Web client serves a
  package's `dsh.client` bundle only for a profile-tree entry named after that
  package, and a row mounted inside a preset's own tree is never scanned. The
  patch now inserts `pure-chat-host` (`dsh-pure-chat`, a no-op host row) beside
  the preset, and the preset mounts the scoped half as `dsh-pure-chat/preset`.
- After installing or updating, reload the page once so the client bundle is
  part of the boot manifest.

## 1.3.0

- Added the `write_file` tool: save text as `txt`, `md`, `doc` (RTF), `xls`
  (SpreadsheetML) or `pdf`. Files land inside the session working directory, a
  path that escapes it is refused, and PDF export renders through the DSH Office
  component so CJK text keeps its font.
- Added the clear-context control left of the composer's send button, with a
  confirmation dialog. It resets the model's context by replacing the session's
  conversational surface with one fresh message; the log, the transcript and the
  stored session are untouched, and the operation is also exposed as the
  `/clear-context` command. It refuses while a turn is running.
- The preset row is now named after the plugin (`pure-chat`) instead of after its
  first behavior (`no-global-tools`).
- Tests cover the four document builders, the write tool's path boundary and
  Office conversion path, and the surface replacement of the clear command.

## 1.2.0

- Renamed the package from `@local/dsh-pure-chat` to `dsh-pure-chat`, matching the
  unscoped convention of published DSH bundles. The preset id stays `pure-chat`,
  so sessions that selected it keep working; remove the old bundle before
  installing this one.
- The tool mask is re-derived on every `tools/change` instead of being snapshotted
  at activation, so host-global tools registered later — a plugin installed
  afterwards, an HMR reload — are hidden too.
- A mask the registry refuses now fails preset activation with a diagnostic,
  instead of silently leaving every tool visible; a failure after activation keeps
  the previous mask and logs an error.
- The reserved `run_code` transport is never named in a deny list.
- Declared `engines.dsh`, added a preset display name that reads in English and
  Chinese, moved `order` to 5 so it no longer ties with the shipped `ptc` preset,
  and added `npm test` coverage for the mask behavior.

## 1.1.0

- Preset `pure-chat`: conversation plus `web_search` / `web_fetch`, with the
  system prompt and every host-global tool hidden.
