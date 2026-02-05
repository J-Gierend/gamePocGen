/**
 * DeploymentManager tests - uses mock fs, no actual filesystem needed.
 */

import { DeploymentManager } from '../deploymentManager.js';

// --- Assertion helpers ---

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${label ? label + ': ' : ''}Expected ${b}, got ${a}`);
  }
}

function assertIncludes(str, substr, label = '') {
  if (!str.includes(substr)) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected string to include ${JSON.stringify(substr)}, got ${JSON.stringify(str)}`
    );
  }
}

// --- Mock fs factory ---

function createMockFs(overrides = {}) {
  return {
    mkdir: overrides.mkdir || (async () => {}),
    writeFile: overrides.writeFile || (async () => {}),
    readdir: overrides.readdir || (async () => []),
    readFile: overrides.readFile || (async () => '{}'),
    rm: overrides.rm || (async () => {}),
    cp: overrides.cp || (async () => {}),
    access: overrides.access || (async () => {}),
  };
}

// --- Tests ---

export function runTests() {
  return {
    // === Constructor tests ===

    'constructor uses default options': () => {
      const dm = new DeploymentManager();
      assertEqual(dm.deployDir, '/root/apps', 'default deployDir');
      assertEqual(dm.traefikDynamicDir, '/root/apps/traefik/dynamic', 'default traefikDynamicDir');
      assertEqual(dm.galleryDataPath, '/root/apps/gallery/games.json', 'default galleryDataPath');
      assertEqual(dm.domain, 'namjo-games.com', 'default domain');
      assertEqual(dm.basePort, 8080, 'default basePort');
    },

    'constructor accepts custom options': () => {
      const dm = new DeploymentManager({
        deployDir: '/custom/deploy',
        traefikDynamicDir: '/custom/traefik',
        galleryDataPath: '/custom/gallery.json',
        domain: 'custom.example.com',
        basePort: 9000,
      });
      assertEqual(dm.deployDir, '/custom/deploy', 'custom deployDir');
      assertEqual(dm.traefikDynamicDir, '/custom/traefik', 'custom traefikDynamicDir');
      assertEqual(dm.galleryDataPath, '/custom/gallery.json', 'custom galleryDataPath');
      assertEqual(dm.domain, 'custom.example.com', 'custom domain');
      assertEqual(dm.basePort, 9000, 'custom basePort');
    },

    'constructor accepts injected fs': () => {
      const mockFs = createMockFs();
      const dm = new DeploymentManager({ fs: mockFs });
      // _getFs should return the injected mock
      assert(dm.fs === mockFs, 'Should store injected fs');
    },

    // === getGamePort tests ===

    'getGamePort() returns basePort + gameId': () => {
      const dm = new DeploymentManager();
      assertEqual(dm.getGamePort(1), 8081, 'gameId=1 should return 8081');
      assertEqual(dm.getGamePort(5), 8085, 'gameId=5 should return 8085');
    },

    'getGamePort() uses custom basePort': () => {
      const dm = new DeploymentManager({ basePort: 9000 });
      assertEqual(dm.getGamePort(3), 9003, 'gameId=3 with basePort=9000 should return 9003');
    },

    // === generateTraefikConfig tests ===

    'generateTraefikConfig() includes router with correct rule': () => {
      const dm = new DeploymentManager();
      const config = dm.generateTraefikConfig(1, 8081);
      assertIncludes(config, 'gamedemo1', 'Should include gamedemo1 router name');
      assertIncludes(config, 'Host(`gamedemo1.namjo-games.com`)', 'Should include Host rule');
    },

    'generateTraefikConfig() includes service with correct URL': () => {
      const dm = new DeploymentManager();
      const config = dm.generateTraefikConfig(2, 8082);
      assertIncludes(config, 'http://localhost:8082', 'Should include service URL');
    },

    'generateTraefikConfig() includes TLS certResolver': () => {
      const dm = new DeploymentManager();
      const config = dm.generateTraefikConfig(1, 8081);
      assertIncludes(config, 'certResolver: letsencrypt', 'Should include certResolver');
    },

    'generateTraefikConfig() uses custom domain': () => {
      const dm = new DeploymentManager({ domain: 'example.org' });
      const config = dm.generateTraefikConfig(3, 8083);
      assertIncludes(config, 'gamedemo3.example.org', 'Should use custom domain');
    },

    // === generateDockerCompose tests ===

    'generateDockerCompose() includes nginx:alpine image': () => {
      const dm = new DeploymentManager();
      const compose = dm.generateDockerCompose(1, 'TestGame');
      assertIncludes(compose, 'nginx:alpine', 'Should include nginx:alpine image');
    },

    'generateDockerCompose() includes Traefik labels with correct gameId': () => {
      const dm = new DeploymentManager();
      const compose = dm.generateDockerCompose(2, 'SpaceBlaster');
      assertIncludes(compose, 'traefik.enable=true', 'Should include traefik.enable label');
      assertIncludes(compose, 'gamedemo2', 'Should include gamedemo2 in router rule');
      assertIncludes(compose, 'Host(`gamedemo2.namjo-games.com`)', 'Should include Host rule');
    },

    'generateDockerCompose() includes external traefik network': () => {
      const dm = new DeploymentManager();
      const compose = dm.generateDockerCompose(1, 'TestGame');
      assertIncludes(compose, 'external: true', 'Should declare traefik network as external');
    },

    // === deployGame tests ===

    'deployGame() creates deploy directory': async () => {
      const mkdirCalls = [];
      const mockFs = createMockFs({
        mkdir: async (path, opts) => { mkdirCalls.push({ path, opts }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.deployGame(1, 'TestGame', '/tmp/source');

      const deployDirCall = mkdirCalls.find(c => c.path.includes('gamedemo1'));
      assert(deployDirCall, 'Should create gamedemo1 directory');
      assert(deployDirCall.opts && deployDirCall.opts.recursive, 'Should use recursive mkdir');
    },

    'deployGame() creates html subdirectory': async () => {
      const mkdirCalls = [];
      const mockFs = createMockFs({
        mkdir: async (path, opts) => { mkdirCalls.push({ path, opts }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.deployGame(1, 'TestGame', '/tmp/source');

      const htmlDirCall = mkdirCalls.find(c => c.path.includes('html'));
      assert(htmlDirCall, 'Should create html subdirectory');
    },

    'deployGame() copies game files from source': async () => {
      const cpCalls = [];
      const mockFs = createMockFs({
        cp: async (src, dest, opts) => { cpCalls.push({ src, dest, opts }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.deployGame(1, 'TestGame', '/tmp/source');

      assert(cpCalls.length > 0, 'Should call cp');
      assertEqual(cpCalls[0].src, '/tmp/source', 'Source should be /tmp/source');
      assertIncludes(cpCalls[0].dest, 'html', 'Dest should include html dir');
      assert(cpCalls[0].opts && cpCalls[0].opts.recursive, 'Should copy recursively');
    },

    'deployGame() writes docker-compose.yml': async () => {
      const writeFileCalls = [];
      const mockFs = createMockFs({
        writeFile: async (path, content) => { writeFileCalls.push({ path, content }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.deployGame(1, 'TestGame', '/tmp/source');

      const composeWrite = writeFileCalls.find(c => c.path.includes('docker-compose.yml'));
      assert(composeWrite, 'Should write docker-compose.yml');
      assertIncludes(composeWrite.content, 'nginx:alpine', 'docker-compose should include nginx:alpine');
    },

    'deployGame() writes Traefik config': async () => {
      const writeFileCalls = [];
      const mockFs = createMockFs({
        writeFile: async (path, content) => { writeFileCalls.push({ path, content }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.deployGame(1, 'TestGame', '/tmp/source');

      const traefikWrite = writeFileCalls.find(c => c.path.includes('gamedemo1.yml'));
      assert(traefikWrite, 'Should write Traefik config gamedemo1.yml');
      assertIncludes(traefikWrite.path, 'traefik/dynamic', 'Should write to traefik dynamic dir');
      assertIncludes(traefikWrite.content, 'Host(`gamedemo1.namjo-games.com`)', 'Should include host rule');
    },

    'deployGame() returns deployment info': async () => {
      const mockFs = createMockFs();
      const dm = new DeploymentManager({ fs: mockFs });
      const result = await dm.deployGame(1, 'TestGame', '/tmp/source');

      assertEqual(result.gameId, 1, 'Should return gameId');
      assertEqual(result.url, 'https://gamedemo1.namjo-games.com', 'Should return URL');
      assertIncludes(result.deployPath, 'gamedemo1', 'Should return deploy path');
      assertEqual(result.port, 8081, 'Should return port');
    },

    // === removeGame tests ===

    'removeGame() removes deploy directory': async () => {
      const rmCalls = [];
      const mockFs = createMockFs({
        rm: async (path, opts) => { rmCalls.push({ path, opts }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.removeGame(1);

      const deployRm = rmCalls.find(c => c.path.includes('gamedemo1'));
      assert(deployRm, 'Should remove gamedemo1 directory');
      assert(deployRm.opts && deployRm.opts.recursive, 'Should remove recursively');
      assert(deployRm.opts && deployRm.opts.force, 'Should force remove');
    },

    'removeGame() removes Traefik config': async () => {
      const rmCalls = [];
      const mockFs = createMockFs({
        rm: async (path, opts) => { rmCalls.push({ path, opts }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.removeGame(2);

      const traefikRm = rmCalls.find(c => c.path.includes('gamedemo2.yml'));
      assert(traefikRm, 'Should remove Traefik config gamedemo2.yml');
    },

    'removeGame() returns removal confirmation': async () => {
      const mockFs = createMockFs();
      const dm = new DeploymentManager({ fs: mockFs });
      const result = await dm.removeGame(3);

      assertEqual(result.gameId, 3, 'Should return gameId');
      assertEqual(result.removed, true, 'Should return removed: true');
    },

    // === listDeployedGames tests ===

    'listDeployedGames() reads deploy directory': async () => {
      let readdirPath = null;
      const mockFs = createMockFs({
        readdir: async (path, opts) => {
          readdirPath = path;
          return [];
        },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      await dm.listDeployedGames();

      assertEqual(readdirPath, '/root/apps', 'Should read the deploy directory');
    },

    'listDeployedGames() filters gamedemo directories': async () => {
      const mockFs = createMockFs({
        readdir: async (path, opts) => {
          return [
            { name: 'gamedemo1', isDirectory: () => true },
            { name: 'gamedemo2', isDirectory: () => true },
            { name: 'traefik', isDirectory: () => true },
            { name: 'gallery', isDirectory: () => true },
          ];
        },
        readFile: async () => 'services:\n  web:\n    image: nginx:alpine\n',
      });
      const dm = new DeploymentManager({ fs: mockFs });
      const games = await dm.listDeployedGames();

      assertEqual(games.length, 2, 'Should return 2 gamedemo entries');
      assertEqual(games[0].gameId, 1, 'First game should have gameId 1');
      assertEqual(games[1].gameId, 2, 'Second game should have gameId 2');
    },

    'listDeployedGames() returns formatted game info': async () => {
      const mockFs = createMockFs({
        readdir: async () => [
          { name: 'gamedemo5', isDirectory: () => true },
        ],
        readFile: async () => 'services:\n  web:\n    image: nginx:alpine\n',
      });
      const dm = new DeploymentManager({ fs: mockFs });
      const games = await dm.listDeployedGames();

      assertEqual(games.length, 1, 'Should return 1 game');
      assertEqual(games[0].gameId, 5, 'Should extract gameId from dir name');
      assertEqual(games[0].url, 'https://gamedemo5.namjo-games.com', 'Should include URL');
      assertEqual(games[0].port, 8085, 'Should include port');
      assertEqual(games[0].name, 'gamedemo5', 'Should use directory name as fallback name');
    },

    // === updateGalleryData tests ===

    'updateGalleryData() writes JSON to gallery path': async () => {
      const writeFileCalls = [];
      const mockFs = createMockFs({
        writeFile: async (path, content) => { writeFileCalls.push({ path, content }); },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      const games = [
        { gameId: 1, name: 'TestGame', url: 'https://gamedemo1.namjo-games.com' },
      ];
      await dm.updateGalleryData(games);

      assertEqual(writeFileCalls.length, 1, 'Should call writeFile once');
      assertEqual(writeFileCalls[0].path, '/root/apps/gallery/games.json', 'Should write to gallery path');
    },

    'updateGalleryData() writes valid JSON': async () => {
      let writtenContent = null;
      const mockFs = createMockFs({
        mkdir: async () => {},
        writeFile: async (path, content) => { writtenContent = content; },
      });
      const dm = new DeploymentManager({ fs: mockFs });
      const games = [
        { gameId: 1, name: 'Game1' },
        { gameId: 2, name: 'Game2' },
      ];
      await dm.updateGalleryData(games);

      const parsed = JSON.parse(writtenContent);
      assertEqual(parsed.length, 2, 'Should contain 2 games');
      assertEqual(parsed[0].gameId, 1, 'First game should have gameId 1');
      assertEqual(parsed[1].name, 'Game2', 'Second game should have name Game2');
    },
  };
}
