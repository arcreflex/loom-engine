#!/bin/bash
set -euo pipefail

echo "Setting up sandbox environment..."

# Run firewall initialization
sudo /usr/local/bin/init-firewall.sh

echo "Firewall setup complete."

# If running interactively, start shell
if [ -t 0 ]; then
  echo "Starting interactive shell..."
  exec bash
else
  echo "Running in detached mode..."
  exec tail -f /dev/null
fi