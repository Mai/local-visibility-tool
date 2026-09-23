import fs from 'fs';
import PDFDocument from 'pdfkit';

function buildFullReport() {
  const doc = new PDFDocument({ margin: 40, autoFirstPage: false });
  const filename = 'Southern_Comfort_Full_Visibility_Report.pdf';
  doc.pipe(fs.createWriteStream(filename));

  const navy = '#0f172a';
  const blue = '#2563eb';
  const textDark = '#1e293b';
  const textMuted = '#64748b';
  const line = '#cbd5e1';
  const lightBg = '#f8fafc';

  const addHeader = (pageNum: number) => {
    doc.rect(0, 0, 612, 85).fill(navy);
    doc.fillColor('#ffffff').fontSize(16).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 20, { bold: true } as any);
    doc.fontSize(12).fillColor('#38bdf8').text('SOUTHERN COMFORT IN-HOME CARE, INC.', 40, 40);
    doc.fontSize(9).fillColor('#94a3b8').text('Andalusia, AL | September 17, 2026', 40, 58);
  };

  const addFooter = (pageNum: number) => {
    doc.fontSize(8).fillColor(textMuted).text(
      `Southern Comfort In-Home Care, Inc. Local Search & AI Visibility Report | Page ${pageNum} of 3`,
      40,
      750,
      { align: 'center', width: 532 }
    );
  };

  // ================= PAGE 1 =================
  doc.addPage();
  addHeader(1);

  let y = 105;
  doc.fillColor(navy).fontSize(14).text('Local search & AI visibility: 52 / 100', 40, y);
  y += 20;
  doc.fontSize(9.5).fillColor(textDark).text(
    'You have a recognizable local presence across multiple healthcare and regional directories, but missing website optimization and inconsistent listing data hold back your AI and local map search.',
    40,
    y,
    { width: 532 }
  );
  y += 35;

  // Overview Table
  const overview = [
    { name: 'Google Business Profile', score: '12 / 25', status: 'Needs attention' },
    { name: 'Local Listings', score: '14 / 20', status: 'Room to improve' },
    { name: 'Website Location Signals', score: '13 / 25', status: 'Needs attention' },
    { name: 'Reviews', score: '8 / 15', status: 'Needs attention' },
    { name: 'AI Search Visibility (LLM Visibility)', score: '5 / 15', status: 'Needs attention' },
  ];

  overview.forEach((row) => {
    doc.fontSize(9.5).fillColor(navy).text(row.name, 40, y);
    doc.fillColor(blue).text(`|  ${row.score}`, 240, y);
    doc.fillColor(textMuted).text(`|  ${row.status}`, 310, y);
    y += 18;
  });

  y += 15;
  doc.fillColor(navy).fontSize(12).text("WHAT'S ALREADY WORKING", 40, y);
  doc.strokeColor(line).lineWidth(1).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
  y += 25;

  const working = [
    'Multi-Directory Footprint: Listed on key senior care aggregators like Caring.com alongside major local directories like Yelp, Yahoo Local, MapQuest, and the Andalusia Area Chamber of Commerce.',
    'Crawlable Contact Details: Contact phone number (334-222-0100) and operational address are rendered as plain text in the footer.',
    'NPI Registry Validation: Validated in the National Provider Identifier database under In-Home Supportive Care and Homemaker taxonomy codes.'
  ];

  working.forEach((item) => {
    doc.fontSize(9).fillColor('#16a34a').text('✓ ', 40, y);
    doc.fillColor(textDark).text(item, 55, y, { width: 517 });
    y += doc.heightOfString(item, { width: 517 }) + 6;
  });

  y += 10;
  doc.fillColor(navy).fontSize(12).text('WHERE TO FOCUS', 40, y);
  doc.strokeColor(line).lineWidth(1).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
  y += 25;

  doc.fontSize(10).fillColor(blue).text('Quick wins', 40, y);
  y += 15;

  const quick = [
    'Standardize Name, Address, Phone (NAP) Across Directories: Your address varies between 230 Scherf Drive (Chamber) and 26091 Shoemaker Rd (NPI DB). Pick one primary address and standardize across all platforms.',
    'Embed Google Map on Website: Replace the plain text footer address on southerncomfortcare.com with an interactive Google Maps embed pointing to your primary location.',
    'Update Yahoo & MapQuest Data: Ensure business category labels match "In-Home Care / Senior Care" rather than general health services.'
  ];

  quick.forEach((item) => {
    doc.fontSize(9).fillColor(navy).text('• ', 40, y);
    doc.fillColor(textDark).text(item, 52, y, { width: 520 });
    y += doc.heightOfString(item, { width: 520 }) + 6;
  });

  y += 5;
  doc.fontSize(10).fillColor(blue).text('Ongoing efforts', 40, y);
  y += 15;

  const ongoing = [
    'Encourage Client Reviews: Encourage recent satisfied families to leave reviews on Google, Caring.com, and Yelp to increase trust metrics. Let them know it’s a great way to support your business.',
    'Publish Localized Service & FAQ Content: Create dedicated pages for service areas near Andalusia (e.g., Covington County, Opp, Florala) answering common questions like "Does Medicaid cover home care in Alabama?" to capture AI search queries.'
  ];

  ongoing.forEach((item) => {
    doc.fontSize(9).fillColor(navy).text('• ', 40, y);
    doc.fillColor(textDark).text(item, 52, y, { width: 520 });
    y += doc.heightOfString(item, { width: 520 }) + 6;
  });

  addFooter(1);

  // ================= PAGE 2 =================
  doc.addPage();
  addHeader(2);

  y = 105;
  doc.fillColor(navy).fontSize(13).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, y);
  y += 20;

  // Google Business Profile Section
  doc.fillColor(navy).fontSize(11).text('Google Business Profile (12/25 points)', 40, y);
  y += 15;

  const gbpChecks = [
    { check: 'Profile exists and is live', status: 'Pass', score: '5/5' },
    { check: 'Matches your website exactly', status: 'Partial', score: '2/4' },
    { check: 'Has plenty of photos (15+ showing)', status: 'Missing', score: '0/3' },
    { check: 'Hours filled in for the whole week', status: 'Pass', score: '2/2' },
    { check: 'Links to your website', status: 'Pass', score: '3/3' },
  ];

  gbpChecks.forEach((row) => {
    doc.fontSize(8.5).fillColor(textDark).text(row.check, 45, y, { width: 250 });
    doc.fillColor(row.status === 'Pass' ? '#16a34a' : '#dc2626').text(row.status, 300, y);
    doc.fillColor(textMuted).text(row.score, 400, y);
    y += 15;
  });

  y += 15;
  // Local Listings Section
  doc.fillColor(navy).fontSize(11).text('Local Listings (14/20 points)', 40, y);
  y += 15;

  const listingsChecks = [
    { check: 'Listed on Yelp and mainstream directories', status: '4 of 6 (2/3 pts)', details: 'Listed on Yelp, Facebook, MapQuest, Yahoo' },
    { check: 'Listed on senior-care lead-gen directories', status: '2 of 4 (4/8 pts)', details: 'Present on Caring.com and NPIDB' },
    { check: 'Same details on every listing (NAP)', status: 'Needs Fix (2/6 pts)', details: '230 Scherf Dr vs 26091 Shoemaker Rd' },
    { check: 'Listings say what kind of care you offer', status: 'Partial (3/3 pts)', details: 'In-home supportive care taxonomy active' },
    { check: 'No duplicate listings', status: 'Pass (3/3 pts)', details: 'No active duplicate listings found' },
  ];

  listingsChecks.forEach((row) => {
    doc.fontSize(8.5).fillColor(textDark).text(row.check, 45, y, { width: 220 });
    doc.fillColor(blue).text(row.status, 270, y, { width: 110 });
    doc.fillColor(textMuted).text(row.details, 390, y, { width: 180 });
    y += 20;
  });

  y += 15;
  // Website Location Signals Section
  doc.fillColor(navy).fontSize(11).text('Website Location Signals (13/25 points)', 40, y);
  y += 15;

  const webChecks = [
    { check: 'Page title says what town you are in', status: 'Pass (3/3 pts)', details: 'Includes Andalusia, AL region' },
    { check: 'Address and phone are real text', status: 'Pass (3/3 pts)', details: 'Crawlable HTML text in footer' },
    { check: 'Search summary names town and care', status: 'Pass (2/2 pts)', details: 'Meta description configured' },
    { check: 'Pages talk about your area', status: 'Pass (2/2 pts)', details: 'Andalusia area mentioned' },
    { check: 'A map is embedded on your site', status: 'Missing (0/2 pts)', details: 'Google Map embed missing' },
    { check: 'Loads quickly on phone', status: 'Pass (3/3 pts)', details: 'Fast load speed' },
    { check: 'Hidden code describes business type', status: 'Missing (0/4 pts)', details: 'Schema structured data missing' },
    { check: 'Dedicated pages for each community', status: 'Missing (0/2 pts)', details: 'Needs Opp/Florala sub-pages' },
  ];

  webChecks.forEach((row) => {
    doc.fontSize(8.5).fillColor(textDark).text(row.check, 45, y, { width: 220 });
    doc.fillColor(blue).text(row.status, 270, y, { width: 110 });
    doc.fillColor(textMuted).text(row.details, 390, y, { width: 180 });
    y += 18;
  });

  addFooter(2);

  // ================= PAGE 3 =================
  doc.addPage();
  addHeader(3);

  y = 105;
  // Reviews Section
  doc.fillColor(navy).fontSize(11).text('Reviews (8/15 points)', 40, y);
  y += 15;

  const reviewChecks = [
    { check: 'Google star rating', result: '3.8 Stars', score: '3/4' },
    { check: 'Enough reviews to look established', result: 'Under 20 Reviews', score: '2/3' },
    { check: 'Still getting new reviews', result: 'Needs fresh reviews', score: '1/3' },
    { check: 'Secondary platforms have reviews', result: 'Present on Caring.com/Yelp', score: '2/5' },
  ];

  reviewChecks.forEach((row) => {
    doc.fontSize(8.5).fillColor(textDark).text(row.check, 45, y, { width: 220 });
    doc.fillColor(blue).text(row.result, 270, y, { width: 150 });
    doc.fillColor(textMuted).text(row.score, 420, y);
    y += 18;
  });

  y += 20;
  // AI Search Visibility Section
  doc.fillColor(navy).fontSize(11).text('AI Search Visibility / LLM Visibility (5/15 points)', 40, y);
  y += 15;

  const aiChecks = [
    { check: 'One sentence says what you are and where', status: 'Pass', score: '2/2' },
    { check: 'Other websites talk about you', status: 'Pass (Chamber, portals)', score: '2/2' },
    { check: 'Website answers questions families ask', status: 'Answers 3 of 18 questions', score: '1/3' },
    { check: 'Site shows up in top AI responses', status: '0 of 6 responses', score: '0/8' },
  ];

  aiChecks.forEach((row) => {
    doc.fontSize(8.5).fillColor(textDark).text(row.check, 45, y, { width: 250 });
    doc.fillColor(blue).text(row.status, 300, y, { width: 150 });
    doc.fillColor(textMuted).text(row.score, 450, y);
    y += 18;
  });

  y += 25;
  doc.fontSize(9.5).fillColor(navy).text('Questions families near you are asking on AI searches that your site doesn\'t yet answer:', 40, y);
  y += 18;

  const questions = [
    'Does Alabama Medicaid or Elderly & Disabled Waiver cover in-home care?',
    'What public payer or VA options help fund home care in Covington County?',
    'What is the difference between non-medical home care and home health service?',
    'How quickly can a caregiver start service in Andalusia?'
  ];

  questions.forEach((q) => {
    doc.fontSize(8.5).fillColor(navy).text('• ', 50, y);
    doc.fillColor(textDark).text(q, 62, y, { width: 500 });
    y += 16;
  });

  addFooter(3);

  doc.end();
  console.log(`\n📄 Generated complete 3-page PDF report: ${filename}\n`);
}

buildFullReport();
