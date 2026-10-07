import { env } from './infrastructure/config/env.js';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import next from 'next';
import { AppModule } from './app.module.js';

const API_ROUTE = /^\/api(\/|$)/;

// `next` is CommonJS: under ESM the default import is the factory itself, but its typings expose it as `.default`.
const createNextApp = next as unknown as typeof next.default;

/**
 * One server for the whole app: NestJS handles /api/*, Next.js (project root) handles everything else.
 */
async function bootstrap() {
  const dev = env.NODE_ENV !== 'production';

  const server = express();
  const httpServer = createServer(server);

  const web = createNextApp({ dev, dir: resolve(import.meta.dirname, '../..'), httpServer, port: env.PORT });
  const handleWeb = web.getRequestHandler();
  await web.prepare();

  // Registered before Nest so Next.js gets untouched requests (Nest's middleware never runs for pages).
  server.use((req, res, nextHandler) => (API_ROUTE.test(req.path) ? nextHandler() : handleWeb(req, res)));

  const api = await NestFactory.create(AppModule, new ExpressAdapter(server));
  api.setGlobalPrefix('api');
  api.use(helmet()); // API only: helmet's default CSP would break Next.js pages
  api.use(cookieParser());
  api.enableShutdownHooks();
  await api.init();

  httpServer.listen(env.PORT, () => {
    console.log(`> Accountex ready on http://localhost:${env.PORT} (${dev ? 'development' : 'production'})`);
  });
}
await bootstrap();
