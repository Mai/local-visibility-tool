import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

function generate1stAideReport(filename: string) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(filename));

  const primaryColor = '#1e293b';
  const brandColor = '#2563eb';
  const lightBg = '#f8fafc';
  const darkInk = '#0f172a';
  const mutedInk = '#64748b';

  // --- HEADER ---
  doc.rect(0, 0, 595, 90).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(18).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 25, { bold: true } as any);
  doc.fontSize(14).text('1ST AIDE HOME CARE, INC.', 40, 48);
  doc.fontSize(9).fillColor('#94a3b8').text('Jackson Heights, NY 11372  |  September 17, 2026', 40, 68);

  // --- SCORE HERO ---
  doc.fillColor(darkInk).fontSize(12).text('Local search & AI visibility score', 40, 105);
  doc.fontSize(28).fillColor(brandColor).text('62', 40, 120, { continued: true });
  doc.fontSize(14).fillColor(mutedInk).text(' out of 100');

  doc.fontSize(9).fillColor(darkInk).text(
    'You have a solid functional base with listing discrepancies and missing website infrastructure that impacts where you show up in local search and in the LLMs. Start with the priority fixes outlined below to maximize local discoverability and increase inbound calls.',
    40,
    152,
    { width: 515 }
  );

  // Score breakdown list
  const scores = [
    '• Google Business Profile: 21/25 | Looking good',
    '• Local Listings: 12/20 | Room to improve',
    '• Website Location Signals: 14/25 | Needs work',
    '• Reviews: 10/15 | Room to improve',
    '• AI Search Visibility (LLM Visibility): 5/15 | Needs work'
  ];
  let currentY = 190;
  scores.forEach(s => {
    doc.fontSize(9).fillColor(mutedInk).text(s, 50, currentY);
    currentY += 14;
  });

  // --- WHAT'S ALREADY WORKING ---
  currentY += 10;
  doc.fillColor(primaryColor).fontSize(12).text("WHAT'S ALREADY WORKING", 40, currentY);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, currentY + 16).lineTo(555, currentY + 16).stroke();
  currentY += 24;

  const strengths = [
    '✓ NYS Department of Health Verification: Verified license entry (LHCSA ID 18809) with state directories builds explicit compliance trust.',
    '✓ Core Directory Presence: Established listings across foundational platforms including Yelp, MapQuest, NPI DB (NPI: 1265770028), and state registries.',
    '✓ Geographic Alignment: Name, Address, Phone (NAP) data correctly pins business operations to Queens.'
  ];
  strengths.forEach(st => {
    doc.fontSize(9).fillColor(darkInk).text(st, 40, currentY, { width: 515 });
    currentY += 22;
  });

  // --- WHERE TO FOCUS ---
  currentY += 5;
  doc.fillColor(primaryColor).fontSize(12).text('WHERE TO FOCUS', 40, currentY);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, currentY + 16).lineTo(555, currentY + 16).stroke();
  currentY += 24;

  doc.fontSize(10).fillColor(brandColor).text('Quick wins (small one-off tasks)', 40, currentY);
  currentY += 14;
  const quickWins = [
    '• Claim & Standardize Profiles: Claim your MapQuest and Yelp profiles to ensure phone numbers and business hours match your official website.',
    '• Standardize Name, Address, Phone (NAP) Across Government & Commercial Listings: Address discrepancies in listing titles between "1st Aide Home Care, Inc." (NYS DOH/NPI) and shortened variants on local directories.',
    '• Fix Missing SSL/HTTPS Security: Ensure https://1staidehc.com/ serves properly over a secure connection to avoid search engine ranking penalties.'
  ];
  quickWins.forEach(qw => {
    doc.fontSize(9).fillColor(darkInk).text(qw, 50, currentY, { width: 505 });
    currentY += 22;
  });

  currentY += 5;
  doc.fontSize(10).fillColor(brandColor).text('Ongoing efforts', 40, currentY);
  currentY += 14;
  const ongoing = [
    '• AI Search Optimization (LLM Visibility): AI assistants like ChatGPT, Gemini, and Perplexity struggle to cite your site because key operational details (e.g., accepted Medicaid Managed Care plans) are missing.',
    '• Publish NY Medicaid & Payer Information: Plain-language pages clarifying NY Medicaid (MLTC) coverage and private pay options capture high-intent local queries.',
    '• Build Local Reviews: Encourage satisfied clients and their families in Jackson Heights and Queens to leave Google and Yelp reviews.'
  ];
  ongoing.forEach(og => {
    doc.fontSize(9).fillColor(darkInk).text(og, 50, currentY, { width: 505 });
    currentY += 22;
  });

  // --- PAGE 2: DETAILED BREAKDOWN ---
  doc.addPage();
  currentY = 40;

  doc.fillColor(primaryColor).fontSize(14).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, currentY);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, currentY + 18).lineTo(555, currentY + 18).stroke();
  currentY += 30;

  // Table helper
  function renderSection(title: string, items: { check: string; status: string; detail: string }[]) {
    doc.fontSize(11).fillColor(brandColor).text(title, 40, currentY);
    currentY += 16;
    
    // Header
    doc.rect(40, currentY, 515, 18).fill('#e2e8f0');
    doc.fontSize(8).fillColor(darkInk).text('CHECK', 45, currentY + 5);
    doc.text('STATUS', 280, currentY + 5);
    doc.text('DETAIL / SCORE', 380, currentY + 5);
    currentY += 18;

    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? lightBg : '#ffffff';
      doc.rect(40, currentY, 515, 18).fill(bg);
      doc.fontSize(8).fillColor(darkInk).text(item.check, 45, currentY + 5, { width: 230 });
      doc.text(item.status, 280, currentY + 5);
      doc.text(item.detail, 380, currentY + 5, { width: 170 });
      currentY += 18;
    });
    currentY += 15;
  }

  renderSection('1. Google Business Profile (21/25 points)', [
    { check: 'Profile exists and is live', status: 'Pass', detail: '5 / 5' },
    { check: 'Matches website NAP', status: 'Partial', detail: '3 / 4' },
    { check: 'Photos uploaded', status: 'Partial', detail: '2 / 3' },
    { check: 'Weekly hours completed', status: 'Pass', detail: '2 / 2' },
    { check: 'Links to primary website', status: 'Pass', detail: '2 / 2' },
    { check: 'Primary category set', status: 'Pass', detail: '5 / 5 ("Home Health Care Service")' },
  ]);

  renderSection('2. Local Listings (12/20 points)', [
    { check: 'Mainstream directories', status: '2 of 4', detail: 'Listed on Yelp, MapQuest; Missing Bing, Apple' },
    { check: 'NY State & Health Registries', status: 'Pass', detail: 'Active LHCSA #18809, NPI #1265770028' },
    { check: 'NAP Consistency', status: 'Partial', detail: 'Name variations exist across directories' },
    { check: 'Care Types Specified', status: 'Partial', detail: 'Personal care vs nursing missing on 3rd party' },
    { check: 'Duplicate Listings', status: 'Pass', detail: 'No active duplicates detected' },
  ]);

  renderSection('3. Website Location Signals (14/25 points)', [
    { check: 'Page title includes city/zip', status: 'Partial', detail: 'Mentions NY/Queens, missing explicit 11372 ZIP code' },
    { check: 'Crawlable Address & Phone', status: 'Pass', detail: 'HTML text available in footer' },
    { check: 'Meta Description Accuracy', status: 'Partial', detail: 'Lacks target keywords (Jackson Heights)' },
    { check: 'Embedded Google Map', status: 'Missing', detail: 'No map embedded on site' },
    { check: 'Page Load & Mobile Usability', status: 'Needs Work', detail: 'Mobile optimization requires improvement' },
    { check: 'Schema Markup', status: 'Missing', detail: 'Missing LocalBusiness / HomeHealthService JSON-LD' },
  ]);

  // --- PAGE 3: REVIEWS & AI VISIBILITY ---
  doc.addPage();
  currentY = 40;

  renderSection('4. Reviews (10/15 points)', [
    { check: 'Google / Platform Star Rating', status: '3.8 / 5.0 Stars', detail: '2 / 4 pts' },
    { check: 'Review Volume', status: 'Under 20 Reviews', detail: '2 / 3 pts' },
    { check: 'Review Recency', status: '> 90 Days', detail: '1 / 3 pts' },
    { check: 'Secondary Platform Presence', status: 'Pass', detail: 'Yelp / NPIDB active' },
  ]);

  renderSection('5. AI Search Visibility / LLM Visibility (5/15 points)', [
    { check: 'Single-sentence summary', status: 'Pass', detail: '2 / 2 pts' },
    { check: 'External site citations', status: 'Pass', detail: '2 / 2 pts (NYS Health, NPIDB)' },
    { check: 'FAQ coverage for family questions', status: 'Missing', detail: '0 / 3 pts' },
    { check: 'Service pages broken out', status: 'Partial', detail: '1 / 2 pts' },
    { check: 'Top AI engine recommendation ranking', status: '0 of 6 queries', detail: '0 / 6 pts' },
  ]);

  doc.fontSize(11).fillColor(brandColor).text('High-Intent AI Queries Your Site Currently Misses:', 40, currentY);
  currentY += 15;

  const aiQueries = [
    '• Does New York Medicaid MLTC cover CDPAP or personal care through 1st Aide Home Care?',
    '• How do I arrange home care in Queens?',
    '• What home care agencies in Jackson Heights speak Spanish / Bengali / Nepali?',
    '• What is the difference between home health aides (HHA) and personal care aides (PCA) in NY?'
  ];

  aiQueries.forEach(q => {
    doc.fontSize(9).fillColor(darkInk).text(q, 50, currentY, { width: 505 });
    currentY += 18;
  });

  doc.end();
}

const outputFile = '1st-Aide-Home-Care-Visibility-Report.pdf';
generate1stAideReport(outputFile);
console.log(`\n📄 Generated report: ${outputFile}\n`);
