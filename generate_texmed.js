const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument({ margin: 40, autoFirstPage: true });
const filename = 'tex_med_home_health_branded_report.pdf';
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
doc.fillColor(cBlue).fontSize(12).text('TEX MED HOME HEALTH', 40, 80);
doc.fillColor(cMuted).fontSize(9).text('Killeen, TX | September 16, 2026', 40, 96);

// Score Box & Vector Donut Chart
doc.rect(40, 115, 532, 85).fillAndStroke(cLightBlue, cCyan);

const cx = 85, cy = 157, r = 26;
doc.lineWidth(6).strokeColor('#ffffff').circle(cx, cy, r).stroke();
doc.lineWidth(6).strokeColor(cCyan).path('M 85 131 A 26 26 0 1 1 60 166').stroke(); // ~68% Arc

doc.fillColor(cDarkBlue).fontSize(18).text('68', 75, 148, { bold: true });
doc.fontSize(7).fillColor(cMuted).text('out of 100', 70, 168);

doc.rect(63, 185, 44, 12).fill(cLightBlue);
doc.fillColor(cDarkBlue).fontSize(7.5).text('Good', 73, 187, { bold: true });

doc.fillColor(cText).fontSize(9.5).text(
  'Your agency maintains strong directory authority across US News Health, CareAvailability, SeniorCare.com, and social channels. However, telephone number inconsistencies across your site variants, missing local schema markup, and unoptimized LLM conversational content limit direct conversion potential.',
  145, 130, { width: 410 }
);

let y = 215;
const metrics = [
  { label: 'Google Business Profile', score: '19 / 25', status: 'Room to improve' },
  { label: 'Local Listings', score: '14 / 20', status: 'Looking good' },
  { label: 'Website Location Signals', score: '18 / 25', status: 'Room to improve' },
  { label: 'Reviews', score: '10 / 15', status: 'Needs attention' },
  { label: 'AI Search Visibility (LLM Visibility)', score: '7 / 15', status: 'Needs attention' },
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
  'Extensive Directory Citation Footprint: Verified agency records on US News Health, CareAvailability, SeniorCare.com, and SeniorAdvice.',
  'Active Social Media Channels: Active Facebook page (choosetexmedhh) and Instagram profile (texmed_home_health) reinforcing brand presence.',
  'Dual License Service Capabilities: Clear specialization in skilled home health (Nursing, PT, OT, ST) alongside non-medical personal care.'
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
  'Consolidate Inconsistent Phone Numbers: Align telephone numbers (254-526-8188, 254-328-1975, 254-637-0185) across all web pages.',
  'Verify Address Formatting in 76541: Ensure 1711 E Central Texas Expressway Suite 309 is structured identically across directories.',
  'Add Local Business / Medical Schema: Implement HomeHealthService JSON-LD code specifying your Bell County service region.'
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
  'Publish Medicare & Insurance Information: Add explicit content explaining Medicare certification and private insurance handling.',
  'Build Dedicated Sub-Pages for Neighboring Cities: Create individual landing pages for key markets (Harker Heights, Temple, Belton).',
  'Capture Customer Reviews: Create a program to encourage post-care reviews on Google Maps and Yelp, so you can increase the number of positive reviews.'
];
ongoing.forEach((og) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(og, 60, y, { width: 512 });
  y += 18;
});

doc.fontSize(8).fillColor(cMuted).text('Tex Med Home Health Local Search & AI Visibility Report | Page 1 of 3', 40, 750, { align: 'center' });

// --- PAGE 2 ---
doc.addPage();
doc.fillColor(cDarkBlue).fontSize(13).text('STRENGTHS TO BUILD ON', 40, 35, { bold: true });
doc.strokeColor(cCyan).lineWidth(1).moveTo(40, 50).lineTo(572, 50).stroke();

y = 58;
const extraStrengths = [
  'Multi-Channel Social Footprint: Verified active profiles across Facebook, Instagram, and Yahoo Local.',
  'Crawlable Contact Details: Physical office address and telephone contact details are rendered in plain text.'
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
  '19/25 points',
  ['Check', 'Status', 'Score'],
  [
    ['Profile exists and is live', 'Pass', '5 / 5'],
    ['Matches website name & URL', 'Pass', '4 / 4'],
    ['Profile photos uploaded (20+)', 'Partial', '2 / 3'],
    ['Hours filled in for whole week', 'Pass', '2 / 2'],
    ['Direct website link set', 'Pass', '2 / 2'],
    ['Primary category & local description optimized', 'Needs Fix', '4 / 9']
  ],
  y
);

y = renderTable(
  'Local Listings',
  '14/20 points',
  ['Directory / Check', 'Status', 'Details'],
  [
    ['Mainstream directories (Yelp, FB, Yahoo, IG)', '3 of 4', 'Active on FB, IG, Yelp; missing Bing'],
    ['Senior care directories (US News, CareAvailability)', '4 of 4', 'Listed on US News, CareAvailability, SeniorCare'],
    ['Consistent Name, Address, Phone (NAP)', 'Needs Fix', 'Multiple phone numbers across databases'],
    ['No duplicate listings found', 'Pass', 'No duplicate entities detected']
  ],
  y
);

y = renderTable(
  'Website Location Signals',
  '18/25 points',
  ['Signal Check', 'Status', 'Notes'],
  [
    ['Page title mentions target city/region', 'Pass', 'Targets Killeen & Central TX'],
    ['Phone & address are real crawlable text', 'Pass', 'Crawlable text present'],
    ['Meta description accurate', 'Pass', 'Accurately describes services'],
    ['Page content mentions 76541 & local area', 'Pass', 'Mentions Bell County and Killeen'],
    ['Google Map embedded on site', 'Missing', 'No map embed on contact section'],
    ['Structured Schema markup active', 'Missing', 'Missing HomeHealthService schema']
  ],
  y
);

doc.fontSize(8).fillColor(cMuted).text('Tex Med Home Health Local Search & AI Visibility Report | Page 2 of 3', 40, 750, { align: 'center' });

// --- PAGE 3 ---
doc.addPage();
y = 35;
y = renderTable(
  'Reviews',
  '10/15 points',
  ['Metric', 'Result', 'Score'],
  [
    ['Google star rating', '4.5+ Stars', '4 / 4'],
    ['Total review volume', 'Needs Growth', '1 / 3'],
    ['Recency of reviews', 'Over 60 days', '1 / 3'],
    ['Secondary review platforms', 'Present', '4 / 5']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('What families are saying (Sentiment Analysis):', 40, y, { bold: true });
y += 14;
const sentiment = [
  'Clinical Excellence: Positive feedback regarding skilled nursing, physical therapy, and rehabilitation support.',
  'Caregiver Compassion: Praise for friendly home health aides and attentive patient assistance.'
];
sentiment.forEach((st) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(st, 60, y);
  y += 16;
});

y += 10;
y = renderTable(
  'AI Search Visibility / LLM Visibility',
  '7/15 points',
  ['Check', 'Status', 'Score'],
  [
    ['Clear one-sentence positioning statement', 'Pass', '2 / 2'],
    ['Mentions on external authoritative portals', 'Pass', '2 / 2'],
    ['Answers specific questions families ask online', 'Answers 5 of 18', '1 / 3'],
    ['Dedicated landing page for each care type', 'Partial', '1 / 2'],
    ['Ranking in top conversational AI responses', '1 of 6 responses', '1 / 6']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('Questions families near Killeen ask AI that your site does not yet answer:', 40, y, { bold: true });
y += 14;
const aiQuestions = [
  'Does Tex Med Home Health accept Medicare or Texas Medicaid for skilled in-home nursing?',
  'What is the weekly hourly minimum visit requirements for home care in the Killeen area?',
  'What is the difference between non-medical personal care and skilled home health services at Tex Med?',
  'How quickly can a skilled nurse or physical therapist be assigned to a client after a hospital discharge in Bell County?'
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

doc.fontSize(8).fillColor(cMuted).text('Tex Med Home Health Local Search & AI Visibility Report | Page 3 of 3', 40, 750, { align: 'center' });

doc.end();
console.log('Tex Med Home Health PDF generated successfully!');
