import { Router } from 'express';

import { MODULES, TOTAL_MAX_POINTS } from '@sensi/shared';

import { env, missingApiKeys } from '../config/env.js';

export const healthRouter: Router = Router();

/**
 * Liveness plus a readiness view of which data sources are configured. The
 * frontend uses this to warn an operator before they run an audit that would
 * come back with modules marked "unable to verify".
 */
healthRouter.get('/health', (_request, response) => {
  const missing = missingApiKeys();

  response.json({
    status: 'ok',
    environment: env.NODE_ENV,
    scoring: {
      totalMaxPoints: TOTAL_MAX_POINTS,
      modules: MODULES.map((module) => ({ id: module.id, maxPoints: module.maxPoints })),
    },
    dataSources: {
      googlePlaces: Boolean(env.GOOGLE_PLACES_API_KEY),
      pageSpeed: true, // Works without a key at a reduced quota.
      serper: Boolean(env.SERPER_API_KEY),
      yelp: Boolean(env.YELP_API_KEY),
    },
    missingApiKeys: missing.map((requirement) => ({
      key: requirement.key,
      label: requirement.label,
      affects: requirement.affects,
      signupUrl: requirement.signupUrl,
    })),
  });
});
