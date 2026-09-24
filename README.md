# exaroton MCP server

A local stdio [Model Context Protocol](https://modelcontextprotocol.io/) server for managing [exaroton](https://exaroton.com/) Minecraft servers with the official [`exaroton`](https://www.npmjs.com/package/exaroton) Node.js client.

## Setup

1. Install Node.js 22 or newer.
2. Run `npm install` in this folder.
3. Create an API token at [exaroton account settings](https://exaroton.com/account). Pass it as `EXAROTON_API_TOKEN` in your MCP host configuration. Keep the token private.

Example MCP host configuration (replace the path and token):

```json
{
  "mcpServers": {
    "exaroton": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-exaroton/src/index.js"],
      "env": {
        "EXAROTON_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

You can also run it with `EXAROTON_API_TOKEN=... npm start` from this folder. The process speaks MCP over stdin and stdout, so it waits for a host connection. Diagnostics go to stderr.

The official exaroton client sends `Authorization: Bearer <token>` to exaroton automatically. Set `EXAROTON_API_TOKEN` to the raw token or to `Bearer <token>`; both forms work. Bearer is the authentication scheme, not a default credential. Since this MCP server uses stdio, there is no HTTP Authorization header on its MCP connection. The MCP host supplies the token when it launches the process.

No build step is needed. After publishing the current package name, use `npx -y @mcporg/exaroton` with the same token environment variable. The published MCP host configuration can use `"command": "npx"` and `"args": ["-y", "@mcporg/exaroton"]`.

The package has an MCP Registry manifest in `server.json`. Its `name` matches `package.json`'s `mcpName`, and it declares the token as a required secret environment variable. The `@mcporg` npm scope and `io.github.mcporg` MCP Registry namespace are provisional examples: replace both if you do not control them. The Registry requires namespace ownership and a matching published npm package before it will accept the manifest.

## Tools

| Area | Tools |
| --- | --- |
| Account and servers | `get_account`, `list_servers`, `get_server` |
| Server actions | `start_server`, `stop_server`, `restart_server`, `execute_command`, `extend_stop_time` |
| Logs and settings | `get_logs`, `share_logs`, `get_ram`, `set_ram`, `get_motd`, `set_motd` |
| Player lists | `list_player_lists`, `get_player_list`, `add_player_entries`, `remove_player_entries` |
| Server files | `get_file_info`, `read_file`, `write_file`, `delete_file`, `create_directory` |
| Config files | `get_config_options`, `set_config_options` |
| Credit pools | `list_pools`, `get_pool`, `get_pool_members`, `get_pool_servers` |

Use `list_servers` to find a server ID. File paths are relative to the server root; use an empty path with `get_file_info` to list the root. `read_file` is for text files. `write_file` replaces the entire remote file content. `set_config_options` validates types and select choices against the current config before saving. Logs and player lists can be cached by exaroton, so recent changes may not appear immediately.

Starting a server may spend credits. `share_logs` publishes log contents to mclo.gs. Console commands and file deletion can have effects that the API cannot undo. The MCP host decides whether to request user confirmation for these tools.

The server has no local file upload or download tools; server text files can be read or written through MCP. The exaroton client's websocket streams are not exposed as MCP tools.

## Development

Run `npm test` for a local MCP protocol test using a fake exaroton client. No token or live server is required.

API references: [exaroton client](https://github.com/exaroton/node-exaroton-api) · [exaroton API](https://developers.exaroton.com/) · [MCP server SDK](https://ts.sdk.modelcontextprotocol.io/v2/)
