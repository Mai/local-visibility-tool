import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { HttpError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { analyzeRouter } from './routes/analyze.js';
import { auditsRouter } from './routes/audits.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      // Dynamically allows all local addresses alongside environment settings
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://127.0.2.2:3000',
        ...(Array.isArray(env.corsOrigins) ? env.corsOrigins : env.corsOrigins ? [env.corsOrigins] : [])
      ],
      credentials: true
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api', auditsRouter);
  app.use('/api', analyzeRouter);

  app.use((request, response) => {
    response.status(404).json({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.path}` },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        logger.error(error.message, { code: error.code, path: request.path });
      }
      response.status(error.statusCode).json(error.toResponse());
      return;
    }

    logger.error('Unhandled error', {
      path: request.path,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    response.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Something went wrong on our end. Please try again.',
      },
    });
  };

  app.use(errorHandler);

  return app;
}
