import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { SESSION_COOKIE, findSession } from './auth/session.js';
import { AppError, forbidden } from './domain/errors.js';
import { registerApiRoutes } from './routes/api.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPageRoutes } from './routes/pages.js';
import { renderErrorPage } from './views/error.js';

export interface AppOptions {
  pool: Pool;
  now?: () => Date;
  demo?: boolean;
  demoPassword?: string;
  cookieSecure?: boolean;
  sessionTtlHours?: number;
  trustProxy?: boolean;
  logger?: boolean | Record<string, unknown>;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

function isApiRequest(url: string): boolean {
  return url.startsWith('/api/');
}

const ERROR_TITLES: Readonly<Record<number, string>> = {
  400: 'Bad request',
  401: 'Sign in required',
  403: 'Not allowed',
  404: 'Not found',
  409: 'That action is not available',
  422: 'Check your details',
  500: 'Something went wrong',
};

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? ((): Date => new Date());
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 128 * 1024,
  });

  await app.register(cookie);
  await app.register(formbody, { bodyLimit: 100 * 1024 });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: '/static/',
  });

  app.decorateRequest('currentUser', null);
  app.decorateRequest('sessionToken', null);

  // Same-origin enforcement for state-changing requests. JSON API clients
  // cannot set a cross-origin form post, and SameSite=Lax keeps the session
  // cookie off cross-site requests; this closes the remaining form-post gap.
  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;

    const fetchSite = request.headers['sec-fetch-site'];
    if (
      fetchSite !== undefined &&
      fetchSite !== 'same-origin' &&
      fetchSite !== 'none'
    ) {
      throw forbidden('Cross-site requests are not allowed.');
    }

    // Some Chromium builds send `Origin: null` for a same-origin form POST
    // when no Sec-Fetch-Site header is present. A null origin is therefore
    // allowed; the session cookie is SameSite=Lax, so a cross-site form post
    // cannot carry authentication, and JSON API writes are not form-postable.
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== 'null') {
      const expected = `${request.protocol}://${request.headers.host ?? ''}`;
      if (origin !== expected) {
        throw forbidden('Cross-origin requests are not allowed.');
      }
    }
  });

  app.addHook('onRequest', async (request) => {
    if (
      request.url.startsWith('/static/') ||
      request.url.startsWith('/healthz')
    ) {
      return;
    }

    const token = request.cookies[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') return;

    const user = await findSession(options.pool, token);
    if (user !== null) {
      request.currentUser = user;
      request.sessionToken = token;
    }
  });

  registerHealthRoutes(app, { pool: options.pool });
  registerApiRoutes(app, {
    pool: options.pool,
    now,
    demo: options.demo ?? false,
    demoPassword: options.demoPassword ?? 'demo-pass-123',
    cookieSecure: options.cookieSecure ?? false,
    sessionTtlHours: options.sessionTtlHours ?? 168,
  });
  registerPageRoutes(app, {
    pool: options.pool,
    now,
    demo: options.demo ?? false,
    demoPassword: options.demoPassword ?? 'demo-pass-123',
    cookieSecure: options.cookieSecure ?? false,
    sessionTtlHours: options.sessionTtlHours ?? 168,
  });

  app.setNotFoundHandler((request, reply) => {
    if (isApiRequest(request.url)) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Not found.' },
      });
    }
    return reply.code(404).type('text/html; charset=utf-8').send(
      renderErrorPage({
        statusCode: 404,
        title: 'Not found',
        message: 'That page does not exist. It may have been moved or removed.',
        user: request.currentUser,
        now: now(),
        demo: options.demo ?? false,
        currentPath: request.url,
      }),
    );
  });

  app.setErrorHandler((caught, request, reply) => {
    const appError = caught instanceof AppError ? caught : null;
    const fastifyStatus = (caught as { statusCode?: unknown }).statusCode;
    const reportedStatus =
      appError?.statusCode ??
      (typeof fastifyStatus === 'number' ? fastifyStatus : 500);
    const statusCode = reportedStatus >= 400 && reportedStatus < 600 ? reportedStatus : 500;
    const isServerError = statusCode >= 500;

    if (isServerError) {
      request.log.error({ err: caught }, 'Unhandled request error');
    }

    const message =
      appError !== null
        ? appError.message
        : isServerError
          ? 'Something went wrong on our side. Please try again.'
          : 'That request could not be completed.';
    const code = appError?.code ?? (isServerError ? 'internal_error' : 'request_failed');

    if (isApiRequest(request.url)) {
      const body = {
        error: {
          code,
          message,
          ...(appError?.details === undefined
            ? {}
            : { details: appError.details }),
        },
      };
      return reply.code(statusCode).send(body);
    }

    return reply
      .code(statusCode)
      .type('text/html; charset=utf-8')
      .send(
        renderErrorPage({
          statusCode,
          title: ERROR_TITLES[statusCode] ?? 'Request failed',
          message,
          user: request.currentUser,
          now: now(),
          demo: options.demo ?? false,
          currentPath: request.url,
        }),
      );
  });

  return app;
}
