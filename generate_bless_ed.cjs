const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument({ margin: 40, autoFirstPage: true });
const filename = 'bless_ed_home_care_updated_report.pdf';
doc.pipe(fs.createWriteStream(filename));

const cCyan = '#00aaff';
const cBlue = '#2d99fe';
const cLightBlue = '#c7f2ff';
const cDarkBlue = '#204f8d';
const cText = '#204f8d';
const cMuted = '#5a78a2';
const cLine = '#e1f4fd';

// --- PAGE 1 ---
doc.fillColor(cDarkBlue).fontSize(18).text('Sensi.AI', 40, 30, { bold: true });
doc.fillColor(cBlue).fontSize(9).text('Local search & AI visibility', 380, 35, { align: 'right' });
doc.strokeColor(cCyan).lineWidth(2).moveTo(40, 52).lineTo(572, 52).stroke();

doc.fillColor(cDarkBlue).fontSize(16).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 62, { bold: true });
doc.fillColor(cBlue).fontSize(12).text('BLESS ED HOME CARE INC', 40, 80);
doc.fillColor(cMuted).fontSize(9).text('Mission, TX (Zip: 78572) | September 15, 2026', 40, 96);

doc.rect(40, 115, 532, 85).fillAndStroke(cLightBlue, cCyan);
const cx = 85, cy = 157, r = 26;
doc.lineWidth(6).strokeColor('#ffffff').circle(cx, cy, r).stroke();
doc.lineWidth(6).strokeColor(cCyan).path('M 85 131 A 26 26 0 1 1 59 160').stroke();

doc.fillColor(cDarkBlue).fontSize(18).text('49', 75, 148, { bold: true });
doc.fontSize(7).fillColor(cMuted).text('out of 100', 70, 168);

doc.rect(63, 185, 44, 12).fill(cLightBlue);
doc.fillColor(cDarkBlue).fontSize(7.5).text('Good', 73, 187, { bold: true });

doc.fillColor(cText).fontSize(9.5).text(
  'Your primary website URL (blessedhomecareinc.com) is non-functional, impacting your local organic rank. However, active profiles on Yahoo Local, MapQuest, CareAvailability, CareListings, Facebook, and NPI registries establish a solid listing foundation.',
  145, 130, { width: 410 }
);

let y = 215;
const metrics = [
  { label: 'Google Business Profile', score: '12 / 25', status: 'Needs attention' },
  { label: 'Local Listings', score: '11 / 20', status: 'Room to improve' },
  { label: 'Website Location Signals', score: '10 / 25', status: 'Needs attention' },
  { label: 'Reviews', score: '10 / 15', status: 'Room to improve' },
  { label: 'AI Search Visibility (LLM Visibility)', score: '6 / 15', status: 'Needs attention' },
];

metrics.forEach((m) => {
  doc.fillColor(cText).fontSize(9.5).text(m.label, 40, y, { bold: true });
  doc.fillColor(cBlue).text('|  ' + m.score + '  |  ' + m.status, 230, y);
  doc.strokeColor(cLine).lineWidth(0.5).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
  y += 20;
});

y += 8;
doc.fillColor(cDarkBlue).fontSize(11).text("WHAT'S ALREADY WORKING", 40, y, { bold: true });
y += 16;
const strengths = [
  'Broad Online Directory Footprint: Active listings across Yahoo Local, MapQuest, CareAvailability, CareListings, and Facebook.',
  'NPI & Official Registration: Verified legal entity status (NPI #1851650212) under BLESS-ED HOME CARE, INC. in Mission, TX.',
  'Crawlable Business Address: Physical office details (2700 E Griffin Pkwy, Mission, TX 78572) and phone exist in primary indexes.'
];
strengths.forEach((s) => {
  doc.fillColor(cCyan).fontSize(10).text('✓ ', 40, y);
  doc.fillColor(cText).fontSize(9).text(s, 55, y, { width: 517 });
  y += 18;
});

y += 6;
doc.fillColor(cDarkBlue).fontSize(11).text('WHERE TO FOCUS', 40, y, { bold: true });
y += 16;

doc.fillColor(cBlue).fontSize(10).text('Quick wins', 40, y, { bold: true });
doc.fillColor(cMuted).fontSize(8.5).text('Small, one-off tasks you can knock out without much fuss.', 105, y + 1);
y += 15;
const quickWins = [
  'Restore Primary Website Domain: Repair or re-host blessedhomecareinc.com with a valid SSL certificate so search engines can crawl your pages.',
  'Fix Missing Address Consistency: Ensure the office address in ZIP code 78572 matches identically across Google, Yahoo, MapQuest, CareAvailability, and NPI.',
  'Claim Google Business Profile: Claim and verify your Google listing in Mission, TX to control business hours and primary care category.'
];
quickWins.forEach((qw) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(qw, 60, y, { width: 512 });
  y += 18;
});

y += 4;
doc.fillColor(cBlue).fontSize(10).text('Ongoing efforts', 40, y, { bold: true });
doc.fillColor(cMuted).fontSize(8.5).text('Things worth building into a habit rather than a one-time fix.', 125, y + 1);
y += 15;
const ongoing = [
  'Publish Insurance & Medicaid Guidelines: Add explicit website copy addressing Texas Medicaid, PHC, and long-term care insurance handling.',
  'Build Hidalgo County Landing Pages: Create targeted service pages for surrounding areas in the Rio Grande Valley (McAllen, Edinburg, Pharr).',
  'Systematize Direct Google Reviews: Implement an automated post-care review process to build star ratings on Google Maps and Facebook.'
];
ongoing.forEach((og) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(og, 60, y, { width: 512 });
  y += 18;
});

doc.fontSize(8).fillColor(cMuted).text('Bless Ed Home Care Inc Local Search & AI Visibility Report | Page 1 of 3', 40, 750, { align: 'center' });

// --- PAGE 2 ---
doc.addPage();
doc.fillColor(cDarkBlue).fontSize(13).text('STRENGTHS TO BUILD ON', 40, 35, { bold: true });
doc.strokeColor(cCyan).lineWidth(1).moveTo(40, 50).lineTo(572, 50).stroke();

y = 58;
const extraStrengths = [
  'Multi-Directory Presence: Established citations on Yahoo Local, MapQuest, CareAvailability, and CareListings.',
  'Crawlable Phone & Address: Primary contact details exist in structured healthcare directories.'
];
extraStrengths.forEach((es) => {
  doc.fillColor(cCyan).fontSize(10).text('✓ ', 40, y);
  doc.fillColor(cText).fontSize(9).text(es, 55, y, { width: 517 });
  y += 16;
});

y += 10;
doc.fillColor(cDarkBlue).fontSize(13).text('DETAILED REPORT: EVERYTHING WE CHECKED', 40, y, { bold: true });
doc.strokeColor(cCyan).lineWidth(1).moveTo(40, y + 15).lineTo(572, y + 15).stroke();
y += 25;

function renderTable(title, score, headers, rows, startY) {
  doc.fillColor(cDarkBlue).fontSize(11).text(title + ' (' + score + ')', 40, startY, { bold: true });
  let ty = startY + 16;

  doc.rect(40, ty, 532, 18).fill(cLightBlue);
  doc.fillColor(cDarkBlue).fontSize(8.5);
  doc.text(headers[0], 48, ty + 4, { bold: true });
  doc.text(headers[1], 300, ty + 4, { bold: true });
  doc.text(headers[2], 420, ty + 4, { bold: true });
  ty += 18;

  rows.forEach((r) => {
    doc.fillColor(cText).fontSize(8.5).text(r[0], 48, ty + 4, { width: 245 });
    doc.text(r[1], 300, ty + 4, { width: 110 });
    doc.text(r[2], 420, ty + 4, { width: 145 });
    ty += 18;
    doc.strokeColor(cLine).lineWidth(0.5).moveTo(40, ty).lineTo(572, ty).stroke();
  });

  return ty + 12;
}

y = renderTable(
  'Google Business Profile',
  '12/25 points',
  ['Check', 'Status', 'Score'],
  [
    ['Profile exists and is live', 'Partial', '3 / 5'],
    ['Matches website name & URL', 'Needs Fix', '1 / 4'],
    ['Profile photos uploaded (20+)', 'Needs Fix', '1 / 3'],
    ['Hours filled in for whole week', 'Pass', '2 / 2'],
    ['Direct website link set', 'Needs Fix', '1 / 2'],
    ['Primary category & local description optimized', 'Needs Fix', '4 / 9']
  ],
  y
);

y = renderTable(
  'Local Listings',
  '11/20 points',
  ['Directory / Check', 'Status', 'Details'],
  [
    ['Mainstream directories (FB, Yahoo, MapQuest)', '3 of 4', 'Listed on FB, Yahoo Local, MapQuest; missing Bing/Apple'],
    ['Senior care directories (CareListings, CareAvailability)', '2 of 4', 'Active on CareListings & CareAvailability'],
    ['Consistent Name, Address, Phone (NAP)', 'Partial', 'Minor Suite A/B/D variance across databases'],
    ['No duplicate listings found', 'Pass', 'No duplicate entities detected']
  ],
  y
);

y = renderTable(
  'Website Location Signals',
  '10/25 points',
  ['Signal Check', 'Status', 'Notes'],
  [
    ['Page title mentions target city/region', 'Missing', 'Domain offline (blessedhomecareinc.com)'],
    ['Phone & address are real crawlable text', 'Pass', 'Address/Phone readable on directory listings'],
    ['Meta description accurate', 'Missing', 'Unreachable site meta tags'],
    ['Page content mentions 78572 & local area', 'Pass', 'Verified Mission, TX location data'],
    ['Google Map embedded on site', 'Missing', 'No map embed active'],
    ['Structured Schema markup active', 'Missing', 'Missing HomeHealthService schema']
  ],
  y
);

doc.fontSize(8).fillColor(cMuted).text('Bless Ed Home Care Inc Local Search & AI Visibility Report | Page 2 of 3', 40, 750, { align: 'center' });

// --- PAGE 3 ---
doc.addPage();
y = 35;
y = renderTable(
  'Reviews',
  '10/15 points',
  ['Metric', 'Result', 'Score'],
  [
    ['Google star rating', 'Unrated / Few', '2 / 4'],
    ['Total review volume', 'Needs Growth', '1 / 3'],
    ['Recency of reviews', 'Over 90 days', '2 / 3'],
    ['Secondary review platforms', 'Present', '5 / 5']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('What families are saying (Sentiment Analysis):', 40, y, { bold: true });
y += 14;
const sentiment = [
  'Caregiver Assistance: Positive references regarding personal care attendant services.',
  'Office Communication: Direct inquiry paths rely on phone and directory forms due to offline domain.'
];
sentiment.forEach((st) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(st, 60, y);
  y += 16;
});

y += 10;
y = renderTable(
  'AI Search Visibility / LLM Visibility',
  '6/15 points',
  ['Check', 'Status', 'Score'],
  [
    ['Clear one-sentence positioning statement', 'Pass', '2 / 2'],
    ['Mentions on external authoritative portals', 'Pass', '2 / 2'],
    ['Answers specific questions families ask online', 'Answers 3 of 18', '0.5 / 3'],
    ['Dedicated landing page for each care type', 'Missing', '0 / 2'],
    ['Ranking in top conversational AI responses', '1 of 6 responses', '1.5 / 6']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('Questions families near 78572 ask AI that your web presence does not yet answer:', 40, y, { bold: true });
y += 14;
const aiQuestions = [
  'Does Bless Ed Home Care Inc accept Texas Medicaid, STAR+PLUS, or Primary Home Care (PHC) programs?',
  'What is the weekly hourly minimum visit requirements for home care in the Mission / McAllen area?',
  'What personal care attendant services are provided by Bless Ed Home Care Inc in Hidalgo County?',
  'How quickly can home care service begin for a patient being discharged from a hospital in Mission, TX?'
];
aiQuestions.forEach((q) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(q, 60, y, { width: 512 });
  y += 18;
});

y += 15;
doc.rect(40, y, 532, 45).fillAndStroke(cLightBlue, cBlue);
doc.fontSize(7.5).fillColor(cDarkBlue).text(
  'Disclosure: Sensi cannot guarantee that following these guidelines will improve your local SEO or LLM visibility. The information in this report is compiled from publicly available search engine data and internal analytical tools.',
  50, y + 10, { width: 512 }
);

doc.fontSize(8).fillColor(cMuted).text('Bless Ed Home Care Inc Local Search & AI Visibility Report | Page 3 of 3', 40, 750, { align: 'center' });

doc.end();
console.log('PDF generated successfully!');
