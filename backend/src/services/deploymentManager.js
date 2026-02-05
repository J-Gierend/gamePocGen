/**
 * DeploymentManager - Handles deploying generated games to production.
 *
 * Creates nginx containers with Traefik labels for auto-discovery.
 * Copies game files to a deploy directory mounted into each container.
 */

const DEFAULT_DEPLOY_DIR = '/root/apps';
const DEFAULT_DOMAIN = 'namjo-games.com';
const DEFAULT_BASE_PORT = 8080;

export class DeploymentManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.deployDir] - Base directory for deployed games (container path)
   * @param {string} [options.hostDeployDir] - Host path for deployed games (for Docker bind mounts)
   * @param {string} [options.galleryDataPath] - Path to gallery JSON manifest
   * @param {string} [options.domain] - Domain for game subdomains
   * @param {number} [options.basePort] - Base port for game containers
   * @param {Object} [options.fs] - Injected fs.promises-compatible object for testing
   * @param {Object} [options.docker] - Injected dockerode instance for container management
   */
  constructor(options = {}) {
    this.deployDir = options.deployDir || DEFAULT_DEPLOY_DIR;
    this.hostDeployDir = options.hostDeployDir || this.deployDir;
    this.galleryDataPath = options.galleryDataPath || '/root/apps/gallery/games.json';
    this.domain = options.domain || DEFAULT_DOMAIN;
    this.basePort = options.basePort || DEFAULT_BASE_PORT;
    this.fs = options.fs || null;
    this.docker = options.docker || null;
  }

  /**
   * Lazily load fs.promises if not injected.
   * @returns {Promise<Object>}
   */
  async _getFs() {
    if (!this.fs) {
      const { default: fs } = await import('node:fs');
      this.fs = fs.promises;
    }
    return this.fs;
  }

  /**
   * Calculate the port for a given game ID.
   * @param {number} gameId
   * @returns {number}
   */
  getGamePort(gameId) {
    return this.basePort + gameId;
  }

  /**
   * Generate Traefik dynamic config YAML for a game.
   * @param {number} gameId
   * @param {number} port
   * @returns {string} YAML config string
   */
  generateTraefikConfig(gameId, port) {
    const name = `gamedemo${gameId}`;
    const host = `${name}.${this.domain}`;
    return `http:
  routers:
    ${name}:
      rule: "Host(\`${host}\`)"
      service: ${name}
      tls:
        certResolver: letsencrypt
  services:
    ${name}:
      loadBalancer:
        servers:
          - url: "http://localhost:${port}"
`;
  }

  /**
   * Generate docker-compose.yml YAML for a game.
   * @param {number} gameId
   * @param {string} gameName
   * @returns {string} YAML docker-compose string
   */
  generateDockerCompose(gameId, gameName) {
    const name = `gamedemo${gameId}`;
    const host = `${name}.${this.domain}`;
    return `services:
  web:
    image: nginx:alpine
    volumes:
      - ./html:/usr/share/nginx/html:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}.rule=Host(\`${host}\`)"
      - "traefik.http.routers.${name}.tls.certresolver=letsencrypt"
    networks:
      - traefik
    restart: unless-stopped

networks:
  traefik:
    external: true
`;
  }

  /**
   * Deploy a game: copy files, create and start nginx container with Traefik labels.
   * @param {number} gameId
   * @param {string} gameName
   * @param {string} sourceDir - Path to source game files
   * @returns {Promise<{gameId: number, url: string, deployPath: string, port: number}>}
   */
  async deployGame(gameId, gameName, sourceDir) {
    const fs = await this._getFs();
    const name = `gamedemo${gameId}`;
    const deployPath = `${this.deployDir}/${name}`;
    const htmlPath = `${deployPath}/html`;
    const port = this.getGamePort(gameId);

    // Create deploy directory and html subdirectory
    await fs.mkdir(deployPath, { recursive: true });
    await fs.mkdir(htmlPath, { recursive: true });

    // Copy game files from source to html/
    await fs.cp(sourceDir, htmlPath, { recursive: true });

    // Write docker-compose.yml (for reference/manual use)
    const composeContent = this.generateDockerCompose(gameId, gameName);
    await fs.writeFile(`${deployPath}/docker-compose.yml`, composeContent);

    // Start nginx container via Docker if available
    if (this.docker) {
      await this._startGameContainer(gameId, name);
    }

    return {
      gameId,
      url: `https://${name}.${this.domain}`,
      deployPath,
      port,
    };
  }

  /**
   * Create and start an nginx container for a game with Traefik labels.
   * @param {number} gameId
   * @param {string} name - Container name (e.g. gamedemo3)
   */
  async _startGameContainer(gameId, name) {
    const host = `${name}.${this.domain}`;
    const hostHtmlPath = `${this.hostDeployDir}/${name}/html`;

    // Remove existing container if any
    try {
      const existing = this.docker.getContainer(name);
      await existing.stop().catch(() => {});
      await existing.remove().catch(() => {});
    } catch {
      // Container doesn't exist, fine
    }

    // Find the traefik network
    const networks = await this.docker.listNetworks({ filters: { name: ['traefik'] } });
    const traefikNetwork = networks.find(n => n.Name === 'traefik');

    const container = await this.docker.createContainer({
      Image: 'nginx:alpine',
      name,
      Labels: {
        'traefik.enable': 'true',
        [`traefik.http.routers.${name}.rule`]: `Host(\`${host}\`)`,
        [`traefik.http.routers.${name}.tls.certresolver`]: 'letsencrypt',
      },
      HostConfig: {
        Binds: [`${hostHtmlPath}:/usr/share/nginx/html:ro`],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });

    // Connect to traefik network before starting
    if (traefikNetwork) {
      const network = this.docker.getNetwork(traefikNetwork.Id);
      await network.connect({ Container: container.id });
    }

    await container.start();
  }

  /**
   * Remove a deployed game: stop container, delete directory.
   * @param {number} gameId
   * @returns {Promise<{gameId: number, removed: boolean}>}
   */
  async removeGame(gameId) {
    const fs = await this._getFs();
    const name = `gamedemo${gameId}`;

    // Stop and remove container
    if (this.docker) {
      try {
        const container = this.docker.getContainer(name);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
      } catch {
        // Container doesn't exist
      }
    }

    // Remove deploy directory
    await fs.rm(`${this.deployDir}/${name}`, { recursive: true, force: true });

    return { gameId, removed: true };
  }

  /**
   * List all deployed games by scanning the deploy directory.
   * @returns {Promise<Array<{gameId: number, name: string, url: string, port: number}>>}
   */
  async listDeployedGames() {
    const fs = await this._getFs();
    const entries = await fs.readdir(this.deployDir, { withFileTypes: true });

    const games = [];
    for (const entry of entries) {
      const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
      if (isDir && entry.name.startsWith('gamedemo')) {
        const idStr = entry.name.replace('gamedemo', '');
        const gameId = parseInt(idStr, 10);
        if (isNaN(gameId)) continue;

        const port = this.getGamePort(gameId);
        const url = `https://${entry.name}.${this.domain}`;

        games.push({
          gameId,
          name: entry.name,
          url,
          port,
        });
      }
    }

    return games;
  }

  /**
   * Write the gallery manifest JSON.
   * @param {Array} games - Array of game objects
   * @returns {Promise<void>}
   */
  async updateGalleryData(games) {
    const fs = await this._getFs();
    await fs.writeFile(this.galleryDataPath, JSON.stringify(games, null, 2));
  }
}
