const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function buildPDF() {
  const doc = new PDFDocument({ margin: 40, autoFirstPage: true });
  const pdfPath = path.join(process.cwd(), 'encore_care_branded_report.pdf');
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  const cCyan = '#00aaff', cBlue = '#2d99fe', cLightBlue = '#c7f2ff', cDarkBlue = '#204f8d', cText = '#204f8d', cMuted = '#5a78a2', cLine = '#e1f4fd';

  // --- PAGE 1 ---
  doc.fillColor(cDarkBlue).fontSize(18).text('Sensi.AI', 40, 30);
  doc.fillColor(cBlue).fontSize(9).text('Local search & AI visibility', 380, 35, { align: 'right' });
  doc.strokeColor(cCyan).lineWidth(2).moveTo(40, 52).lineTo(572, 52).stroke();
  doc.fillColor(cDarkBlue).fontSize(16).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 62);
  doc.fillColor(cBlue).fontSize(12).text('ENCORE CARE', 40, 80);
  doc.fillColor(cMuted).fontSize(9).text('Cleveland, OH | September 16, 2026', 40, 96);

  doc.rect(40, 115, 532, 85).fillAndStroke(cLightBlue, cCyan);
  doc.lineWidth(6).strokeColor('#ffffff').circle(85, 157, 26).stroke();
  doc.lineWidth(6).strokeColor(cCyan).circle(85, 157, 26).stroke();
  doc.fillColor(cDarkBlue).fontSize(18).text('62', 75, 148);
  doc.fontSize(7).fillColor(cMuted).text('out of 100', 70, 168);
  doc.rect(63, 185, 44, 12).fill(cLightBlue);
  doc.fillColor(cDarkBlue).fontSize(7.5).text('Good', 73, 187);

  doc.fillColor(cText).fontSize(9.5).text('Your agency has a solid web presence and clear service offerings, including in-home personal care and family caregiver programs. However, missing local Google profile optimization, lack of embedded map signals, and inconsistent citation profiles restrict direct local phone volume.', 145, 130, { width: 410 });

  let y = 215;
  const metrics = [
    { label: 'Google Business Profile', score: '15 / 25', status: 'Needs attention' },
    { label: 'Local Listings', score: '11 / 20', status: 'Room to improve' },
    { label: 'Website Location Signals', score: '18 / 25', status: 'Room to improve' },
    { label: 'Reviews', score: '10 / 15', status: 'Room to improve' },
    { label: 'AI Search Visibility (LLM Visibility)', score: '8 / 15', status: 'Needs attention' },
  ];

  metrics.forEach((m) => {
    doc.fillColor(cText).fontSize(9.5).text(m.label, 40, y);
    doc.fillColor(cBlue).text('|  ' + m.score + '  |  ' + m.status, 230, y);
    doc.strokeColor(cLine).lineWidth(0.5).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
    y += 20;
  });

  y += 6;
  doc.fillColor(cDarkBlue).fontSize(11).text("WHAT'S ALREADY WORKING", 40, y);
  y += 15;
  ['NPI & State Registration: Validated NPI record (1154121697) for Encore In Home Health Services DBA Encore Care in Cleveland (44103).', 'Active Directory & Social Portals: Established profile presence on A Place for Mom and active Instagram engagement (encore_care).', 'Clear Scope & Care Options: Clear positioning around Medicaid waiver support, paid family caregiving, and non-emergency transport.'].forEach((s) => {
    doc.fillColor(cCyan).fontSize(10).text('✓ ', 40, y);
    doc.fillColor(cText).fontSize(8.5).text(s, 55, y, { width: 517 });
    y += 17;
  });

  y += 4;
  doc.fillColor(cDarkBlue).fontSize(11).text('WHERE TO FOCUS', 40, y);
  y += 15;
  doc.fillColor(cBlue).fontSize(10).text('Quick wins', 40, y);
  doc.fillColor(cMuted).fontSize(8.5).text('Small, one-off tasks you can knock out without much fuss.', 105, y + 1);
  y += 14;
  ['Claim & Optimize Mainstream Directories: Verify and claim missing listings on Bing Places, Apple Maps, and Yelp.', 'Standardize Euclid Ave Physical Address: Ensure physical address (7963 Euclid Ave, 44103) is identical across all registries.', 'Implement Local Business Schema Markup: Add HomeHealthService JSON-LD code to encorecare.org to enable accurate indexing.'].forEach((qw) => {
    doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
    doc.fillColor(cText).fontSize(8.5).text(qw, 60, y, { width: 512 });
    y += 17;
  });

  y += 3;
  doc.fillColor(cBlue).fontSize(10).text('Ongoing efforts', 40, y);
  doc.fillColor(cMuted).fontSize(8.5).text('Things worth building into a habit rather than a one-time fix.', 125, y + 1);
  y += 14;
  ['Highlight Cuyahoga County Service Areas: Expand specific sub-pages for surrounding communities (Shaker Heights, Lakewood, Parma).', 'Target Conversational Medicaid Waiver Queries: Add plain-language answers addressing paid family caregiving options in Ohio.', 'Capture Google Reviews: Establish a way to capture customer reviews to build Google star counts. At the same time, grow your presence and positive reviews on senior care directories.'].forEach((og) => {
    doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
    doc.fillColor(cText).fontSize(8.5).text(og, 60, y, { width: 512 });
    y += 20;
  });
  doc.fontSize(8).fillColor(cMuted).text('Encore Care Local Search & AI Visibility Report | Page 1 of 3', 40, 750, { align: 'center' });

  // --- PAGE 2 ---
  doc.addPage();
  doc.fillColor(cDarkBlue).fontSize(13).text('STRENGTHS TO BUILD ON', 40, 35);
  doc.strokeColor(cCyan).lineWidth(1).moveTo(40, 50).lineTo(572, 50).stroke();
  y = 56;
  ['State Registry Verification: Published registry records across NPI database platforms.', 'Crawlable Contact Details: Office phone numbers are rendered as plain text in page headers and footers.'].forEach((es) => {
    doc.fillColor(cCyan).fontSize(10).text('✓ ', 40, y);
    doc.fillColor(cText).fontSize(8.5).text(es, 55, y, { width: 517 });
    y += 15;
  });

  y += 8;
  doc.fillColor(cDarkBlue).fontSize(13).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, y);
  doc.strokeColor(cCyan).lineWidth(1).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
  y += 22;

  function renderTable(title, score, headers, rows, startY) {
    doc.fillColor(cDarkBlue).fontSize(10).text(title + ' (' + score + ')', 40, startY);
    let ty = startY + 14;
    const rowH = 15;
    doc.rect(40, ty, 532, rowH).fill(cLightBlue);
    doc.fillColor(cDarkBlue).fontSize(8);
    doc.text(headers[0], 48, ty + 3);
    doc.text(headers[1], 300, ty + 3);
    doc.text(headers[2], 420, ty + 3);
    ty += rowH;
    rows.forEach((r) => {
      doc.fillColor(cText).fontSize(8).text(r[0], 48, ty + 3, { width: 245 });
      doc.text(r[1], 300, ty + 3, { width: 110 });
      doc.text(r[2], 420, ty + 3, { width: 145 });
      ty += rowH;
      doc.strokeColor(cLine).lineWidth(0.5).moveTo(40, ty).lineTo(572, ty).stroke();
    });
    return ty + 10;
  }

  y = renderTable('Google Business Profile', '15/25 points', ['Check', 'Status', 'Score'], [['Profile exists and is live', 'Pass', '5 / 5'], ['Matches website name & URL', 'Pass', '4 / 4'], ['Profile photos uploaded (20+)', 'Needs Fix', '1 / 3'], ['Hours filled in for whole week', 'Pass', '2 / 2'], ['Direct website link set', 'Pass', '2 / 2'], ['Primary category & local description optimized', 'Needs Fix', '1 / 9']], y);
  y = renderTable('Local Listings', '11/20 points', ['Directory / Check', 'Status', 'Details'], [['Mainstream directories (Yelp, FB, Bing, Apple)', '2 of 4', 'Active social; missing Bing/Apple'], ['Senior care directories (A Place for Mom, Care portals)', '2 of 4', 'Listed on A Place for Mom & NPI databases'], ['Consistent Name, Address, Phone (NAP)', 'Partial', 'Address variance across databases'], ['No duplicate listings found', 'Pass', 'No duplicate entities detected']], y);
  y = renderTable('Website Location Signals', '18/25 points', ['Signal Check', 'Status', 'Notes'], [['Page title mentions target city/region', 'Pass', 'Targets Cleveland & Ohio region'], ['Phone & address are real crawlable text', 'Pass', 'Crawlable text present'], ['Meta description accurate', 'Pass', 'Accurately describes home care scope'], ['Page content mentions Cleveland & local area', 'Pass', 'Mentions Euclid Ave and Cleveland area'], ['Google Map embedded on site', 'Missing', 'No map embed on contact page'], ['Structured Schema markup active', 'Missing', 'Missing HomeHealthService schema']], y);
  doc.fontSize(8).fillColor(cMuted).text('Encore Care Local Search & AI Visibility Report | Page 2 of 3', 40, 750, { align: 'center' });

  // --- PAGE 3 ---
  doc.addPage();
  y = 35;
  y = renderTable('Reviews', '10/15 points', ['Metric', 'Result', 'Score'], [['Google star rating', '4.0+ Stars', '3 / 4'], ['Total review volume', 'Needs Growth', '1 / 3'], ['Recency of reviews', 'Within 90 days', '2 / 3'], ['Secondary review platforms', 'Present', '4 / 5']], y);

  doc.fillColor(cDarkBlue).fontSize(9.5).text('What families are saying (Sentiment Analysis):', 40, y);
  y += 12;
  ['Care Coordinator Support: Positive mentions regarding care coordinators and family guidance.', 'Review Generation: Needs higher volume of Google Reviews to maintain local competitive authority.'].forEach((st) => {
    doc.fillColor(cCyan).fontSize(8.5).text('• ', 50, y);
    doc.fillColor(cText).fontSize(8).text(st, 60, y);
    y += 14;
  });

  y += 8;
  y = renderTable('AI Search Visibility / LLM Visibility', '8/15 points', ['Check', 'Status', 'Score'], [['Clear one-sentence positioning statement', 'Pass', '2 / 2'], ['Mentions on external authoritative portals', 'Pass', '2 / 2'], ['Answers specific questions families ask online', 'Answers 6 of 18', '1.5 / 3'], ['Dedicated landing page for each care type', 'Partial', '1.5 / 2'], ['Ranking in top conversational AI responses', '1 of 6 responses', '1 / 6']], y);

  doc.fillColor(cDarkBlue).fontSize(9.5).text('Questions families near Cleveland, OH ask AI that your site does not clearly answer:', 40, y);
  y += 12;
  ['Does Encore Care accept Ohio Passport or MyCare Ohio Medicaid waivers?', 'What is the weekly hourly minimum visit requirements for home care in the Cleveland area?', 'What is the difference between home personal care and adult day program support at Encore Care?', 'How quickly can a caregiver be assigned after a hospital discharge in Cuyahoga County?'].forEach((q) => {
    doc.fillColor(cCyan).fontSize(8.5).text('• ', 50, y);
    doc.fillColor(cText).fontSize(8).text(q, 60, y, { width: 500 });
    y += 15;
  });

  y += 10;
  doc.rect(40, y, 532, 40).fillAndStroke(cLightBlue, cBlue);
  doc.fontSize(7).fillColor(cDarkBlue).text('Disclosure: Sensi cannot guarantee that following these guidelines will improve your local SEO or LLM visibility. The information in this report is compiled from publicly available search engine data and internal analytical tools.', 50, y + 8, { width: 512 });

  doc.fontSize(8).fillColor(cMuted).text('Encore Care Local Search & AI Visibility Report | Page 3 of 3', 40, 750, { align: 'center' });

  doc.end();

  stream.on('finish', () => {
    console.log('\nPDF compilation complete!');
  });
}

buildPDF();
