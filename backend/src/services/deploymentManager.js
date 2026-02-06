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
   * Extract game metadata from workspace files (idea.md, index.html).
   * @param {string} workspaceDir - Path to job workspace
   * @param {string} htmlDir - Path to deployed HTML files
   * @returns {Promise<{title: string, description: string, guide: string}>}
   */
  async extractMetadata(workspaceDir, htmlDir) {
    const fs = await this._getFs();
    const meta = { title: '', description: '', guide: '' };

    // Try idea.md for title and description
    try {
      const idea = await fs.readFile(`${workspaceDir}/idea.md`, 'utf-8');
      // Title is first heading (# Title or #Title)
      const titleMatch = idea.match(/^#\s*(.+)/m);
      if (titleMatch) meta.title = titleMatch[1].trim();
      // Description: Theme section content
      const themeMatch = idea.match(/## Theme\s*\n([\s\S]*?)(?=\n##|$)/);
      if (themeMatch) meta.description = themeMatch[1].trim().split('\n')[0].trim();
      // Guide: Core Loop section
      const loopMatch = idea.match(/## Core Loop\s*\n([\s\S]*?)(?=\n##|$)/);
      if (loopMatch) {
        const loopText = loopMatch[1].trim();
        // Extract the main paragraph before sub-sections
        const mainParagraph = loopText.split(/\n###/)[0].trim();
        meta.guide = mainParagraph;
      }
    } catch {
      // idea.md not available
    }

    // Fallback: extract title from index.html <title> tag
    if (!meta.title && htmlDir) {
      try {
        const html = await fs.readFile(`${htmlDir}/index.html`, 'utf-8');
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) meta.title = titleMatch[1].trim();
      } catch {
        // index.html not available
      }
    }

    return meta;
  }

  /**
   * Generate a standalone guide.html from GDD files in the workspace.
   * Reads idea.md and all gdd/*.md and gdd/*.json files, renders them into
   * a readable HTML page with Mermaid diagram support.
   * @param {string} workspaceDir - Path to job workspace
   * @param {string} title - Game title for the guide page
   * @returns {Promise<string>} HTML content for guide.html
   */
  async generateGuideHtml(workspaceDir, title) {
    const fs = await this._getFs();
    const sections = [];

    // Read idea.md
    try {
      const idea = await fs.readFile(`${workspaceDir}/idea.md`, 'utf-8');
      sections.push({ name: 'Game Concept', content: idea, type: 'md' });
    } catch { /* not available */ }

    // Read all GDD files
    try {
      const gddDir = `${workspaceDir}/gdd`;
      const files = await fs.readdir(gddDir);
      for (const file of files) {
        const filePath = `${gddDir}/${file}`;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const sectionName = file.replace(/\.(json|md)$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

          if (file.endsWith('.json')) {
            sections.push({ name: sectionName, content, type: 'json' });
          } else if (file.endsWith('.md')) {
            sections.push({ name: sectionName, content, type: 'md' });
          }
        } catch { /* skip unreadable files */ }
      }
    } catch { /* no gdd directory */ }

    if (sections.length === 0) {
      return '';
    }

    // Build HTML sections
    const htmlSections = sections.map(s => {
      if (s.type === 'md') {
        // Escape HTML but preserve markdown structure for rendering
        const escaped = s.content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<section><h2>${this._escHtml(s.name)}</h2><div class="md-content">${escaped}</div></section>`;
      } else {
        // JSON: try to extract readable content
        try {
          const data = JSON.parse(s.content);
          const pretty = JSON.stringify(data, null, 2)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<section><h2>${this._escHtml(s.name)}</h2><pre class="json-content">${pretty}</pre></section>`;
        } catch {
          const escaped = s.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<section><h2>${this._escHtml(s.name)}</h2><pre>${escaped}</pre></section>`;
        }
      }
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this._escHtml(title)} - Game Design Guide</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"><\/script>
<style>
:root{--bg:#0f0f17;--bg2:#1a1a26;--fg:#e2e8f0;--fg2:#94a3b8;--accent:#818cf8;--border:#2a2a3e}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--fg);line-height:1.7;padding:2rem;max-width:900px;margin:0 auto}
h1{font-size:1.8rem;color:var(--accent);margin-bottom:1.5rem;padding-bottom:0.5rem;border-bottom:2px solid var(--border)}
h2{font-size:1.4rem;color:var(--accent);margin:2rem 0 1rem;padding:0.5rem 0;border-bottom:1px solid var(--border)}
section{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
section h2{margin-top:0}
.md-content{white-space:pre-wrap;font-size:0.9rem}
.md-content.rendered{white-space:normal}
.md-content.rendered h1,.md-content.rendered h2,.md-content.rendered h3{color:var(--accent);margin:1rem 0 0.5rem}
.md-content.rendered h1{font-size:1.3rem}
.md-content.rendered h2{font-size:1.15rem;border:none;padding:0}
.md-content.rendered h3{font-size:1.05rem;color:var(--fg)}
.md-content.rendered p{margin:0.5rem 0}
.md-content.rendered ul,.md-content.rendered ol{margin:0.5rem 0 0.5rem 1.5rem}
.md-content.rendered li{margin:0.25rem 0}
.md-content.rendered strong{color:#c4b5fd}
.md-content.rendered code{background:var(--bg);padding:0.15rem 0.4rem;border-radius:4px;font-size:0.85rem}
.md-content.rendered pre{background:var(--bg);padding:1rem;border-radius:8px;overflow-x:auto;margin:0.5rem 0}
.md-content.rendered pre code{background:none;padding:0}
.json-content{font-size:0.8rem;overflow-x:auto;background:var(--bg);padding:1rem;border-radius:8px;max-height:500px;overflow-y:auto}
pre{color:var(--fg2)}
.back-btn{position:fixed;top:1rem;right:1rem;background:var(--accent);color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;cursor:pointer;font-size:0.9rem;z-index:999;text-decoration:none}
.back-btn:hover{opacity:0.85}
.mermaid{background:var(--bg);border-radius:8px;padding:1rem;margin:0.5rem 0;text-align:center}
</style>
</head>
<body>
<a href="index.html" class="back-btn">Back to Game</a>
<h1>${this._escHtml(title)} - Game Design Guide</h1>
${htmlSections}
<script>
// Initialize mermaid
mermaid.initialize({startOnLoad:false,theme:'dark'});
// Render markdown sections using marked
document.querySelectorAll('.md-content').forEach(async el=>{
  const raw=el.textContent;
  // Extract mermaid blocks before markdown processing
  const mermaidBlocks=[];
  const withPlaceholders=raw.replace(/\`\`\`mermaid\\n([\\s\\S]*?)\`\`\`/g,(_,code)=>{
    mermaidBlocks.push(code);
    return '%%MERMAID_'+( mermaidBlocks.length-1)+'%%';
  });
  el.innerHTML=marked.parse(withPlaceholders);
  el.classList.add('rendered');
  // Re-insert mermaid diagrams
  mermaidBlocks.forEach((code,i)=>{
    const placeholder=el.innerHTML.indexOf('%%MERMAID_'+i+'%%');
    if(placeholder>=0){
      el.innerHTML=el.innerHTML.replace('%%MERMAID_'+i+'%%','<div class="mermaid">'+code.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'<\\/div>');
    }
  });
});
// Render mermaid diagrams
setTimeout(()=>mermaid.run(),500);
<\/script>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Inject a floating guide button into a game's index.html.
   * @param {string} htmlDir - Path to the deployed HTML directory
   * @returns {Promise<boolean>} true if injection succeeded
   */
  async injectGuideButton(htmlDir) {
    const fs = await this._getFs();
    const indexPath = `${htmlDir}/index.html`;

    try {
      let html = await fs.readFile(indexPath, 'utf-8');

      // Don't inject twice
      if (html.includes('guide-btn-container')) return false;

      const buttonHtml = `
<!-- Game Guide Button -->
<div id="guide-btn-container" style="position:fixed;top:12px;right:12px;z-index:99999">
<a href="guide.html" style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(99,102,241,0.9);border-radius:10px;text-decoration:none;font-size:22px;box-shadow:0 2px 12px rgba(0,0,0,0.4);transition:transform 0.2s,background 0.2s;cursor:pointer" title="Game Design Guide" onmouseover="this.style.transform='scale(1.1)';this.style.background='rgba(129,140,248,0.95)'" onmouseout="this.style.transform='scale(1)';this.style.background='rgba(99,102,241,0.9)'">&#128214;</a>
</div>`;

      // Inject before </body>
      if (html.includes('</body>')) {
        html = html.replace('</body>', buttonHtml + '\n</body>');
      } else {
        html += buttonHtml;
      }

      await fs.writeFile(indexPath, html);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deploy a game: copy files, extract metadata, create and start nginx container.
   * @param {number} gameId
   * @param {string} gameName
   * @param {string} sourceDir - Path to source game files
   * @param {Object} [options]
   * @param {string} [options.workspaceDir] - Path to job workspace for metadata extraction
   * @returns {Promise<{gameId: number, url: string, deployPath: string, port: number}>}
   */
  async deployGame(gameId, gameName, sourceDir, options = {}) {
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

    // Extract and save metadata
    const workspaceDir = options.workspaceDir || sourceDir.replace(/\/dist$/, '');
    const metadata = await this.extractMetadata(workspaceDir, htmlPath);
    metadata.createdAt = new Date().toISOString();
    await fs.writeFile(`${deployPath}/metadata.json`, JSON.stringify(metadata, null, 2));

    // Generate guide.html from GDD files and inject button into game
    try {
      const guideHtml = await this.generateGuideHtml(workspaceDir, metadata.title || gameName);
      if (guideHtml) {
        await fs.writeFile(`${htmlPath}/guide.html`, guideHtml);
        await this.injectGuideButton(htmlPath);
      }
    } catch { /* guide generation is non-critical */ }

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
   * Reads metadata.json from each game directory for title/description.
   * @returns {Promise<Array<{gameId: number, name: string, title: string, description: string, guide: string, url: string, port: number, createdAt: string}>>}
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

        // Read metadata if available
        let metadata = {};
        try {
          const metaJson = await fs.readFile(`${this.deployDir}/${entry.name}/metadata.json`, 'utf-8');
          metadata = JSON.parse(metaJson);
        } catch {
          // No metadata file, try extracting title from HTML
          try {
            const html = await fs.readFile(`${this.deployDir}/${entry.name}/html/index.html`, 'utf-8');
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) metadata.title = titleMatch[1].trim();
          } catch {
            // No HTML either
          }
        }

        games.push({
          gameId,
          name: entry.name,
          title: metadata.title || '',
          description: metadata.description || '',
          guide: metadata.guide || '',
          url,
          port,
          createdAt: metadata.createdAt || '',
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
