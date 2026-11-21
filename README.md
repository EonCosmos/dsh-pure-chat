# Pure chat (纯对话)

English | [中文](README.zh.md)

A DSH bundle that adds one selectable **agent preset**. A session using that
preset sends the conversation to the model as-is — no system prompt, no file,
shell, terminal, skill, subagent, team, or goal tools — and exposes exactly two
read-only network tools so the model can look things up:

- `web_search` — search the web and return an optional answer plus sources;
- `web_fetch` — fetch one URL as markdown/text.

## Use it

1. Create a new session.
2. In the preset control above the composer (the “New Session” row), choose
   **纯对话 / Pure chat**.
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
- The two web tool schemas (name, description, parameters).
- The model route and reasoning effort selected for the session.

It does **not** receive the Harness identity, agent instructions, persona, the
skill catalog, the usual tool-usage guidance, sandbox/approval policy text, or
any subagent identity. Every host-global tool — including the Agent Teams tools
mounted at host scope — is hidden by the bundled plugin; the preset mounts only
the two web tools.

## Limitations

- **Tool use is still agent-loop work.** Web lookups happen as model tool calls,
  executed by the loop. Everything else about the turn is a plain chat.
- The tool-guidance prompt sections are suppressed with the rest of the system
  prompt, so the model relies on each tool's own short description. It may not
  search when a query looks like general knowledge; ask explicitly (“查一下
  …”) if it does not.
- No compaction is mounted, so a very long conversation eventually exceeds the
  model context window. Start a new session or switch to a larger-context model.
- `web_search` is admitted only while the selected model route has a ready
  search provider; `web_fetch` uses the HTTP provider and stays available.
- The preset is a composition, not a security boundary: it controls what the
  model is told and what it can call, not who may install plugins.

## Install

From GitHub:

```sh
dsh plugin --profile <profile> add github:EonCosmos/dsh-pure-chat
```

For local development, use **Plugins → Add plugin → this directory**, or
`plugin_manager` with `action: install_bundle` and this package directory.
