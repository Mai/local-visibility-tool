const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument({ margin: 40, autoFirstPage: true });
const filename = 'senior_home_share_branded_report.pdf';
doc.pipe(fs.createWriteStream(filename));

// Brand Palette
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
doc.fillColor(cBlue).fontSize(12).text('SENIOR HOME SHARE', 40, 80);
doc.fillColor(cMuted).fontSize(9).text('Galax, VA | September 16, 2026', 40, 96);

// Score Box & Donut Chart
doc.rect(40, 115, 532, 85).fillAndStroke(cLightBlue, cCyan);

const cx = 85, cy = 157, r = 26;
doc.lineWidth(6).strokeColor('#ffffff').circle(cx, cy, r).stroke();
doc.lineWidth(6).strokeColor(cCyan).path('M 85 131 A 26 26 0 1 1 59 157').stroke(); // ~68% Arc

doc.fillColor(cDarkBlue).fontSize(18).text('68', 75, 148, { bold: true });
doc.fontSize(7).fillColor(cMuted).text('out of 100', 70, 168);

doc.rect(63, 185, 44, 12).fill(cLightBlue);
doc.fillColor(cDarkBlue).fontSize(7.5).text('Good', 73, 187, { bold: true });

doc.fillColor(cText).fontSize(9.5).text(
  'You have an established regional presence across Virginia directories and senior care portals. Addressing your Google Business Profile photo volume and structured schema markup will help solidify top local map rankings in Southwest Virginia.',
  145, 130, { width: 410 }
);

let y = 215;
const metrics = [
  { label: 'Google Business Profile', score: '19 / 25', status: 'Looking good' },
  { label: 'Local Listings', score: '15 / 20', status: 'Looking good' },
  { label: 'Website Location Signals', score: '18 / 25', status: 'Looking good' },
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
  'Strong Multi-Directory Citations: Active profiles identified on Facebook, A Place for Mom, Yelp, Virginia Navigator, and HCAOA.',
  'Multi-Location Clarity: Website explicitly breaks out Galax (106 Calhoun St) and Wytheville offices with plain-text phone numbers.',
  'Active Social & Portal Engagement: Verified Facebook presence (/seniorhomeshare.galax/) reinforcing local community involvement.'
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
  'Upload Additional Profile Photos: Expand Google Business Profile photo gallery past 20 images.',
  'Add LocalBusiness Schema Code: Implement HomeHealthService JSON-LD code to help search crawlers index both offices.',
  'Embed Interactive Google Maps: Add embedded Google Maps for the Calhoun St office on your location page.'
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
  'Answer AI Payment & Insurance Queries: Add a dedicated website page outlining accepted payment options (Virginia Medicaid waivers).',
  'Target Surrounding Zip Codes: Publish specific sub-pages targeting nearby Southwest Virginia towns (Hillsville, Independence).',
  'Capture Customer Reviews: Create a program to encourage post-care reviews on Google Maps and A Place for Mom, so you can increase the number of client reviews.'
];
ongoing.forEach((og) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(og, 60, y, { width: 512 });
  y += 18;
});

doc.fontSize(8).fillColor(cMuted).text('Senior Home Share Local Search & AI Visibility Report | Page 1 of 3', 40, 750, { align: 'center' });

// --- PAGE 2 ---
doc.addPage();
doc.fillColor(cDarkBlue).fontSize(13).text('STRENGTHS TO BUILD ON', 40, 35, { bold: true });
doc.strokeColor(cCyan).lineWidth(1).moveTo(40, 50).lineTo(572, 50).stroke();

y = 58;
const extraStrengths = [
  'Broad Portal Coverage: Strong citations across Virginia Navigator, HCAOA, and A Place for Mom.',
  'Crawlable Location Data: Direct address and phone details published as indexable HTML text.'
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
    ['Primary category & local description optimized', 'Partial', '4 / 9']
  ],
  y
);

y = renderTable(
  'Local Listings',
  '15/20 points',
  ['Directory / Check', 'Status', 'Details'],
  [
    ['Mainstream directories (Yelp, FB, Bing, Apple)', '3 of 4', 'Listed on FB & Yelp; missing Apple Maps'],
    ['Senior care directories (APFM, Va Navigator, HCAOA)', '3 of 4', 'Listed on APFM, HCAOA, Va Navigator'],
    ['Consistent Name, Address, Phone (NAP)', 'Pass', 'Uniform phone & address across databases'],
    ['No duplicate listings found', 'Pass', 'No duplicate listings detected']
  ],
  y
);

y = renderTable(
  'Website Location Signals',
  '18/25 points',
  ['Signal Check', 'Status', 'Notes'],
  [
    ['Page title mentions target city/region', 'Pass', 'Targets Galax & Wytheville'],
    ['Phone & address are real crawlable text', 'Pass', 'Crawlable text present'],
    ['Meta description accurate', 'Pass', 'Defines local home care solutions'],
    ['Page content mentions 24333 & local area', 'Pass', 'Mentions Galax and Twin County area'],
    ['Google Map embedded on site', 'Missing', 'No map embed on contact page'],
    ['Structured Schema markup active', 'Missing', 'Missing HomeHealthService schema']
  ],
  y
);

doc.fontSize(8).fillColor(cMuted).text('Senior Home Share Local Search & AI Visibility Report | Page 2 of 3', 40, 750, { align: 'center' });

// --- PAGE 3 ---
doc.addPage();
y = 35;
y = renderTable(
  'Reviews',
  '10/15 points',
  ['Metric', 'Result', 'Score'],
  [
    ['Google star rating', '4.0+ Stars', '3 / 4'],
    ['Total review volume', 'Needs Growth', '1 / 3'],
    ['Recency of reviews', 'Over 90 days', '1 / 3'],
    ['Secondary review platforms (APFM/Yelp)', 'Present', '5 / 5']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('What families are saying (Sentiment Analysis):', 40, y, { bold: true });
y += 14;
const sentiment = [
  'Caregiver Quality: Positive feedback praising caregiver compassion and personal care support.',
  'Local Trust: Highly valued local presence across the Twin County region.'
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
    ['Answers specific questions families ask online', 'Answers 4 of 18', '1 / 3'],
    ['Dedicated landing page for each care type', 'Partial', '1 / 2'],
    ['Ranking in top conversational AI responses', '0 of 6 responses', '0 / 6']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('Questions families near 24333 ask AI that your site does not yet answer:', 40, y, { bold: true });
y += 14;
const aiQuestions = [
  'Does Senior Home Share accept Virginia Medicaid CCC Plus waivers or Long-Term Care Insurance?',
  'What is the weekly hourly minimum visit requirements for home care in Galax, VA?',
  'What is the difference between personal care and companionship care offered by Senior Home Share?',
  'How quickly can care services start after an intake call in Carroll or Grayson County?'
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

doc.fontSize(8).fillColor(cMuted).text('Senior Home Share Local Search & AI Visibility Report | Page 3 of 3', 40, 750, { align: 'center' });

doc.end();
console.log('Senior Home Share PDF updated successfully!');
