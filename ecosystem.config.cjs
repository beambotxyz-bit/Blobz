'use strict';

const path = require('path');

const root = __dirname;
const apiBase = process.env.API_PUBLIC_BASE || 'http://127.0.0.1:8787';
const internalToken = process.env.INTERNAL_API_TOKEN || 'replace-with-production-internal-token';
const worldHost = process.env.WORLD_WS_HOST || '127.0.0.1';

module.exports = {
  apps: [
    {
      name: 'blobz-client',
      script: path.join(root, 'server', 'index.js'),
      cwd: root,
      env: {
        NODE_ENV: 'production',
        CLIENT_PORT: process.env.CLIENT_PORT || 8082,
        CLIENT_HOST: process.env.CLIENT_HOST || '0.0.0.0'
      }
    },
    {
      name: 'blobz-api',
      script: path.join(root, 'servers', 'api', 'src', 'server.js'),
      cwd: path.join(root, 'servers', 'api'),
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 8787
      }
    },
    {
      name: 'blobz-world-main',
      script: path.join(root, 'servers', 'agarv1', 'src', 'index.js'),
      cwd: path.join(root, 'servers', 'agarv1', 'src'),
      args: '--noconsole --world=main --port=9999 --region=eu',
      env: {
        NODE_ENV: 'production',
        BLOBZ_API_BASE: apiBase,
        BLOBZ_INTERNAL_API_TOKEN: internalToken,
        INTERNAL_API_TOKEN: internalToken,
        BLOBZ_WORLD_SLUG: 'main',
        BLOBZ_WORLD_PORT: '9999',
        BLOBZ_WORLD_REGION: 'eu',
        BLOBZ_WORLD_HOST: worldHost,
        BLOBZ_WORLD_BIND_HOST: process.env.GAME_SERVER_BIND_HOST || ''
      }
    }
  ]
};
