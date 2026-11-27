#!/bin/sh
set -eu
mkdir -p /run/sshd /etc/ssh/keys /home/agent /workspaces
if [ ! -f /etc/ssh/keys/ssh_host_ed25519_key ]; then
  ssh-keygen -q -t ed25519 -N '' -f /etc/ssh/keys/ssh_host_ed25519_key
fi
chown agent:agent /home/agent /workspaces
exec /usr/sbin/sshd -D -e
