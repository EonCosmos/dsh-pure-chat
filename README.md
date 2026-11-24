# Pure chat (纯对话)

English | [中文](README.zh.md)

A DSH bundle that adds one selectable **agent preset**. A session using that
preset sends the conversation to the model as-is — no system prompt, no file,
shell, terminal, skill, subagent, team, or goal tools — and exposes exactly
three tools of its own:

- `web_search` — search the web and return an optional answer plus sources;
- `web_fetch` — fetch one URL as markdown/text;
- `write_file` — save text as a document in the session working directory.

The bundle also adds a **clear context** control to the composer, left of the
send button: it resets what the model reads without touching the conversation
you see.

## Use it

1. Create a new session.
2. In the preset control above the composer (the “New Session” row), choose
   **Pure chat (纯对话)**.
3. Ask your question. If it needs current information, the model calls
   `web_search` (and `web_fetch` for a specific page) and answers with the
   results.

The preset is recorded in the session, so the session keeps behaving this way
after restart. A session keeps the composition it started with: after updating
this bundle, start a new session to get the new behavior.

## What reaches the model

- Your user messages, the assistant replies, web tool calls and their results.
- Exactly one runtime-context notice that DSH requires to validate the session
  directory, for example `Current working directory: "C:\..."`.
- The three tool schemas (name, description, parameters).
- The model route and reasoning effort selected for the session.

It does **not** receive the Harness identity, agent instructions, persona, the
skill catalog, the usual tool-usage guidance, sandbox/approval policy text, or
any subagent identity. Every host-global tool — including the Agent Teams tools
mounted at host scope — is hidden by the bundled plugin; the preset mounts only
its own three tools.

## Export a file

Ask for a file (“把上面的内容导出成 PDF”), and the model calls `write_file`
with a path, the complete content, and optionally a format. Supported formats:

| Format | Written as | Opens in |
|---|---|---|
| `txt` | UTF-8 text | any editor |
| `md` | UTF-8 Markdown | any editor, DSH |
| `doc` | an RTF document (`.doc`) | Word, WPS, LibreOffice |
| `xls` | a SpreadsheetML workbook (`.xls`) | Excel, WPS |
| `pdf` | a real PDF | any PDF viewer |

Details worth knowing:

- Files are written **inside the session working directory**; a path that
  escapes it is refused, and missing parent directories are created.
- For `xls`, write one row per line and separate cells with a tab (a comma is
  used when the line has no tab); the first row becomes the header, and numeric
  cells become real numbers.
- `pdf` renders the same document through the DSH Office component
  (`office-kit`), so CJK text keeps its font. A deployment without that
  component reports a clear error instead of writing an unreadable PDF.
- Content is capped at 4 MiB. The tool writes bytes itself because two of the
  formats are not UTF-8 text; the path check above is its boundary.

## Clear the context

A small button sits left of the send arrow in the composer. It is shown only in
sessions of this preset.

1. Click the button. A confirmation dialog explains what happens.
2. Confirm, and the model starts from a fresh context.

What exactly happens: DSH derives the model's history from the session's ordered
**surface**, so clearing appends one synthetic user message whose surface
replacement covers every earlier conversational node. The log keeps every event,
the transcript keeps every message exactly as it was, and the next request
derives only the fresh message. The chat view renders only appended messages, so
no new bubble appears either. The command refuses while a turn is still running,
and reports “already empty” when there is nothing to clear.

The same operation is available as the `/clear-context` command for this preset.

## How it hides tools

The preset mounts its own tools in its scope and denies every host-global tool
by name (`ctx.tools.restrict({ deny })`). Scoped registrations are exempt from
that mask, so the preset's tools stay visible; `allow: []` is not an alternative,
because the registry rejects an empty filter.

- The deny list is **re-derived on every `tools/change`**, not snapshotted at
  activation, so a global tool registered later — a plugin installed afterwards,
  an HMR reload — is hidden too.
- `run_code` is never named in a deny list because the registry reserves it, and
  this preset mounts no PTC executor, so it cannot be called here either.
- If the registry refuses the restriction, the preset **fails to activate**
  instead of silently starting as an agent that owns every tool. The row then
  carries its diagnostic in Plugins.

## Limitations

- **Tool use is still agent-loop work.** Web lookups and file writes happen as
  model tool calls, executed by the loop. Everything else about the turn is a
  plain chat.
- The tool-guidance prompt sections are suppressed with the rest of the system
  prompt, so the model relies on each tool's own short description. It may not
  search when a query looks like general knowledge; ask explicitly (“查一下
  …”) if it does not.
- No compaction is mounted, so a very long conversation eventually exceeds the
  model context window. Start a new session, clear the context, or switch to a
  larger-context model.
- `web_search` is admitted only while the selected model route has a ready
  search provider; `web_fetch` uses the HTTP provider and stays available.
- `pdf` needs the DSH Office component; `doc` and `xls` need no extra component.
- The preset is a composition, not a security boundary: it controls what the
  model is told and what it can call, not who may install plugins.

## Requirements

- DSH `>= 0.2.2-rc.5`, declared as `engines.dsh`.
- A configured search provider for `web_search`; `web_fetch` needs none.
- The web client bundle (`dsh-client-ui-conversation`) for the clear-context
  button, and `office-kit` for PDF export.

## Install

From GitHub:

```sh
dsh plugin --profile <profile> add github:EonCosmos/dsh-pure-chat
```

For local development, use **Plugins → Add plugin → this directory**, or
`plugin_manager` with `action: install_bundle` and this package directory.

## Upgrade

A Git install cannot use the one-click update action; reinstall with the install
command above. The preset id stays `pure-chat`, so sessions that already
selected it keep working.

Version 1.2.0 renamed the package from `@local/dsh-pure-chat` to
`dsh-pure-chat`. Remove the old bundle first (**Plugins → Remove**), then
install, or the profile keeps both rows and two declarations of the same preset.

Version 1.3.0 adds the `write_file` tool and the clear-context control; a
session keeps the composition it started with, so start a new session to see
them.

## Tests

```sh
npm test
```
