FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates tini jq \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash -u 1001 claude
RUN mkdir -p /home/claude/.npm-global && chown -R claude:claude /home/claude/.npm-global

USER claude
WORKDIR /home/claude
ENV NPM_CONFIG_PREFIX=/home/claude/.npm-global
ENV PATH=/home/claude/.npm-global/bin:$PATH

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Pre-copy framework and prompts into the image
COPY --chown=claude:claude framework/ /home/claude/framework/
COPY --chown=claude:claude prompts/ /home/claude/prompts/

# Copy entrypoint
COPY --chown=claude:claude docker/entrypoint.sh /home/claude/entrypoint.sh
RUN chmod +x /home/claude/entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "/home/claude/entrypoint.sh"]
