import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeEnvPath = path.join(repositoryRoot, '.env.day3');
const apiEnvPath = path.join(repositoryRoot, 'apps', 'api', '.env');
const databaseEnvPath = path.join(repositoryRoot, 'packages', 'database', '.env');
const outputPaths = [composeEnvPath, apiEnvPath, databaseEnvPath];

if (outputPaths.some((filePath) => existsSync(filePath))) {
  throw new Error('A local environment file already exists; refusing to overwrite it.');
}

const ownerPassword = randomBytes(32).toString('hex');
const authPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const host = 'localhost';
const port = '55433';
const database = 'aicrm_day3_clean';

const files = [
  [
    composeEnvPath,
    `POSTGRES_DB=${database}
POSTGRES_USER=aicrm
POSTGRES_PASSWORD=${ownerPassword}
POSTGRES_PORT=${port}
AICRM_AUTH_PASSWORD=${authPassword}
AICRM_APP_PASSWORD=${appPassword}
REDIS_PORT=6380
`,
  ],
  [
    apiEnvPath,
    `NODE_ENV=development
API_PORT=3001
DATABASE_AUTH_URL=postgresql://aicrm_auth_runtime:${authPassword}@${host}:${port}/${database}
DATABASE_APP_URL=postgresql://aicrm_app_runtime:${appPassword}@${host}:${port}/${database}
REDIS_URL=redis://localhost:6380
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SESSION_TTL_HOURS=24
LOGIN_LIMIT_PER_MINUTE=5
`,
  ],
  [
    databaseEnvPath,
    `DATABASE_MIGRATION_URL=postgresql://aicrm:${ownerPassword}@${host}:${port}/${database}
DATABASE_SHADOW_URL=postgresql://aicrm:${ownerPassword}@${host}:${port}/aicrm_day3_shadow
`,
  ],
];

for (const [filePath, contents] of files) {
  writeFileSync(filePath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

console.log(
  'Created ignored local database configuration files; credential values were not printed.',
);
