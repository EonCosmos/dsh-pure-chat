# Pure chat (纯对话)

English | [中文](README.zh.md)

A DSH bundle that adds one **agent preset** for plain conversation. The dialogue
goes to the model as-is — no system prompt, no file, shell, terminal, skill,
subagent, team, or goal tools — plus three tools of its own: web search, page
fetch, and document export. A **clear context** control in the composer resets
what the model reads without touching the conversation you see.

**Quick start**

1. Create a session and choose **Pure chat** in the preset control (it reads
   **纯对话** on a Chinese system).
2. Ask anything. Add “查一下 …” if you want it to search the web.
3. Say “export that as PDF / Excel / Word” to get a file, and use the button left
   of the send arrow when the context should start over.

```sh
# install (npm, after the package is published)
dsh plugin --profile web add dsh-pure-chat
# install (GitHub, available now)
dsh plugin --profile web add github:EonCosmos/dsh-pure-chat
```

## What it gives you

### A plain-chat preset

The preset appears as **Pure chat**, or **纯对话** on a Chinese system: DSH does
not translate user-authored preset metadata, so the plugin registers the preset
with the copy of the host language instead of shipping a mixed label.

A session that selects the preset sends only your messages, the replies, the
tool calls they make, and one runtime note DSH requires to validate the session
directory (for example `Current working directory: "C:\..."`). It does not get
the Harness identity, agent instructions, persona, skill catalog, tool-usage
guidance, sandbox or approval policy text, or any subagent identity.

Every host-global tool is hidden — including the Agent Teams tools mounted at
host scope — so the model sees exactly the preset's own three tools.

### `web_search` and `web_fetch`

- `web_search` searches the web and returns an optional answer plus source URLs.
- `web_fetch` retrieves one URL as markdown or plain text.

`web_search` is admitted only while the selected model route has a ready search
provider; `web_fetch` uses the HTTP provider and stays available.

### `write_file` — export a document

The model calls it with a path, the complete content, and optionally a format:

| Format | Written as | Opens in |
|---|---|---|
| `txt` | UTF-8 text | any editor |
| `md` | UTF-8 Markdown | any editor, DSH |
| `doc` | an RTF document (`.doc`) | Word, WPS, LibreOffice |
| `xls` | a SpreadsheetML workbook (`.xls`) | Excel, WPS |
| `pdf` | a real PDF | any PDF viewer |

Rules worth knowing:

- Files land **inside the session working directory**; a path that escapes it is
  refused, and missing parent directories are created.
- For `xls`, write one row per line and separate cells with a tab (a comma is
  used when the line has no tab). The first row becomes the header, and cells
  that are exactly numbers become numeric cells.
- `pdf` renders the same document through the DSH Office component
  (`office-kit`), so Chinese text keeps its font. Without that component the tool
  reports a clear error instead of writing an unreadable PDF.
- Content is capped at 4 MiB.

### Clear context

A small button sits left of the send arrow; it is shown only in sessions of this
preset.

1. Click it — a confirmation dialog explains the effect.
2. Confirm, and the model starts from a fresh context.

DSH derives the model's history from the session's ordered **surface**, so
clearing appends one synthetic user message whose surface replacement covers
every earlier conversational node. The log keeps every event, the transcript
keeps every message exactly as it was, and the next request derives only the
fresh message — no old bubble changes, and no new one appears. The command
refuses while a turn is still running and reports “already empty” when there is
nothing to clear.

The same operation is available as the `/clear-context` command.

## How it works

- **Tool hiding.** The preset mounts its tools in its own scope and denies every
  host-global tool by name (`ctx.tools.restrict({ deny })`); scoped registrations
  stay visible. The deny list is re-derived on every `tools/change`, so a global
  tool registered later — a plugin installed afterwards, an HMR reload — is
  hidden too. If the registry refuses the mask, the preset fails to activate
  instead of silently starting with every tool.
- **Client half.** The patch inserts the package's own host row
  (`pure-chat-host`), and that row's plugin also registers the preset with the
  copy of the host language. The Web client discovers a package's `dsh.client`
  bundle only through a profile-tree entry named after that package, so this row
  is what puts the clear-context control into the page; the preset's composition
  mounts the scoped half as `dsh-pure-chat/preset`.
- **No compaction.** Nothing rewrites or summarises the conversation; use clear
  context or a new session when it grows too long.

## Requirements

- DSH `>= 0.2.2-rc.5` (`engines.dsh`).
- A configured search provider for `web_search`; `web_fetch` needs none.
- `office-kit` for PDF export; `doc` and `xls` need no extra component.

## Install

From npm (once published):

```sh
dsh plugin --profile <profile> add dsh-pure-chat
```

From GitHub (available now):

```sh
dsh plugin --profile <profile> add github:EonCosmos/dsh-pure-chat
```

Local development: **Plugins → Add plugin → this directory**, or
`plugin_manager` with `action: install_bundle`.

After installing or updating, reload the page once so the client bundle enters
the boot manifest, then start a **new session** — an existing session keeps the
composition it started with.

## Limitations

- **Tool use is agent-loop work.** Searches and file writes are model tool calls
  executed by the loop; everything else about the turn is a plain chat.
- The tool-guidance prompt sections are suppressed with the rest of the system
  prompt, so the model relies on each tool's own short description. Ask
  explicitly (“查一下 …”) when you want a search.
- Very long conversations eventually exceed the model context window; there is
  no automatic compaction.
- `pdf` needs the DSH Office component.
- The preset is a composition, not a security boundary: it controls what the
  model is told and what it can call, not who may install plugins.

## Update and remove

A Git install has no one-click update: remove the bundle in **Plugins**, then
install again. An npm install can be updated from the same page.

- Since 1.2.0 the package is `dsh-pure-chat` (previously `@local/dsh-pure-chat`);
  remove the old row before installing.
- Sessions created before an update keep their original composition.

## Develop

```sh
npm test          # documents, tool boundary, surface clearing, client module
npm pack --dry-run # packaged file list
npm publish --dry-run # publish readiness
```

## License

MIT © EonCosmos
