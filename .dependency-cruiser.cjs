/**
 * Architecture rules (npm run lint:arch).
 * Server: presentation -> application -> domain; infrastructure implements domain/application ports.
 * Web: pages compose feature components; only features talk to lib/api.
 * src/shared is the only code used by both sides.
 */
const SERVER = '^src/server';
const WEB = '^src/(app|features|lib)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'Domain code may only import other domain code (no Nest, Prisma, Express or outer layers).',
      severity: 'error',
      from: { path: `${SERVER}/(core|modules/[^/]+)/domain/` },
      to: { pathNot: `${SERVER}/(core|modules/[^/]+)/domain/` },
    },
    {
      name: 'application-not-outward',
      comment: 'Application services depend on ports, never on infrastructure or presentation.',
      severity: 'error',
      from: { path: `${SERVER}/(core|modules/[^/]+)/application/` },
      to: {
        path: [
          `${SERVER}/infrastructure/`,
          `${SERVER}/common/`,
          `${SERVER}/modules/[^/]+/(infrastructure|presentation)/`,
          'node_modules/(@prisma|express|bcryptjs|@nestjs/jwt)/',
        ],
      },
    },
    {
      name: 'web-not-into-server',
      comment: 'Frontend code reaches the server only over HTTP (features/*/api.ts), never by import.',
      severity: 'error',
      from: { path: WEB },
      to: { path: `${SERVER}/` },
    },
    {
      name: 'server-not-into-web',
      comment: 'Server code may share src/shared with the frontend, but never imports frontend code.',
      severity: 'error',
      from: { path: `${SERVER}/` },
      to: { path: WEB },
    },
    {
      name: 'pages-use-features',
      comment: 'Pages (app/) go through features/*, not the low-level API client.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: { path: '^src/lib/api/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['/generated/', '\\.next/', '^dist/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
