#!/usr/bin/env node
import { Client } from 'exaroton';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { parseApiToken } from './token.js';

try {
  const client = new Client(parseApiToken(process.env.EXAROTON_API_TOKEN));
  serveStdio(() => createServer(client), {
    onerror: (error) => process.stderr.write(`MCP transport error: ${error.message}\n`),
  });
} catch (error) {
  process.stderr.write(`MCP server failed: ${error.message}\n`);
  process.exitCode = 1;
}
