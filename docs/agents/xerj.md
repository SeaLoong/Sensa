# Local code and documentation search

Use `xerj-sensa` for ranked discovery of mechanisms across Sensa code and documentation. Use `rg` for exact symbols, file names and literal text. Read the current files before editing: the index can lag while a change is being processed.

## Search

1. Call `xerj_map` to inspect the available `sensa-*` indices and their fields.
2. Call `xerj_search` with `index: "sensa-*"`, a plain string `query`, a small `size` and `max_tokens`. String queries use definition-first ranking and return matching passages. An object `query` is an Elasticsearch DSL clause, rather than a complete request body; use the discovered field map when constructing one.
3. Open the returned source path and confirm the mechanism and line numbers against the current checkout. If results are missing or stale, use `rg` and check the service status and logs.

Example `xerj_search` arguments, verified against the installed MCP schema:

```json
{
  "index": "sensa-*",
  "query": "InputActivation",
  "size": 5,
  "max_tokens": 1500
}
```

Always pass the index pattern: XERJ's default is `ax-*`, whereas this project deliberately uses `sensa-*`.

XERJ rc.96 has an upstream mapping-order bug when its live-index path handles serialized Unity resources and `.meta` files. `.xerjignore` excludes those resource formats so code/document indexing can complete. Unity C# sources and documentation remain indexed; use `rg` for scenes, prefabs, assets and metadata. Keep these exclusions until an upstream fix is verified with a fresh index.

The node uses the offline lexical embedder. Its semantic tools use feature hashing; neural embeddings require a separate, explicit setup. The project MCP allowlist exposes retrieval and planning tools. Reference-corpus downloads, external reranking and memory writes are outside this setup.

## Install and connect

Install a native binary from the [official XERJ releases](https://github.com/xerj-org/xerj/releases). The verified Windows setup uses `v1.0.0-rc.96`: download the archive for your CPU and its `.sha256` companion, compare with `Get-FileHash -Algorithm SHA256`, then extract it. See the [upstream installation guide](https://xerj.org/docs/install) for other platforms.

Copy the [portable MCP template](../../.codex/config.toml.example) to the ignored `.codex/config.toml`, preserving other servers when merging an existing configuration. [Codex project MCP configuration](https://developers.openai.com/codex/mcp/) loads for trusted projects.

The template invokes `python` from PATH and discovers the checkout from the session's current directory or its ancestors, so it also works from a subdirectory. Keep machine paths out of configuration and examples. The launcher discovers `xerj` on PATH, in `.codex/bin/`, or in supported user-local installation locations computed at runtime, including the verified Windows release archive layout. An optional `XERJ_BIN` environment variable can name a command or a repository-relative executable; user-local environment values are supplied at runtime.

Confirm registration with `codex mcp get xerj-sensa`, then restart the MCP server or reopen the project chat to load its tools. The launcher starts the shared local node and file watcher automatically. Diagnostics stay in log files; MCP stdout contains only protocol messages.

## Local service

The service listens on `127.0.0.1:19200`; XERJ also reserves ports 19201 and 19202. It uses local development mode without TLS or authentication. Keep these listeners on loopback. The index, watcher journal and logs are stored outside the checkout in a per-checkout local state directory. Machine paths and indexed data are excluded from Git.

The watcher follows `.gitignore` and `.xerjignore`, skips hidden files and external symlinks, and caps files at 10 MiB. Dot directories such as `.github/` and `.codex/` are absent from the index; use `rg --hidden` when looking there. It uses `--no-graph` so additions, deletions and renames reconcile with the index; see [XERJ live reindexing](https://github.com/xerj-org/xerj/blob/v1.0.0-rc.96/docs/LIVE_REINDEXING.md). A failed indexing pass requires another file change or a service restart before it retries. Check the logs when results appear stale.

Use the same installation discovery when running the helper from a terminal; `XERJ_BIN` is optional. Inspect available commands with `python scripts/xerj.py --help`. Stopping the service affects Codex search; the next MCP launch starts it again. This helper never starts Sensa or connects to device transports.
