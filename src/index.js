#!/usr/bin/env node
import { Client } from 'exaroton';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

const token = process.env.EXAROTON_API_TOKEN?.trim();
if (!token) {
  process.stderr.write('EXAROTON_API_TOKEN is required. Create one at https://exaroton.com/account\n');
  process.exitCode = 1;
} else {
  try {
    const client = new Client(token);
    const server = createServer(client);
    await server.connect(new StdioServerTransport());
  } catch (error) {
    process.stderr.write(`MCP server failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
