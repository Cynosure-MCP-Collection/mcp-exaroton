import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createServer } from '../src/server.js';
import { parseApiToken } from '../src/token.js';

function fakeExaroton() {
  const calls = [];
  const options = new Map([
    ['pvp', {
      getKey: () => 'pvp', getLabel: () => 'PVP', getType: () => 'boolean',
      getValue() { return this.value ?? true; }, getOptions: () => null,
      setValue(value) { this.value = value; },
    }],
    ['difficulty', {
      getKey: () => 'difficulty', getLabel: () => 'Difficulty', getType: () => 'select',
      getValue() { return this.value ?? 'normal'; }, getOptions: () => ['easy', 'normal', 'hard'],
      setValue(value) { this.value = value; },
    }],
  ]);
  const config = { getOptions: async () => options, save: async () => calls.push(['save', options.get('pvp').getValue(), options.get('difficulty').getValue()]) };
  const server = {
    id: 'server-1',
    start: async (own) => calls.push(['start', own]),
    stop: async () => { throw new Error('Server is offline'); },
    getFile: (path) => ({
      path,
      getConfig: () => config,
      getInfo: async function () { this.isTextFile = true; this.name = path; return this; },
      getContent: async () => 'hello',
    }),
  };
  return {
    calls,
    client: {
      getServers: async () => [{ id: 'server-1', name: 'Demo', status: 0 }],
      server: (id) => { assert.equal(id, 'server-1'); return server; },
    },
  };
}

async function connect(fake) {
  const server = createServer(fake);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

test('registers tools and executes reads and actions through MCP', async (t) => {
  const fake = fakeExaroton();
  const { server, client } = await connect(fake.client);
  t.after(async () => { await client.close(); await server.close(); });

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 29);
  assert.ok(listed.tools.some((tool) => tool.name === 'set_config_options' && tool.title === 'Set Config Options'));
  assert.equal(listed.tools.find((tool) => tool.name === 'stop_server').annotations.destructiveHint, true);
  assert.equal(listed.tools.find((tool) => tool.name === 'add_player_entries').annotations.destructiveHint, false);

  const servers = await client.callTool({ name: 'list_servers', arguments: {} });
  assert.deepEqual(JSON.parse(servers.content[0].text), [{ id: 'server-1', name: 'Demo', status: 0 }]);
  assert.deepEqual(servers.structuredContent.items, [{ id: 'server-1', name: 'Demo', status: 0 }]);

  const started = await client.callTool({ name: 'start_server', arguments: { serverId: 'server-1', useOwnCredits: true } });
  assert.equal(JSON.parse(started.content[0].text).success, true);
  assert.deepEqual(fake.calls, [['start', true]]);

  const stopped = await client.callTool({ name: 'stop_server', arguments: { serverId: 'server-1' } });
  assert.equal(stopped.isError, true);
  assert.match(stopped.content[0].text, /Server is offline/);
});

test('validates config changes before saving and reads text files', async (t) => {
  const fake = fakeExaroton();
  const { server, client } = await connect(fake.client);
  t.after(async () => { await client.close(); await server.close(); });

  const read = await client.callTool({ name: 'read_file', arguments: { serverId: 'server-1', path: 'notes.txt' } });
  assert.equal(JSON.parse(read.content[0].text).content, 'hello');

  const bad = await client.callTool({ name: 'set_config_options', arguments: {
    serverId: 'server-1', path: 'server.properties', values: { difficulty: 'impossible', pvp: false },
  } });
  assert.equal(bad.isError, true);
  assert.deepEqual(fake.calls, []);

  const good = await client.callTool({ name: 'set_config_options', arguments: {
    serverId: 'server-1', path: 'server.properties', values: { difficulty: 'hard', pvp: false },
  } });
  assert.equal(JSON.parse(good.content[0].text).success, true);
  assert.deepEqual(fake.calls, [['save', false, 'hard']]);
});

test('starts as a stdio MCP child process', async (t) => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
    env: { ...process.env, EXAROTON_API_TOKEN: 'unused-test-token' },
  });
  t.after(async () => client.close());
  await client.connect(transport);
  const info = client.getServerVersion();
  assert.equal(info.name, 'io.github.cynosure/exaroton');
  assert.equal(info.title, 'exaroton Minecraft Server Manager');
  assert.match(info.description, /exaroton Minecraft servers/);
  assert.equal(info.icons[0].mimeType, 'image/png');
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 29);
});

test('serves the current MCP protocol over stdio', async (t) => {
  const client = new Client({ name: 'modern-stdio-test', version: '1.0.0' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
    env: { ...process.env, EXAROTON_API_TOKEN: 'unused-test-token' },
  });
  t.after(async () => client.close());
  await client.connect(transport);
  const info = client.getServerVersion();
  assert.equal(info.name, 'io.github.cynosure/exaroton');
  assert.equal(info.title, 'exaroton Minecraft Server Manager');
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 29);
});

test('accepts raw or Bearer-prefixed exaroton tokens', () => {
  assert.equal(parseApiToken(' abc '), 'abc');
  assert.equal(parseApiToken('Bearer abc'), 'abc');
  assert.equal(parseApiToken('bearer   abc '), 'abc');
  assert.throws(() => parseApiToken('Bearer '), /EXAROTON_API_TOKEN is required/);
});
