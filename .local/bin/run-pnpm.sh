#!/bin/sh
# Wrapper to run pnpm with correct PATH
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$DIR:$DIR/.tools/pnpm-exe/10.30.3:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
exec "$DIR/pnpm" "$@"
