/**
 * DeploymentManager - Handles deploying generated games to production.
 *
 * Generates Traefik configs, docker-compose files, and manages
 * game deployments as Traefik-proxied subdomains.
 */

const DEFAULT_DEPLOY_DIR = '/root/apps';
const DEFAULT_TRAEFIK_DYNAMIC_DIR = '/root/apps/traefik/dynamic';
const DEFAULT_GALLERY_DATA_PATH = '/root/apps/gallery/games.json';
const DEFAULT_DOMAIN = 'namjo-games.com';
const DEFAULT_BASE_PORT = 8080;

export class DeploymentManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.deployDir] - Base directory for deployed games
   * @param {string} [options.traefikDynamicDir] - Traefik dynamic config directory
   * @param {string} [options.galleryDataPath] - Path to gallery JSON manifest
   * @param {string} [options.domain] - Domain for game subdomains
   * @param {number} [options.basePort] - Base port for game containers
   * @param {Object} [options.fs] - Injected fs.promises-compatible object for testing
   */
  constructor(options = {}) {
    this.deployDir = options.deployDir || DEFAULT_DEPLOY_DIR;
    this.traefikDynamicDir = options.traefikDynamicDir || DEFAULT_TRAEFIK_DYNAMIC_DIR;
    this.galleryDataPath = options.galleryDataPath || DEFAULT_GALLERY_DATA_PATH;
    this.domain = options.domain || DEFAULT_DOMAIN;
    this.basePort = options.basePort || DEFAULT_BASE_PORT;
    this.fs = options.fs || null;
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
   * Deploy a game: create directories, copy files, write configs.
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

    // Write docker-compose.yml
    const composeContent = this.generateDockerCompose(gameId, gameName);
    await fs.writeFile(`${deployPath}/docker-compose.yml`, composeContent);

    // Write Traefik dynamic config
    const traefikConfig = this.generateTraefikConfig(gameId, port);
    await fs.writeFile(`${this.traefikDynamicDir}/${name}.yml`, traefikConfig);

    return {
      gameId,
      url: `https://${name}.${this.domain}`,
      deployPath,
      port,
    };
  }

  /**
   * Remove a deployed game: delete directory and Traefik config.
   * @param {number} gameId
   * @returns {Promise<{gameId: number, removed: boolean}>}
   */
  async removeGame(gameId) {
    const fs = await this._getFs();
    const name = `gamedemo${gameId}`;

    // Remove deploy directory
    await fs.rm(`${this.deployDir}/${name}`, { recursive: true, force: true });

    // Remove Traefik config
    await fs.rm(`${this.traefikDynamicDir}/${name}.yml`, { force: true });

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
