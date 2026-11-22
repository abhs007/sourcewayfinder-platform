FROM node:24-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server git python3 ripgrep ca-certificates curl util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @openai/codex@0.169.1 \
 && usermod -l agent -d /home/agent node && groupmod -n agent node \
 && mkdir -p /home/agent /workspaces /run/sshd /etc/ssh/keys \
 && chown -R agent:agent /home/agent /workspaces \
 && passwd -d agent && corepack enable
COPY authorized_keys /etc/ssh/sourcewayfinder_authorized_keys
COPY sshd_config /etc/ssh/sshd_config
COPY agent-entrypoint.sh /usr/local/bin/agent-entrypoint
RUN chmod 755 /usr/local/bin/agent-entrypoint && chmod 644 /etc/ssh/sourcewayfinder_authorized_keys
EXPOSE 2222
ENTRYPOINT ["/usr/local/bin/agent-entrypoint"]
