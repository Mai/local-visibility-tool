import fs from 'fs';
import PDFDocument from 'pdfkit';

function createAtlanticReport() {
  const filename = 'atlantic_allcare_visibility_report.pdf';
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  doc.pipe(fs.createWriteStream(filename));

  const primaryColor = '#0f172a'; // Slate 900
  const brandColor = '#2563eb';   // Blue 600
  const softBg = '#f8fafc';       // Slate 50
  const borderColor = '#e2e8f0';  // Slate 200
  const textColor = '#334155';    // Slate 700

  // --- PAGE 1 ---
  // Header Banner
  doc.rect(0, 0, 612, 110).fill(primaryColor);
  doc.fillColor('#94a3b8').fontSize(9).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 25);
  doc.fillColor('#ffffff').fontSize(22).text('ATLANTIC ALL CARE, INC.', 40, 40);
  doc.fontSize(10).fillColor('#cbd5e1').text('Deerfield Beach, FL 33441 | September 2026', 40, 72);

  // Overall Score Box
  doc.rect(40, 125, 532, 70).fillAndStroke(softBg, borderColor);
  doc.fillColor(primaryColor).fontSize(11).text('Local search & AI visibility', 60, 140);
  doc.fillColor(brandColor).fontSize(28).text('68', 60, 155);
  doc.fillColor('#64748b').fontSize(12).text('/ 100', 100, 168);
  
  // Updated custom summary text
  doc.fontSize(8.5).fillColor(textColor).text(
    'Atlantic All Care, Inc. has a strong local footprint, appears in high-authority directories, and is consistently cited with home care in Broward County. To increase direct inbound referrals from families in South Florida, prioritize answering your customers search queries on your website using a conversational Q&A structure.', 
    170, 138, { width: 380 }
  );

  // Score Breakdown Badges
  const scores = [
    { label: 'Google Business Profile', score: '18/25', status: 'Room to improve' },
    { label: 'Local Listings', score: '16/20', status: 'Looking good' },
    { label: 'Website Location Signals', score: '17/25', status: 'Room to improve' },
    { label: 'Reviews', score: '11/15', status: 'Room to improve' },
    { label: 'AI Search Visibility (LLMs)', score: '6/15', status: 'Needs attention' },
  ];

  let startY = 210;
  scores.forEach((item) => {
    doc.fillColor(primaryColor).fontSize(10).text(`•  ${item.label}:`, 50, startY);
    doc.fillColor(brandColor).text(`${item.score}`, 220, startY);
    doc.fillColor('#64748b').text(`(${item.status})`, 270, startY);
    startY += 18;
  });

  // What's Already Working
  startY += 10;
  doc.fillColor(primaryColor).fontSize(13).text("WHAT'S ALREADY WORKING", 40, startY);
  doc.strokeColor(borderColor).lineWidth(1).moveTo(40, startY + 16).lineTo(572, startY + 16).stroke();
  startY += 25;

  const strengths = [
    '✓ Strong High-Authority Directory Presence: Verified listings across BBB (Accredited A+), Caring.com, CareListings, CareScout, and LinkedIn establish high domain authority.',
    '✓ Crawlable Contact Info: Address (Deerfield Beach, FL 33441) and phone numbers are prominently featured in text headers and footers across the website.',
    '✓ Active Social Signal Hubs: Active profile links across Facebook, Instagram, and LinkedIn reinforce organizational legitimacy for search crawlers.'
  ];

  strengths.forEach((str) => {
    doc.fillColor(textColor).fontSize(9.5).text(str, 50, startY, { width: 510 });
    startY += 28;
  });

  // Where to Focus
  startY += 10;
  doc.fillColor(primaryColor).fontSize(13).text('WHERE TO FOCUS', 40, startY);
  doc.strokeColor(borderColor).lineWidth(1).moveTo(40, startY + 16).lineTo(572, startY + 16).stroke();
  startY += 25;

  doc.fillColor(brandColor).fontSize(11).text('Quick wins', 40, startY);
  startY += 15;

  const quickWins = [
    '• Standardize Name, Address, Phone (NAP) Consistency: Ensure the business name is identical everywhere (e.g., resolving minor variations between "Atlantic All Care, Inc." and "Atlantic AllCare").',
    '• Embed Google Map on Website: Add an embedded Google Map frame on the contact page referencing your Deerfield Beach location.',
    '• Implement Structured Schema Markup: Add LocalBusiness and MedicalBusiness JSON-LD schema tags to your website code.'
  ];

  quickWins.forEach((win) => {
    doc.fillColor(textColor).fontSize(9).text(win, 50, startY, { width: 510 });
    startY += 26;
  });

  startY += 5;
  doc.fillColor(brandColor).fontSize(11).text('Ongoing efforts', 40, startY);
  startY += 15;

  const ongoing = [
    '• Encourage Customer Feedback and Reviews: Engage with customers and let them know that Google reviews help your search rankings and are a great way for them to support your business.',
    '• Publish Florida Medicaid & Long-Term Care Insurance Guides: Plain-language articles explaining Florida long-term insurance plans, Medicaid options, and VA benefit support capture conversational AI queries.',
    '• Expand Service Area Pages: Create dedicated sub-pages for surrounding South Florida communities (e.g., Boca Raton, Pompano Beach, Fort Lauderdale).'
  ];

  ongoing.forEach((eff) => {
    doc.fillColor(textColor).fontSize(9).text(eff, 50, startY, { width: 510 });
    startY += 28;
  });

  // Footer Page 1
  doc.fontSize(8).fillColor('#94a3b8').text('Atlantic All Care, Inc. Local Search & AI Visibility Report | Page 1 of 2', 40, 750, { align: 'center' });

  // --- PAGE 2 ---
  doc.addPage();
  doc.rect(0, 0, 612, 50).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(14).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, 18);

  // Section 1: Google Business Profile
  let y2 = 70;
  doc.fillColor(primaryColor).fontSize(12).text('1. Google Business Profile (18/25 points)', 40, y2);
  y2 += 18;

  const gbpChecks = [
    ['Profile exists and is live', 'Pass', '5/5'],
    ['Matches website details', 'Pass', '4/4'],
    ['Has plenty of photos (20+ showing)', 'Partial', '2/3'],
    ['Hours filled in for the whole week', 'Pass', '2/2'],
    ['Links directly to website', 'Pass', '2/2'],
    ['Google Review Velocity & Recency', 'Needs Work', '3/9']
  ];

  gbpChecks.forEach(([check, status, score]) => {
    doc.fontSize(8.5).fillColor(textColor).text(`• ${check}`, 50, y2);
    doc.text(status, 350, y2);
    doc.text(score, 480, y2);
    y2 += 14;
  });

  // Section 2: Local Listings
  y2 += 15;
  doc.fillColor(primaryColor).fontSize(12).text('2. Local Listings (16/20 points)', 40, y2);
  y2 += 18;

  const listingChecks = [
    ['Mainstream Directories', '5 of 6 (3/3 pts)', 'Listed on Facebook, Instagram, LinkedIn, BBB, Yelp'],
    ['Senior-Care Directories', '4 of 4 (8/8 pts)', 'Present on Caring.com, CareListings, CareScout, AgingCare'],
    ['NAP Consistency', 'Partial (3/6 pts)', 'Name variations exist between "Atlantic All Care" & "Atlantic AllCare"'],
    ['Detailed Category Labeling', 'Pass (2/2 pts)', 'Specific home health care offerings listed across portals']
  ];

  listingChecks.forEach(([label, stat, detail]) => {
    doc.fontSize(8.5).fillColor(textColor).text(`• ${label}: ${stat}`, 50, y2);
    doc.fontSize(8).fillColor('#64748b').text(`  ${detail}`, 50, y2 + 10);
    y2 += 22;
  });

  // Section 3: Website Signals
  y2 += 10;
  doc.fillColor(primaryColor).fontSize(12).text('3. Website Location Signals (17/25 points)', 40, y2);
  y2 += 18;

  const siteChecks = [
    ['Page title includes location', 'Pass (3/3 pts)', 'Title tags cite Deerfield Beach / Broward County'],
    ['Address & phone crawlable text', 'Pass (3/3 pts)', 'Plain text in footer/header'],
    ['Search summary names area & care', 'Pass (2/2 pts)', 'Accurate meta description present'],
    ['Google Map embedded on site', 'Missing (0/2 pts)', 'No live embedded map detected on main pages'],
    ['Structured Schema Markup', 'Missing (0/4 pts)', 'Schema JSON-LD code not fully deployed'],
    ['Dedicated community subpages', 'Missing (0/2 pts)', 'Needs specific sublocation pages for neighboring cities']
  ];

  siteChecks.forEach(([lbl, st, nt]) => {
    doc.fontSize(8.5).fillColor(textColor).text(`• ${lbl}: ${st}`, 50, y2);
    doc.fontSize(8).fillColor('#64748b').text(`  ${nt}`, 50, y2 + 10);
    y2 += 22;
  });

  // Section 4: AI Visibility
  y2 += 10;
  doc.fillColor(primaryColor).fontSize(12).text('4. AI Search Visibility / LLM Visibility (6/15 points)', 40, y2);
  y2 += 18;

  const aiQuestions = [
    '• Does Florida Long-Term Care Managed Care (SMMC LTC) cover in-home care services?',
    '• What is the difference between skilled home health care and private duty personal care in Deerfield Beach?',
    '• How quickly can an in-home caregiver be placed in Broward County?',
    '• What long-term care insurance policies does Atlantic All Care accept?'
  ];

  doc.fontSize(8.5).fillColor(textColor).text('Questions families near Deerfield Beach ask AI engines that your website does not yet explicitly answer:', 50, y2);
  y2 += 15;

  aiQuestions.forEach((q) => {
    doc.fontSize(8).fillColor('#475569').text(q, 60, y2);
    y2 += 12;
  });

  // Footer Page 2
  doc.fontSize(8).fillColor('#94a3b8').text('Atlantic All Care, Inc. Local Search & AI Visibility Report | Page 2 of 2', 40, 750, { align: 'center' });

  doc.end();
  console.log(`\n✅ Generated updated report: ${filename}\n`);
}

createAtlanticReport();
