import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { authRouter } from './modules/auth/auth.router';
import { websitesRouter } from './modules/websites/websites.router';
import { contentRouter } from './modules/content/content.router';
import { apiKeysRouter } from './modules/apikeys/apikeys.router';
import { sdkRouter } from './modules/sdk/sdk.router';
import { previewRouter } from './modules/sdk/preview.router';
import { publicRouter } from './modules/public/public.router';

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
      },
    },
  }));

  // SECURITY FIX: set trust proxy to exact number of hops for your topology
  // 1 = single load balancer / reverse proxy in front of the app
  app.set('trust proxy', 1);

  // Permissive CORS for public API — must come before the restrictive global CORS
  // so preflight OPTIONS from any origin are answered correctly.
  app.use('/public', cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CMS-Key', 'Authorization', 'If-None-Match'],
    exposedHeaders: ['ETag', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Cache', 'X-Cache-Age'],
    maxAge: 86400,
  }));

  // Restrictive CORS for the management API (dashboard only)
  app.use(cors({
    origin: config.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CMS-Key'],
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);

  // SECURITY FIX: health endpoint no longer leaks version
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1/websites', websitesRouter);
  app.use('/v1/websites/:id/content', contentRouter);
  app.use('/v1/websites/:id/keys', apiKeysRouter);
  // Preview page for PagePilot inline editing — must come before static SDK mount.
  // Helmet's CSP blocks framing by default, so we disable it for this route
  // and set a permissive CSP directly in the preview handler.
  app.use('/sdk/v1/preview',
    helmet({ contentSecurityPolicy: false, frameguard: false }),
    cors({ origin: '*' }),
    previewRouter,
  );

  // Serve the SDK JavaScript bundle (sdk.js) as a static file.
  // Must come before the sdkRouter so /sdk/v1/sdk.js is served without API key auth.
  const sdkDistPath = path.resolve(__dirname, '../../reactcms-sdk/dist');
  app.use('/sdk/v1', cors({ origin: '*' }), express.static(sdkDistPath, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }));
  app.use('/sdk/v1', sdkRouter);
  app.use('/public', publicRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  app.use(errorMiddleware);

  return app;
}
