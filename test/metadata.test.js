import assert from 'node:assert/strict';
import test from 'node:test';
import packageInfo from '../package.json' with { type: 'json' };
import registryInfo from '../server.json' with { type: 'json' };

test('npm package and MCP Registry metadata stay aligned', () => {
  assert.equal(packageInfo.mcpName, registryInfo.name);
  assert.equal(packageInfo.name, registryInfo.packages[0].identifier);
  assert.equal(packageInfo.version, registryInfo.version);
  assert.equal(packageInfo.version, registryInfo.packages[0].version);
  assert.equal(packageInfo.description, registryInfo.description);
  assert.equal(packageInfo.homepage, registryInfo.websiteUrl);
  assert.equal(registryInfo.packages[0].transport.type, 'stdio');
  assert.deepEqual(registryInfo.packages[0].environmentVariables, [{
    name: 'EXAROTON_API_TOKEN',
    description: 'exaroton API token from https://exaroton.com/account',
    isRequired: true,
    isSecret: true,
    placeholder: 'Your exaroton API token',
  }]);
});
