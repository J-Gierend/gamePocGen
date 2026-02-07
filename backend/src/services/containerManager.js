/**
 * ContainerManager - Docker container lifecycle for game generation workers.
 *
 * Uses dockerode to build, spawn, monitor, and clean up worker containers.
 * Each job phase runs in an isolated container with resource limits.
 */

import { mkdirSync, chmodSync } from 'node:fs';

const DEFAULT_TIMEOUTS = {
  phase1: 43200,  // 12 hours
  phase2: 43200,  // 12 hours
  phase3: 43200,  // 12 hours
  phase4: 43200,  // 12 hours
  phase5: 3600,   // 1 hour per repair attempt
};

const DEFAULT_MEMORY_LIMIT = 256 * 1024 * 1024; // 256MB
const DEFAULT_CPU_LIMIT = 0.5;
const DEFAULT_WORKER_IMAGE = 'gamepocgen-worker';

export class ContainerManager {
  /**
   * @param {import('dockerode')} docker - Dockerode instance
   * @param {Object} [options]
   * @param {string} [options.workerImage] - Docker image name for workers
   * @param {number} [options.memoryLimit] - Memory limit in bytes
   * @param {number} [options.cpuLimit] - CPU limit (e.g., 0.5 = half a core)
   * @param {Object} [options.timeouts] - Phase-specific timeouts in seconds
   * @param {string} [options.workspacePath] - Host path for job workspaces
   */
  constructor(docker, options = {}) {
    this.docker = docker;
    this.workerImage = options.workerImage || DEFAULT_WORKER_IMAGE;
    this.memoryLimit = options.memoryLimit || DEFAULT_MEMORY_LIMIT;
    this.cpuLimit = options.cpuLimit || DEFAULT_CPU_LIMIT;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
    this.workspacePath = options.workspacePath || '/tmp/gamepocgen/workspaces';
    // Host path is needed for Docker bind mounts (when backend runs in a container itself)
    this.hostWorkspacePath = options.hostWorkspacePath || this.workspacePath;
  }

  /**
   * Build the worker Docker image from the project's Dockerfile.
   * @param {string} [contextPath] - Path to the build context (project root)
   * @returns {Promise<void>}
   */
  async buildWorkerImage(contextPath = '.') {
    const stream = await this.docker.buildImage(contextPath, {
      t: this.workerImage,
      dockerfile: 'docker/Dockerfile',
    });

    // Wait for build to complete
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
  }

  /**
   * Create and start a container for a job phase.
   * @param {Object} job - Job object with id, game_name, config
   * @param {string} phase - Phase identifier (phase1, phase2, phase3, phase4)
   * @returns {Promise<{containerId: string, name: string}>}
   */
  async spawnContainer(job, phase) {
    const containerName = `gamepocgen-worker-${job.id}-${phase}`;
    const timeout = this.timeouts[phase] || 3600;
    const workspaceDir = '/workspace';
    const hostWorkspace = `${this.hostWorkspacePath}/job-${job.id}`;

    // Pre-create workspace dir with write permissions for container user
    const localWorkspace = `${this.workspacePath}/job-${job.id}`;
    try {
      mkdirSync(localWorkspace, { recursive: true });
      chmodSync(localWorkspace, 0o777);
    } catch {
      // May already exist or be handled by Docker
    }

    const env = [
      `PHASE=${phase}`,
      `JOB_ID=${job.id}`,
      `GAME_NAME=${job.game_name}`,
      `ZAI_API_KEY=${process.env.ZAI_API_KEY || ''}`,
      `ZAI_BASE_URL=${process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic'}`,
      `TIMEOUT_SECONDS=${timeout}`,
      `WORKSPACE_DIR=${workspaceDir}`,
      ...(job.extraEnv || []),
    ];

    const container = await this.docker.createContainer({
      Image: this.workerImage,
      name: containerName,
      Env: env,
      HostConfig: {
        Memory: this.memoryLimit,
        NanoCpus: this.cpuLimit * 1e9,
        Binds: [`${hostWorkspace}:${workspaceDir}`],
      },
    });

    await container.start();

    return {
      containerId: container.id,
      name: containerName,
    };
  }

  /**
   * Stop a running container.
   * Ignores 304 (already stopped) errors.
   * @param {string} containerId
   * @returns {Promise<void>}
   */
  async stopContainer(containerId) {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop();
    } catch (err) {
      // 304 = container already stopped, not an error
      if (err.statusCode !== 304) {
        throw err;
      }
    }
  }

  /**
   * Get container status and exit code.
   * @param {string} containerId
   * @returns {Promise<{status: string, running: boolean, exitCode: number}|null>}
   */
  async getContainerStatus(containerId) {
    const container = this.docker.getContainer(containerId);
    try {
      const info = await container.inspect();
      return {
        status: info.State.Status,
        running: info.State.Running,
        exitCode: info.State.ExitCode,
      };
    } catch (err) {
      if (err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get stdout/stderr logs from a container.
   * @param {string} containerId
   * @returns {Promise<string>}
   */
  async getContainerLogs(containerId) {
    const container = this.docker.getContainer(containerId);
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });
      // Strip Docker multiplexing headers (8 bytes per frame) and null bytes
      return logs.toString().replace(/[\x00-\x08]/g, '');
    } catch (err) {
      if (err.statusCode === 404) {
        return '';
      }
      throw err;
    }
  }

  /**
   * Remove stopped worker containers.
   * Filters by the worker label/name prefix and only removes exited containers.
   * @returns {Promise<number>} Number of containers removed
   */
  async cleanupStoppedContainers() {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { name: ['gamepocgen-worker'] },
    });

    let removed = 0;
    for (const containerInfo of containers) {
      if (containerInfo.State === 'exited') {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.remove();
          removed++;
        } catch {
          // Continue on individual remove failure
        }
      }
    }
    return removed;
  }
}
