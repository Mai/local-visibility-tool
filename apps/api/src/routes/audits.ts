import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();
export const auditsRouter = router;

/**
 * Helper to parse input parameters from the incoming request.
 */
export function parseAuditRequest(req: Request) {
  const rawQuery = (req.body?.searchQuery || req.query?.searchQuery || '') as string;
  const rawUrl = (req.body?.websiteUrl || req.query?.websiteUrl || req.body?.url || req.query?.url || '') as string;

  const searchQuery = rawQuery.trim();
  const websiteUrl = rawUrl.trim();

  // If no explicit searchQuery was typed, attempt to parse the domain from the websiteUrl
  let finalQuery = searchQuery;
  if (!finalQuery && websiteUrl) {
    try {
      const parsed = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
      finalQuery = parsed.hostname.replace(/^www\./, '');
    } catch {
      finalQuery = websiteUrl;
    }
  }

  return { searchQuery: finalQuery, websiteUrl };
}

/**
 * Fetches Google Places data dynamically for the requested search target
 */
async function fetchGooglePlacesData(searchQuery: string, apiKey: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('[Google Places Integration Error]', error);
    return null;
  }
}

/**
 * Dynamic Audit Handler Logic
 */
async function handleAuditRequest(req: Request, res: Response) {
  try {
    const { searchQuery, websiteUrl } = parseAuditRequest(req);

    // Require at least a query or URL to run an audit
    if (!searchQuery && !websiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid website URL or business search query.',
      });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    let placesData = null;

    if (searchQuery && apiKey) {
      placesData = await fetchGooglePlacesData(searchQuery, apiKey);
    } else if (!apiKey) {
      console.warn('[Audit Warning] GOOGLE_PLACES_API_KEY is not set in apps/api/.env');
    }

    return res.json({
      success: true,
      data: {
        websiteUrl,
        searchQuery,
        placesData,
        auditTimestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Audit handler error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to complete audit',
    });
  }
}

/**
 * Health check endpoints
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/audits/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Route handlers
 */
router.post('/audits', handleAuditRequest);
router.post('/audits/run', handleAuditRequest);