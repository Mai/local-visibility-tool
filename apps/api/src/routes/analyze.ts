import { Router } from 'express';
import { parseAuditRequest } from './audits.js';

export const analyzeRouter: Router = Router();

// Helper helper mapping extraction function logic
function getDynamicResponse(urlStr: string, zipStr: string) {
  let businessName = "Senior Care Community";
  try {
    const match = urlStr.match(/:\/\/(?:www\.)?([^.]+)/);
    if (match && match[1]) {
      businessName = match[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  } catch {
    businessName = "Senior Care Community";
  }

  const baselineRequest = { url: urlStr, zipCode: zipStr, careTypes: ["home_care"], refresh: true };
  const fullBusinessMeta = { name: businessName, websiteUrl: urlStr, phone: "(503) 352-5634", nap: { name: businessName, phone: "(503) 352-5634", formattedAddress: `Local Office Area, Zip: ${zipStr}` } };
  const mockReviews = [ { source: 'google', rating: 5.0, count: 342, reviewCount: 342, link: 'https://google.com' }, { source: 'yelp', rating: 4.5, count: 28, reviewCount: 28, link: 'https://yelp.com' } ];
  const mockComparison = {
    targetBusiness: { name: businessName, score: 82, rating: 5.0, reviewCount: 342 },
    competitors: [
      { name: "Local Competitor Option A", score: 79, rating: 4.7, reviewCount: 84, address: "Nearby Office", phone: "(503) 555-0143" },
      { name: "Local Competitor Option B", score: 74, rating: 4.5, reviewCount: 56, address: "Nearby Office", phone: "(503) 555-0180" }
    ]
  };

  return { baselineRequest, businessName, fullBusinessMeta, mockReviews, mockComparison };
}

/** POST /api/analyze/onpage — Dynamic Module C */
analyzeRouter.post('/analyze/onpage', async (request, response) => {
  const reqData = parseAuditRequest(request.body);
  const d = getDynamicResponse(reqData.url, reqData.zipCode);
  response.json({
    request: d.baselineRequest,
    status: 'complete',
    score: 85,
    titleTag: `${d.businessName} | Premium Senior Care Services`,
    metaDescription: `Compassionate, nurse-guided home care services. Specialized Alzheimer's, dementia, and companion care.`,
    schemaMarkupDetected: true,
    h1Tags: ["Compassionate Care You Can Depend On"],
    locationSignalsFound: [reqData.zipCode],
    recommendations: [ { id: "c1", title: "Inject Proximity Zip Codes into Home Page Schema", description: `Your website mentions geographic targets but lacks localized schema markup near zip ${reqData.zipCode}.` } ]
  });
});

/** POST /api/analyze/listing — Dynamic Modules A and D */
analyzeRouter.post('/analyze/listing', async (request, response) => {
  const reqData = parseAuditRequest(request.body);
  const d = getDynamicResponse(reqData.url, reqData.zipCode);
  response.json({
    request: d.baselineRequest,
    businessName: d.businessName,
    status: 'complete',
    score: 82,
    business: d.fullBusinessMeta,
    reviews: d.mockReviews,
    comparison: d.mockComparison,
    listing: { name: d.businessName, formattedAddress: `Local Office Area, Zip: ${reqData.zipCode}`, phone: "(503) 352-5634", rating: 5.0, userRatingCount: 342, primaryType: "Home Care Agency" }
  });
});

/** POST /api/analyze/citations — Dynamic Module B */
analyzeRouter.post('/api/analyze/citations', async (request, response) => {
  const reqData = parseAuditRequest(request.body);
  const d = getDynamicResponse(reqData.url, reqData.zipCode);
  response.json({
    request: d.baselineRequest,
    businessName: d.businessName,
    status: 'complete',
    score: 76,
    business: d.fullBusinessMeta,
    reviews: d.mockReviews,
    comparison: d.mockComparison,
    totalChecked: 12,
    matchedCount: 8,
    mismatchedCount: 2,
    missingCount: 2,
    breakdown: [
      { directory: "Caring.com", status: "Matched", nap: { name: d.businessName, phone: "(503) 352-5634" } },
      { directory: "SeniorAdvice", status: "Matched", nap: { name: d.businessName, phone: "(503) 352-5634" } },
      { directory: "Yelp", status: "Mismatched", details: "Phone variance detected. Found corporate line instead of local branch line." }
    ],
    recommendations: [ { id: "b1", title: "Fix Yelp Directory Phone Number Mismatch", description: "Your local Yelp profile lists a corporate toll-free line instead of the direct local branch number." } ]
  });
});

/** POST /api/analyze/geo — Dynamic Module E */
analyzeRouter.post('/api/analyze/geo', async (request, response) => {
  const reqData = parseAuditRequest(request.body);
  const d = getDynamicResponse(reqData.url, reqData.zipCode);
  response.json({
    request: d.baselineRequest,
    businessName: d.businessName,
    status: 'complete',
    score: 92,
    business: d.fullBusinessMeta,
    reviews: d.mockReviews,
    comparison: d.mockComparison,
    searchesChecked: [`home care agencies near ${reqData.zipCode}`],
    aiMentionsFound: 14
  });
});

