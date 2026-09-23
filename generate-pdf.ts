import fs from 'fs';
import PDFDocument from 'pdfkit';

function createSouthernComfortPDF() {
  const doc = new PDFDocument({ margin: 40 });
  const filename = 'Southern_Comfort_Visibility_Report.pdf';
  doc.pipe(fs.createWriteStream(filename));

  const primaryColor = '#0f172a';
  const mutedColor = '#64748b';
  const lineColor = '#cbd5e1';

  // --- HEADER SECTION ---
  doc.rect(0, 0, 612, 110).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(20).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 25, { bold: true } as any);
  doc.fontSize(14).fillColor('#38bdf8').text('SOUTHERN COMFORT IN-HOME CARE, INC.', 40, 52);
  doc.fontSize(10).fillColor('#94a3b8').text('Andalusia, AL | September 17, 2026', 40, 75);

  let currentY = 125;

  // --- SCORE HERO ---
  doc.fillColor(primaryColor).fontSize(14).text('Local search & AI visibility: 52 / 100', 40, currentY);
  currentY += 20;
  doc.fontSize(9.5).fillColor('#334155').text(
    'You have a recognizable local presence across multiple healthcare and regional directories, but missing website optimization and inconsistent listing data hold back your AI and local map search.',
    40,
    currentY,
    { width: 532 }
  );
  currentY += 35;

  // --- BREAKDOWN TABLE ---
  doc.fillColor(primaryColor).fontSize(12).text('Breakdown by Area', 40, currentY);
  doc.strokeColor(lineColor).lineWidth(1).moveTo(40, currentY + 15).lineTo(572, currentY + 15).stroke();
  currentY += 25;

  const breakdown = [
    { label: 'Google Business Profile', score: '12/25', status: 'Needs attention' },
    { label: 'Local Listings', score: '14/20', status: 'Room to improve' },
    { label: 'Website Location Signals', score: '13/25', status: 'Needs attention' },
    { label: 'Reviews', score: '8/15', status: 'Needs attention' },
    { label: 'AI Search Visibility (LLM Visibility)', score: '5/15', status: 'Needs attention' },
  ];

  breakdown.forEach((item) => {
    doc.fontSize(9.5).fillColor('#0f172a').text(`• ${item.label}:`, 50, currentY);
    doc.fillColor('#2563eb').text(` ${item.score}`, 220, currentY);
    doc.fillColor(mutedColor).text(` | ${item.status}`, 265, currentY);
    currentY += 16;
  });

  currentY += 15;

  // --- WHAT'S WORKING ---
  doc.fillColor(primaryColor).fontSize(12).text("WHAT'S ALREADY WORKING", 40, currentY);
  doc.strokeColor(lineColor).lineWidth(1).moveTo(40, currentY + 15).lineTo(572, currentY + 15).stroke();
  currentY += 25;

  const working = [
    'Multi-Directory Footprint: Listed on key senior care aggregators like Caring.com alongside major local directories like Yelp, Yahoo Local, MapQuest, and the Andalusia Area Chamber of Commerce.',
    'Crawlable Contact Details: Contact phone number (334-222-0100) and operational address are rendered as plain text in the footer.',
    'NPI Registry Validation: Validated in the National Provider Identifier database under In-Home Supportive Care and Homemaker taxonomy codes.'
  ];

  working.forEach((item) => {
    doc.fontSize(9).fillColor('#16a34a').text('✓ ', 40, currentY);
    doc.fillColor('#334155').text(item, 55, currentY, { width: 517 });
    currentY += doc.heightOfString(item, { width: 517 }) + 6;
  });

  currentY += 10;

  // --- WHERE TO FOCUS ---
  doc.fillColor(primaryColor).fontSize(12).text('WHERE TO FOCUS', 40, currentY);
  doc.strokeColor(lineColor).lineWidth(1).moveTo(40, currentY + 15).lineTo(572, currentY + 15).stroke();
  currentY += 25;

  doc.fontSize(10).fillColor('#2563eb').text('Quick Wins', 40, currentY);
  currentY += 15;

  const quickWins = [
    'Standardize Name, Address, Phone (NAP) Across Directories: Your address varies between 230 Scherf Drive (Chamber) and 26091 Shoemaker Rd (NPI DB). Pick one primary address and standardize across all platforms.',
    'Embed Google Map on Website: Replace the plain text footer address on southerncomfortcare.com with an interactive Google Maps embed pointing to your primary location.',
    'Update Yahoo & MapQuest Data: Ensure business category labels match "In-Home Care / Senior Care" rather than general health services.'
  ];

  quickWins.forEach((item) => {
    doc.fontSize(9).fillColor('#0f172a').text('• ', 50, currentY);
    doc.fillColor('#334155').text(item, 62, currentY, { width: 510 });
    currentY += doc.heightOfString(item, { width: 510 }) + 6;
  });

  currentY += 10;
  doc.fontSize(10).fillColor('#2563eb').text('Ongoing Efforts', 40, currentY);
  currentY += 15;

  const ongoing = [
    'Encourage Client Reviews: Encourage recent satisfied families to leave reviews on Google, Caring.com, and Yelp to increase trust metrics. Let them know it’s a great way to support your business.',
    'Publish Localized Service & FAQ Content: Create dedicated pages for service areas near Andalusia (e.g., Covington County, Opp, Florala) answering common questions like "Does Medicaid cover home care in Alabama?" to capture AI search queries.'
  ];

  ongoing.forEach((item) => {
    doc.fontSize(9).fillColor('#0f172a').text('• ', 50, currentY);
    doc.fillColor('#334155').text(item, 62, currentY, { width: 510 });
    currentY += doc.heightOfString(item, { width: 510 }) + 6;
  });

  doc.end();
  console.log(`\n📄 Successfully generated PDF: ${filename}\n`);
}

createSouthernComfortPDF();
