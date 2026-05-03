#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ -f "servers/api/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "servers/api/.env"
  set +a
fi

npm install
npm --prefix servers/api install --omit=dev
npm run api:check
npm run api:migrate
npx pm2 start ecosystem.config.cjs --env production
npx pm2 save
