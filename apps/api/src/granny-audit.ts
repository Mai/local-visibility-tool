import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

async function generateGrannyAudit() {
  const auditData = {
    businessName: "GRANNY’S IN-HOME CARE",
    location: "Lakeland, FL",
    date: "September 17, 2026",
    overallScore: 58,
    categories: {
      gbp: { score: 18, total: 25, label: "Room to improve" },
      listings: { score: 14, total: 20, label: "Room to improve" },
      website: { score: 12, total: 25, label: "Needs attention" },
      reviews: { score: 10, total: 15, label: "Room to improve" },
      llm: { score: 4, total: 15, label: "Needs attention" },
    }
  };

  const jsonFilename = `granny-in-home-care-audit.json`;
  const pdfFilename = `granny-in-home-care-audit.pdf`;

  fs.writeFileSync(jsonFilename, JSON.stringify(auditData, null, 2));

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(pdfFilename));

  // Colors
  const primaryColor = '#1e293b';
  const brandColor = '#2563eb';
  const textColor = '#0f172a';
  const mutedColor = '#64748b';

  // --- PAGE 1: HEADER & OVERVIEW ---
  doc.fillColor(mutedColor).fontSize(9).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 40);
  doc.fillColor(textColor).fontSize(20).text('GRANNY’S IN-HOME CARE', 40, 52);
  doc.fillColor(mutedColor).fontSize(10).text('Lakeland, FL | September 17, 2026', 40, 75);

  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(40, 95).lineTo(555, 95).stroke();

  // Score Box
  doc.rect(40, 110, 515, 65).fill('#f8fafc');
  doc.fillColor(brandColor).fontSize(28).text('58', 60, 122);
  doc.fillColor(mutedColor).fontSize(12).text('out of 100', 100, 134);
  doc.fillColor(textColor).fontSize(10).text('Local search & AI visibility score', 170, 125);
  doc.fillColor(mutedColor).fontSize(9).text('You have a recognizable local presence, but several gaps in third-party citations, website location signals, and structured AI search answers limit your overall reach in the Lakeland market.', 170, 140, { width: 370 });

  // Module Breakdown Table
  let y = 190;
  const modules = [
    { name: 'Google Business Profile', score: '18/25', label: 'Room to improve' },
    { name: 'Local Listings', score: '14/20', label: 'Room to improve' },
    { name: 'Website Location Signals', score: '12/25', label: 'Needs attention' },
    { name: 'Reviews', score: '10/15', label: 'Room to improve' },
    { name: 'AI Search Visibility (LLM Visibility)', score: '4/15', label: 'Needs attention' },
  ];

  modules.forEach((m) => {
    doc.fillColor(textColor).fontSize(10).text(m.name, 40, y);
    doc.fillColor(brandColor).text(`|  ${m.score}`, 240, y);
    doc.fillColor(mutedColor).text(`|  ${m.label}`, 310, y);
    y += 18;
  });

  // What's Working
  y += 15;
  doc.fillColor(textColor).fontSize(12).text('WHAT\'S ALREADY WORKING', 40, y);
  y += 18;
  const working = [
    'Established Care Availability & Directory Footprint: Strong profile listings on niche senior platforms including CareAvailability, AgingCare, HealthFinder Florida, and Yelp.',
    'Active Corporate Standing: Verified active corporate registration with the Florida Department of State (Sunbiz) under Granny\'s In-Home Care, Inc.',
    'Local Community Presence: Established Nextdoor business page representing Lakeland and broader Polk County.'
  ];
  working.forEach((item) => {
    doc.fillColor(textColor).fontSize(9).text(`✓  ${item}`, 40, y, { width: 515 });
    y += 24;
  });

  // Where to Focus
  y += 10;
  doc.fillColor(textColor).fontSize(12).text('WHERE TO FOCUS', 40, y);
  y += 18;
  doc.fillColor(brandColor).fontSize(10).text('Quick wins', 40, y);
  doc.fillColor(mutedColor).fontSize(8.5).text('Small, one-off fixes you can execute quickly.', 105, y + 1.5);
  y += 15;

  const quickWins = [
    'Standardize Entity Name, Address, Phone (NAP): Yours appears under multiple variations (Granny\'s In-Home Care, Granny\'s In Home Care, Inc.). Unify this to "Granny’s In-Home Care" across Google, MapQuest, and Yelp.',
    'Add ZIP code 33813 to Website Footer: Ensure your full physical/mailing address and ZIP code 33813 are crawlable text in the page footer.',
    'Claim & Update MapQuest Listing: Update the MapQuest listing to reflect your primary Lakeland address and website domain (https://www.grannyathome.com/).'
  ];
  quickWins.forEach((item) => {
    doc.fillColor(textColor).fontSize(9).text(`•  ${item}`, 40, y, { width: 515 });
    y += 28;
  });

  // Footer Page 1
  doc.fillColor(mutedColor).fontSize(8).text('Granny’s In-Home Care Local Search & AI Visibility Report | Page 1 of 3', 40, 780, { align: 'center' });

  // --- PAGE 2: DETAILED CHECKS ---
  doc.addPage();
  doc.fillColor(textColor).fontSize(14).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, 40);

  y = 70;
  // Section 1
  doc.fillColor(textColor).fontSize(11).text('Google Business Profile (18/25 points)', 40, y);
  y += 15;
  const gbpChecks = [
    ['Profile exists and is live', 'Pass', '5/5'],
    ['Matches website details exactly', 'Partial', '2/4'],
    ['Has plenty of photos (20+ showing)', 'Partial', '2/3'],
    ['Hours filled in for the whole week', 'Pass', '2/2'],
    ['Links to your website', 'Pass', '2/2']
  ];
  gbpChecks.forEach(([check, status, score]) => {
    doc.fillColor(textColor).fontSize(9).text(check, 40, y);
    doc.fillColor(mutedColor).text(status, 320, y);
    doc.text(score, 450, y);
    y += 16;
  });

  // Section 2
  y += 15;
  doc.fillColor(textColor).fontSize(11).text('Local Listings & Directory Footprint (14/20 points)', 40, y);
  y += 15;
  const listingsChecks = [
    ['Mainstream directories (Yelp, MapQuest, Nextdoor)', '3 of 4 Pass', '3/4 pts'],
    ['Senior-care lead-gen directories', '3 of 4 Pass', '6/8 pts'],
    ['Florida Sunbiz licensing link verified', 'Pass', '2/2 pts'],
    ['No duplicate listings detected', 'Pass', '1/2 pts']
  ];
  listingsChecks.forEach(([check, status, score]) => {
    doc.fillColor(textColor).fontSize(9).text(check, 40, y);
    doc.fillColor(mutedColor).text(status, 320, y);
    doc.text(score, 450, y);
    y += 16;
  });

  // Section 3
  y += 15;
  doc.fillColor(textColor).fontSize(11).text('Website Location Signals (12/25 points)', 40, y);
  y += 15;
  const webChecks = [
    ['Page title mentions city/ZIP code 33813', 'Partial', '1/3 pts'],
    ['Address and phone are real text', 'Partial', '1/3 pts'],
    ['Search summary names town and care', 'Pass', '2/2 pts'],
    ['A map is embedded on your site', 'Missing', '0/2 pts'],
    ['Loads quickly and works on phone', 'Pass', '4/4 pts'],
    ['Hidden schema code describes business', 'Missing', '0/4 pts'],
    ['Dedicated pages for each community', 'Missing (0/2 pts)', 'No specific sub-pages for Bartow, or Winter Haven.']
  ];
  webChecks.forEach(([check, status, score]) => {
    doc.fillColor(textColor).fontSize(9).text(check, 40, y);
    doc.fillColor(mutedColor).text(status, 320, y);
    doc.text(score, 450, y);
    y += 16;
  });

  // Footer Page 2
  doc.fillColor(mutedColor).fontSize(8).text('Granny’s In-Home Care Local Search & AI Visibility Report | Page 2 of 3', 40, 780, { align: 'center' });

  // --- PAGE 3: REVIEWS & AI VISIBILITY ---
  doc.addPage();
  y = 40;

  doc.fillColor(textColor).fontSize(11).text('Reviews (10/15 points)', 40, y);
  y += 18;
  const reviewChecks = [
    ['Google star rating (4.5+ Stars)', 'Pass', '4/4 pts'],
    ['Enough reviews to look established (< 25 Total)', 'Partial', '2/3 pts'],
    ['Still getting new regular reviews', 'Partial', '2/3 pts'],
    ['Secondary platforms have reviews', 'Partial', '2/5 pts']
  ];
  reviewChecks.forEach(([check, status, score]) => {
    doc.fillColor(textColor).fontSize(9).text(check, 40, y);
    doc.fillColor(mutedColor).text(status, 320, y);
    doc.text(score, 450, y);
    y += 16;
  });

  y += 20;
  doc.fillColor(textColor).fontSize(11).text('AI Search Visibility / LLM Visibility (4/15 points)', 40, y);
  y += 18;
  const llmChecks = [
    ['One sentence says what you are and where', 'Pass', '2/2 pts'],
    ['Other websites talk about you (Sunbiz, AgingCare)', 'Pass', '2/2 pts'],
    ['Website answers questions families ask', 'Missing', '0/3 pts'],
    ['Each care type has its own landing page', 'Partial', '0.5/2 pts'],
    ['Site shows up in top AI recommendations', 'Missing', '0/6 pts']
  ];
  llmChecks.forEach(([check, status, score]) => {
    doc.fillColor(textColor).fontSize(9).text(check, 40, y);
    doc.fillColor(mutedColor).text(status, 320, y);
    doc.text(score, 450, y);
    y += 16;
  });

  y += 35;
  doc.fillColor(textColor).fontSize(10).text('Questions families near Lakeland are asking AI searches that your site does not yet answer:', 40, y);
  y += 20;
  const questions = [
    '•  Does Florida Medicaid long-term care waiver cover in-home care services in Lakeland, FL?',
    '•  What is the minimum hourly commitment per week for private-duty home care in Polk County?',
    '•  How long after an assessment can a senior start receiving home care?'
  ];
  questions.forEach((q) => {
    doc.fillColor(textColor).fontSize(9).text(q, 50, y, { width: 500 });
    y += 20;
  });

  // Footer Page 3
  doc.fillColor(mutedColor).fontSize(8).text('Granny’s In-Home Care Local Search & AI Visibility Report | Page 3 of 3', 40, 780, { align: 'center' });

  doc.end();
}

generateGrannyAudit();
