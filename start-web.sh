#!/bin/bash
export PATH="/Users/rodrigonicolau/.nvm/versions/node/v20.20.1/bin:$PATH"
cd "$(dirname "$0")"
exec pnpm --dir apps/web dev
