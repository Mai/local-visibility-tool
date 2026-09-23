const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument({ margin: 40, autoFirstPage: true });
const filename = 'oasis_in_home_care_branded_report.pdf';
doc.pipe(fs.createWriteStream(filename));

const cCyan = '#00aaff';
const cBlue = '#2d99fe';
const cLightBlue = '#c7f2ff';
const cDarkBlue = '#204f8d';
const cText = '#204f8d';
const cMuted = '#5a78a2';
const cLine = '#e1f4fd';

// PAGE 1
doc.fillColor(cDarkBlue).fontSize(18).text('Sensi.AI', 40, 30, { bold: true });
doc.fillColor(cBlue).fontSize(9).text('Local search & AI visibility', 380, 35, { align: 'right' });
doc.strokeColor(cCyan).lineWidth(2).moveTo(40, 52).lineTo(572, 52).stroke();

doc.fillColor(cDarkBlue).fontSize(16).text('LOCAL SEARCH & AI VISIBILITY REPORT', 40, 62, { bold: true });
doc.fillColor(cBlue).fontSize(12).text('OASIS IN-HOME CARE', 40, 80);
doc.fillColor(cMuted).fontSize(9).text('Goldsboro, NC | September 16, 2026', 40, 96);

doc.rect(40, 115, 532, 85).fillAndStroke(cLightBlue, cCyan);
const cx = 85, cy = 157, r = 26;
doc.lineWidth(6).strokeColor('#ffffff').circle(cx, cy, r).stroke();
doc.lineWidth(6).strokeColor(cCyan).path('M 85 131 A 26 26 0 1 1 60 178').stroke();

doc.fillColor(cDarkBlue).fontSize(18).text('78', 75, 148, { bold: true });
doc.fontSize(7).fillColor(cMuted).text('out of 100', 70, 168);
doc.rect(63, 185, 44, 12).fill(cLightBlue);
doc.fillColor(cDarkBlue).fontSize(7.5).text('Good', 73, 187, { bold: true });

doc.fillColor(cText).fontSize(9.5).text(
  'Oasis In-Home Care maintains a well-distributed local digital footprint across major social and senior directory portals. Strengthening page-level local keyword optimization, standardizing physical address updates, and deploying local schema markup will elevate search performance.',
  145, 128, { width: 410 }
);

let y = 215;
const metrics = [
  { label: 'Google Business Profile', score: '22 / 25', status: 'Looking good' },
  { label: 'Local Listings', score: '16 / 20', status: 'Looking good' },
  { label: 'Website Location Signals', score: '19 / 25', status: 'Room to improve' },
  { label: 'Reviews', score: '12 / 15', status: 'Looking good' },
  { label: 'AI Search Visibility (LLM Visibility)', score: '9 / 15', status: 'Room to improve' },
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
  'Extensive Directory Coverage: Active profiles across Facebook, Instagram, Yelp, Care.com, A Place for Mom, and CareListings.',
  'Dedicated Referral Channels: Clear contact pathways for VA, Medicaid, and private care referrals published on site.',
  'Responsive Multi-Page Structure: Dedicated sub-pages detailing Daily Living Support, Personal Assistance, and Social Care.'
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
  'Standardize Office Address: Ensure current physical address is uniform across all online directories.',
  'Embed Google Map on Contact Page: Add an interactive Google Maps embed to the primary contact page.',
  'Implement Local Business Schema Markup: Add HomeHealthService JSON-LD code to enable accurate search engine indexing.'
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
  'Optimize Content for Conversational AI: Create an explicit FAQ covering Medicaid, VA Aid & Attendance, and hourly care minimums.',
  'Build Targeted Regional Landing Pages: Publish landing pages for surrounding local service areas.',
  'Systematize Direct Google Reviews: Establish an automated review generation system to build ongoing Google Maps feedback.'
];
ongoing.forEach((og) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(og, 60, y, { width: 512 });
  y += 18;
});

doc.fontSize(8).fillColor(cMuted).text('Oasis In-Home Care Local Search & AI Visibility Report | Page 1 of 3', 40, 750, { align: 'center' });

// PAGE 2
doc.addPage();
doc.fillColor(cDarkBlue).fontSize(13).text('STRENGTHS TO BUILD ON', 40, 35, { bold: true });
doc.strokeColor(cCyan).lineWidth(1).moveTo(40, 50).lineTo(572, 50).stroke();

y = 58;
const extraStrengths = [
  'Cross-Platform Listing Integrity: Active presence across major social media and care portals.',
  'Crawlable Contact Pathways: Direct phone, email, and referral contact information rendered as plain HTML text.'
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
  '22/25 points',
  ['Check', 'Status', 'Score'],
  [
    ['Profile exists and is live', 'Pass', '5 / 5'],
    ['Matches website name & URL', 'Pass', '4 / 4'],
    ['Profile photos uploaded (20+)', 'Pass', '3 / 3'],
    ['Hours filled in for whole week', 'Pass', '2 / 2'],
    ['Direct website link set', 'Pass', '2 / 2'],
    ['Primary category & local description optimized', 'Partial', '6 / 9']
  ],
  y
);

y = renderTable(
  'Local Listings',
  '16/20 points',
  ['Directory / Check', 'Status', 'Details'],
  [
    ['Mainstream directories (Yelp, FB, Insta)', '4 of 4', 'Listed on FB, Instagram, and Yelp'],
    ['Senior care directories (Care.com, APFM)', '3 of 4', 'Listed on Care.com, APFM, and CareListings'],
    ['Consistent Name, Address, Phone (NAP)', 'Partial', 'Minor address variance between office locations'],
    ['No duplicate listings found', 'Pass', 'No duplicate listings found']
  ],
  y
);

y = renderTable(
  'Website Location Signals',
  '19/25 points',
  ['Signal Check', 'Status', 'Notes'],
  [
    ['Page title mentions target city/region', 'Pass', 'Targets primary service area'],
    ['Phone & address are real crawlable text', 'Pass', 'Crawlable text present'],
    ['Meta description accurate', 'Pass', 'Accurate in-home care descriptions'],
    ['Page content mentions local service area', 'Pass', 'Mentions local service radius'],
    ['Google Map embedded on site', 'Missing', 'No map embed on contact page'],
    ['Structured Schema markup active', 'Missing', 'Missing HomeHealthService schema']
  ],
  y
);

doc.fontSize(8).fillColor(cMuted).text('Oasis In-Home Care Local Search & AI Visibility Report | Page 2 of 3', 40, 750, { align: 'center' });

// PAGE 3
doc.addPage();
y = 35;
y = renderTable(
  'Reviews',
  '12/15 points',
  ['Metric', 'Result', 'Score'],
  [
    ['Google star rating', '4.0+ Stars', '3 / 4'],
    ['Total review volume', 'Established', '2 / 3'],
    ['Recency of reviews', 'Recent', '3 / 3'],
    ['Secondary review platforms (Care.com/Birdeye)', 'Present', '4 / 5']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('What families are saying (Sentiment Analysis):', 40, y, { bold: true });
y += 14;
const sentiment = [
  'Compassion & Office Support: High praise for office staff responsiveness and caregiver empathy.',
  'Reliability: Strong client mentions of long-term caregiver relationships.'
];
sentiment.forEach((st) => {
  doc.fillColor(cCyan).fontSize(9).text('• ', 50, y);
  doc.fillColor(cText).fontSize(8.5).text(st, 60, y);
  y += 16;
});

y += 10;
y = renderTable(
  'AI Search Visibility / LLM Visibility',
  '9/15 points',
  ['Check', 'Status', 'Score'],
  [
    ['Clear one-sentence positioning statement', 'Pass', '2 / 2'],
    ['Mentions on external authoritative portals', 'Pass', '2 / 2'],
    ['Answers specific questions families ask online', 'Answers 7 of 18', '1.5 / 3'],
    ['Dedicated landing page for each care type', 'Pass', '2 / 2'],
    ['Ranking in top conversational AI responses', '1 of 6 responses', '1.5 / 6']
  ],
  y
);

doc.fillColor(cDarkBlue).fontSize(10).text('Questions families ask AI that your site does not yet answer:', 40, y, { bold: true });
y += 14;
const aiQuestions = [
  'Does Oasis In-Home Care accept Medicaid or VA Community Care referrals?',
  'What is the weekly hourly minimum visit requirements for home care in the area?',
  'What is the difference between daily living support and personal assistance care at Oasis?',
  'How quickly can home care services begin after a patient is discharged from a hospital or emergency room?'
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

doc.fontSize(8).fillColor(cMuted).text('Oasis In-Home Care Local Search & AI Visibility Report | Page 3 of 3', 40, 750, { align: 'center' });

doc.end();
console.log('PDF generated successfully!');
