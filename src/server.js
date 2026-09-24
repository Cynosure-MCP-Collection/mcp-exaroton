import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import packageInfo from '../package.json' with { type: 'json' };

const serverId = z.string().trim().min(1).describe('exaroton server ID');
const poolId = z.string().trim().min(1).describe('exaroton credit pool ID');
const filePath = z.string().min(1).describe('Path relative to the server root, e.g. server.properties');
const listName = z.string().trim().min(1).describe('Player list name, e.g. whitelist, ops, banned-players');
const nonemptyText = z.string().min(1);
const entries = z.array(nonemptyText).min(1).max(100);
const readOnly = { readOnlyHint: true };
const additive = { readOnlyHint: false, destructiveHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true };

function result(value) {
  const data = JSON.parse(JSON.stringify(value));
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: Array.isArray(data) ? { items: data } : data,
  };
}

function toolTitle(name) {
  return name.split('_').map((word) => {
    if (word === 'ram' || word === 'motd') return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function action(server, name) {
  return { success: true, serverId: server.id, action: name };
}

function fileInfo(file) {
  return {
    path: file.path,
    name: file.name,
    isTextFile: file.isTextFile,
    isConfigFile: file.isConfigFile,
    isDirectory: file.isDirectory,
    isLog: file.isLog,
    isReadable: file.isReadable,
    isWritable: file.isWritable,
    size: file.size,
    children: file.children?.map(fileInfo) ?? null,
  };
}

function optionInfo(option) {
  return {
    key: option.getKey(),
    label: option.getLabel(),
    type: option.getType(),
    value: option.getValue(),
    options: option.getOptions(),
  };
}

function checkConfigValue(option, value) {
  const type = option.getType();
  const valid = type === 'boolean' ? typeof value === 'boolean'
    : type === 'number' ? Number.isInteger(value)
      : type === 'float' ? typeof value === 'number' && Number.isFinite(value)
        : type === 'multiselect' ? Array.isArray(value) && value.every((item) => typeof item === 'string')
          : typeof value === 'string';
  if (!valid) throw new Error(`Invalid value for ${option.getKey()} (expected ${type})`);
  const choices = option.getOptions();
  if (Array.isArray(choices) && (type === 'select' || type === 'multiselect')) {
    const selected = Array.isArray(value) ? value : [value];
    if (selected.some((item) => !choices.includes(item))) {
      throw new Error(`Invalid choice for ${option.getKey()}; allowed: ${choices.join(', ')}`);
    }
  }
}

export function createServer(client) {
  const mcp = new McpServer({
    name: packageInfo.mcpName ?? packageInfo.name,
    title: 'exaroton Minecraft Server Manager',
    description: packageInfo.description,
    version: packageInfo.version,
    websiteUrl: packageInfo.homepage,
    icons: [{
      src: `https://unpkg.com/${packageInfo.name}@${packageInfo.version}/icon.png`,
      mimeType: 'image/png',
      sizes: ['512x512'],
    }],
  }, {
    instructions: 'Use list_servers to discover IDs. Start/stop/restart and other write tools change the actual hosted server. Logs and player lists may be cached by exaroton.',
  });

  function tool(name, description, inputSchema, annotations, handler) {
    mcp.registerTool(name, { title: toolTitle(name), description, inputSchema, annotations }, async (args) => {
      try {
        return result(await handler(args));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `exaroton: ${message}` }], isError: true };
      }
    });
  }

  tool('get_account', 'Get account name, credit balance, and account details.', z.object({}), readOnly,
    async () => client.getAccount());
  tool('list_servers', 'List accessible exaroton servers and their current status.', z.object({}), readOnly,
    async () => client.getServers());
  tool('get_server', 'Get current details and status for one server.', z.object({ serverId }), readOnly,
    async ({ serverId }) => client.server(serverId).get());

  tool('start_server', 'Start a server. This may consume credits. Set useOwnCredits for a shared server when appropriate.',
    z.object({ serverId, useOwnCredits: z.boolean().default(false) }), destructive,
    async ({ serverId, useOwnCredits }) => { const server = client.server(serverId); await server.start(useOwnCredits); return action(server, 'start'); });
  tool('stop_server', 'Stop a running server.', z.object({ serverId }), destructive,
    async ({ serverId }) => { const server = client.server(serverId); await server.stop(); return action(server, 'stop'); });
  tool('restart_server', 'Restart a running server.', z.object({ serverId }), destructive,
    async ({ serverId }) => { const server = client.server(serverId); await server.restart(); return action(server, 'restart'); });
  tool('execute_command', 'Execute a Minecraft server console command. Commands can change server state.',
    z.object({ serverId, command: nonemptyText.describe('Command without a leading slash, e.g. say Hello') }), destructive,
    async ({ serverId, command }) => { const server = client.server(serverId); await server.executeCommand(command); return action(server, 'execute_command'); });
  tool('extend_stop_time', 'Extend the server automatic stop timer by the given number of seconds.',
    z.object({ serverId, seconds: z.number().int().positive() }), additive,
    async ({ serverId, seconds }) => { const server = client.server(serverId); await server.extendStopTime(seconds); return action(server, 'extend_stop_time'); });

  tool('get_logs', 'Get cached server log text; it may lag behind live console output.', z.object({ serverId }), readOnly,
    async ({ serverId }) => ({ serverId, logs: await client.server(serverId).getLogs() }));
  tool('share_logs', 'Upload cached server logs to mclo.gs and return a public URL.', z.object({ serverId }), destructive,
    async ({ serverId }) => ({ serverId, url: await client.server(serverId).shareLogs() }));
  tool('get_ram', 'Get configured server RAM in GiB.', z.object({ serverId }), readOnly,
    async ({ serverId }) => ({ serverId, ramGiB: await client.server(serverId).getRAM() }));
  tool('set_ram', 'Set server RAM in full GiB, from 2 to 16.', z.object({ serverId, ramGiB: z.number().int().min(2).max(16) }), destructive,
    async ({ serverId, ramGiB }) => { const server = client.server(serverId); await server.setRAM(ramGiB); return { ...action(server, 'set_ram'), ramGiB }; });
  tool('get_motd', 'Get the server message of the day.', z.object({ serverId }), readOnly,
    async ({ serverId }) => ({ serverId, motd: await client.server(serverId).getMOTD() }));
  tool('set_motd', 'Set the server message of the day.', z.object({ serverId, motd: z.string() }), destructive,
    async ({ serverId, motd }) => { const server = client.server(serverId); await server.setMOTD(motd); return { ...action(server, 'set_motd'), motd }; });

  tool('list_player_lists', 'List player lists available on a server.', z.object({ serverId }), readOnly,
    async ({ serverId }) => (await client.server(serverId).getPlayerLists()).map((list) => list.getName()));
  tool('get_player_list', 'Get entries from a player list such as whitelist or ops.', z.object({ serverId, listName }), readOnly,
    async ({ serverId, listName }) => ({ serverId, listName, entries: await client.server(serverId).getPlayerList(listName).getEntries() }));
  tool('add_player_entries', 'Add one or more entries to a server player list.', z.object({ serverId, listName, entries }), additive,
    async ({ serverId, listName, entries }) => { await client.server(serverId).getPlayerList(listName).addEntries(entries); return { success: true, serverId, listName, added: entries }; });
  tool('remove_player_entries', 'Remove one or more entries from a server player list.', z.object({ serverId, listName, entries }), destructive,
    async ({ serverId, listName, entries }) => { await client.server(serverId).getPlayerList(listName).deleteEntries(entries); return { success: true, serverId, listName, removed: entries }; });

  tool('get_file_info', 'Get metadata and immediate children of a server file or directory. Use an empty path for the root.',
    z.object({ serverId, path: z.string().describe('Path relative to server root; empty string for root') }), readOnly,
    async ({ serverId, path }) => fileInfo(await client.server(serverId).getFile(path).getInfo()));
  tool('read_file', 'Read a text file on the server. Binary files are not supported by this tool.',
    z.object({ serverId, path: filePath }), readOnly,
    async ({ serverId, path }) => {
      const file = client.server(serverId).getFile(path);
      await file.getInfo();
      if (!file.isTextFile) throw new Error(`${path} is not a text file`);
      return { serverId, path, content: await file.getContent() };
    });
  tool('write_file', 'Replace the entire content of a server text file.',
    z.object({ serverId, path: filePath, content: z.string() }), destructive,
    async ({ serverId, path, content }) => { await client.server(serverId).getFile(path).putContent(content); return { success: true, serverId, path, action: 'write_file' }; });
  tool('delete_file', 'Delete a server file or directory. This cannot be undone through the API.',
    z.object({ serverId, path: filePath }), destructive,
    async ({ serverId, path }) => { await client.server(serverId).getFile(path).delete(); return { success: true, serverId, path, action: 'delete_file' }; });
  tool('create_directory', 'Create a directory in server storage.', z.object({ serverId, path: filePath }), additive,
    async ({ serverId, path }) => { await client.server(serverId).getFile(path).createAsDirectory(); return { success: true, serverId, path, action: 'create_directory' }; });

  tool('get_config_options', 'Get typed options and available choices from an exaroton config file.',
    z.object({ serverId, path: filePath }), readOnly,
    async ({ serverId, path }) => {
      const options = await client.server(serverId).getFile(path).getConfig().getOptions();
      return { serverId, path, options: [...options.values()].map(optionInfo) };
    });
  tool('set_config_options', 'Update selected options in an exaroton config file. Get options first to see types and choices.',
    z.object({ serverId, path: filePath, values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])) }), destructive,
    async ({ serverId, path, values }) => {
      if (Object.keys(values).length === 0) throw new Error('At least one config option is required');
      const config = client.server(serverId).getFile(path).getConfig();
      const options = await config.getOptions();
      for (const [key, value] of Object.entries(values)) {
        const option = options.get(key);
        if (!option) throw new Error(`Unknown config option: ${key}`);
        checkConfigValue(option, value);
      }
      for (const [key, value] of Object.entries(values)) options.get(key).setValue(value);
      await config.save();
      return { success: true, serverId, path, updated: Object.keys(values) };
    });

  tool('list_pools', 'List accessible exaroton credit pools.', z.object({}), readOnly,
    async () => client.getPools());
  tool('get_pool', 'Get one credit pool and its balance.', z.object({ poolId }), readOnly,
    async ({ poolId }) => client.pool(poolId).get());
  tool('get_pool_members', 'List members of a credit pool.', z.object({ poolId }), readOnly,
    async ({ poolId }) => client.pool(poolId).getMembers());
  tool('get_pool_servers', 'List servers billed to a credit pool.', z.object({ poolId }), readOnly,
    async ({ poolId }) => client.pool(poolId).getServers());

  return mcp;
}
