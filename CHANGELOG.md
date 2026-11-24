# Changelog

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
