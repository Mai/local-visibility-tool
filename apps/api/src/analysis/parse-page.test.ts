import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePage } from './parse-page.js';

const RICH_PAGE = `<!doctype html>
<html>
  <head>
    <title>Sunrise Meadows | Assisted Living &amp; Memory Care in Marietta, GA</title>
    <meta name="description" content="Assisted living and memory care in Marietta, Georgia. Schedule a tour today." />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="canonical" href="https://sunrisemeadows.example/" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "AssistedLivingFacility",
          "name": "Sunrise Meadows Senior Living",
          "telephone": "(770) 555-0142",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "1420 N. Peachtree Rd",
            "addressLocality": "Marietta",
            "addressRegion": "GA",
            "postalCode": "30060-1234"
          }
        }
      ]
    }
    </script>
    <script type="application/ld+json">{ this is broken json }</script>
  </head>
  <body>
    <h1>Welcome to Sunrise Meadows</h1>
    <h2>Assisted Living</h2>
    <p>Our assisted living neighborhood in Marietta supports daily needs.</p>
    <h2>Memory Care</h2>
    <p>Specialized Alzheimer&rsquo;s care with a secured courtyard.</p>
    <h2>What does assisted living cost?</h2>
    <p>Call us at 770-555-0142 or visit 1420 N. Peachtree Rd, Suite 200, Marietta, GA 30060.</p>
    <a href="/contact">Contact Us</a>
    <a href="/memory-care/">Memory Care</a>
    <a href="https://facebook.com/sunrisemeadows">Facebook</a>
    <a href="/brochure.pdf">Brochure</a>
    <a href="tel:+17705550142">Call now</a>
    <iframe src="https://www.google.com/maps/embed?pb=abc"></iframe>
    <script>var trackingPhone = "999-999-9999";</script>
    <style>.hidden { display: none }</style>
  </body>
</html>`;

test('parses title, description and viewport', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.equal(page.title, 'Sunrise Meadows | Assisted Living & Memory Care in Marietta, GA');
  assert.match(page.metaDescription ?? '', /^Assisted living and memory care in Marietta/);
  assert.equal(page.hasViewportMeta, true);
  assert.equal(page.canonicalUrl, 'https://sunrisemeadows.example/');
});

test('collects headings with levels and flags question headings', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.deepEqual(page.headings[0], { level: 1, text: 'Welcome to Sunrise Meadows' });
  assert.deepEqual(
    page.headings.filter((heading) => heading.level === 2).map((heading) => heading.text),
    ['Assisted Living', 'Memory Care', 'What does assisted living cost?'],
  );
  assert.deepEqual(page.questionHeadings, ['What does assisted living cost?']);
});

test('script and style content is excluded from body text', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.ok(!page.bodyText.includes('trackingPhone'));
  assert.ok(!page.bodyText.includes('display: none'));
  // A phone number that only exists inside a <script> must not count as published.
  assert.ok(!page.phonesInText.includes('9999999999'));
});

test('extracts phone, street address and city/state/zip from text', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.deepEqual(page.phonesInText, ['7705550142']);
  assert.ok(page.addressesInText.some((address) => address.includes('1420 N. Peachtree Rd')));
  assert.deepEqual(page.localitiesInText, [{ city: 'Marietta', state: 'GA', zipCode: '30060' }]);
});

test('text either side of a line break does not run together', () => {
  // A plain contact page: no schema, and no whitespace between the blocks in the
  // source. Reading it naively yields "Us1420" and "30060Phone", which hides both
  // the address and the zip from their patterns.
  const page = parsePage({
    html: '<html><body><h1>Contact Us</h1><p>1420 Peachtree Road, Marietta, GA 30060</p><p>Phone: (770) 555-0142</p></body></html>',
    requestedUrl: 'https://sunrisemeadows.example/contact',
    roles: ['contact'],
    fetchedVia: 'http',
  });

  assert.deepEqual(page.phonesInText, ['7705550142']);
  assert.deepEqual(page.addressesInText, ['1420 Peachtree Road']);
  assert.deepEqual(page.localitiesInText, [{ city: 'Marietta', state: 'GA', zipCode: '30060' }]);
});

test('reads JSON-LD through @graph and counts broken blocks', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  const data = page.structuredData;
  assert.equal(data.hasSeniorCareType, true);
  assert.equal(data.hasLocalBusiness, false);
  assert.equal(data.businessName, 'Sunrise Meadows Senior Living');
  assert.equal(data.telephone, '(770) 555-0142');
  assert.deepEqual(data.postalAddress, {
    street: '1420 N. Peachtree Rd',
    city: 'Marietta',
    state: 'GA',
    zipCode: '30060',
  });
  assert.equal(data.invalidBlocks, 1);
});

test('detects an embedded Google Map', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.equal(page.hasEmbeddedMap, true);
  assert.equal(page.mapProvider, 'google');
});

test('internal links exclude other domains, files, tel and anchors', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.deepEqual(
    page.internalLinks.map((link) => link.url),
    ['https://sunrisemeadows.example/contact', 'https://sunrisemeadows.example/memory-care/'],
  );
});

test('detects care types from the whole page', () => {
  const page = parsePage({
    html: RICH_PAGE,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'playwright',
  });

  assert.deepEqual(page.careTypes.sort(), ['assisted_living', 'memory_care']);
});

test('a bare page yields empty findings rather than throwing', () => {
  const page = parsePage({
    html: '<html><body></body></html>',
    requestedUrl: 'https://empty.example/',
    roles: ['homepage'],
    fetchedVia: 'http',
    httpStatus: 200,
  });

  assert.equal(page.title, undefined);
  assert.equal(page.metaDescription, undefined);
  assert.equal(page.hasViewportMeta, false);
  assert.equal(page.hasEmbeddedMap, false);
  assert.deepEqual(page.headings, []);
  assert.deepEqual(page.phonesInText, []);
  assert.deepEqual(page.careTypes, []);
  assert.equal(page.structuredData.hasLocalBusiness, false);
  assert.equal(page.wordCount, 0);
});

test('a generic LocalBusiness is distinguished from a senior care type', () => {
  const page = parsePage({
    html: `<html><head><script type="application/ld+json">
      {"@type":"LocalBusiness","name":"Generic Co","address":{"@type":"PostalAddress","addressLocality":"Akron","addressRegion":"OH"}}
    </script></head><body><p>Hello</p></body></html>`,
    requestedUrl: 'https://generic.example/',
    roles: ['homepage'],
    fetchedVia: 'http',
  });

  assert.equal(page.structuredData.hasLocalBusiness, true);
  assert.equal(page.structuredData.hasSeniorCareType, false);
  assert.equal(page.structuredData.postalAddress?.city, 'Akron');
});

test('a licence number in front of the address is not part of the street', () => {
  const page = parsePage({
    html: `<html><body><p>License TN ACLF #500</p><p>6030 Cloverland Drive, Brentwood, TN 37027</p></body></html>`,
    requestedUrl: 'https://cloverlandparkseniorliving.com/',
    roles: ['homepage'],
    fetchedVia: 'http',
  });

  assert.deepEqual(page.addressesInText, ['6030 Cloverland Drive']);
  assert.deepEqual(page.localitiesInText, [{ city: 'Brentwood', state: 'TN', zipCode: '37027' }]);
});

test('prose next to a directory’s listing is not read as an address', () => {
  const page = parsePage({
    html: `<html><body><p>1010 Floor plans available Travel time Street</p><p>Open 24 Hours 1. Richland Place</p></body></html>`,
    requestedUrl: 'https://www.yellowpages.com/x',
    roles: ['directory_listing'],
    fetchedVia: 'http',
  });

  // Reported as the operator's address, either of these reads as an inconsistency
  // they should go and fix — on a page that never showed an address at all.
  assert.deepEqual(page.addressesInText, []);
});

test('text is kept block by block, so a menu never joins a headline', () => {
  const page = parsePage({
    html: `<html><body>
      <nav><a href="/tour">Take a Virtual Tour</a></nav>
      <div><p>Sunrise Meadows sets the stage for exceptional senior living in Marietta, GA.</p></div>
    </body></html>`,
    requestedUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    fetchedVia: 'http',
  });

  assert.deepEqual(page.textBlocks, [
    'Take a Virtual Tour',
    'Sunrise Meadows sets the stage for exceptional senior living in Marietta, GA.',
  ]);
  // bodyText still runs them together, which is why sentence-reading uses the blocks.
  assert.match(page.bodyText, /Take a Virtual Tour Sunrise Meadows/);
});

test('a line break inside a paragraph does not split it into blocks', () => {
  const page = parsePage({
    html: `<html><body><p>6030 Cloverland Drive<br>Brentwood, TN 37027</p></body></html>`,
    requestedUrl: 'https://cloverlandparkseniorliving.com/',
    roles: ['homepage'],
    fetchedVia: 'http',
  });

  assert.deepEqual(page.textBlocks, ['6030 Cloverland Drive Brentwood, TN 37027']);
});

test('a marketing banner starting with a question word is not a question', () => {
  const page = parsePage({
    html: `<html><body>
      <h2>WHAT MAKES US DIFFERENT AND BETTER</h2>
      <p>Our team has served Brentwood families for over twenty years with warmth and care.</p>
    </body></html>`,
    requestedUrl: 'https://cloverlandparkseniorliving.com/',
    roles: ['homepage'],
    fetchedVia: 'http',
  });

  // Advising an operator to "answer" a headline is advice they would rightly ignore.
  assert.deepEqual(page.questionSections, []);
  // The looser heading list still records it, for checks that only count phrasing.
  assert.deepEqual(page.questionHeadings, ['WHAT MAKES US DIFFERENT AND BETTER']);
});

test('an answer sitting outside the heading’s own wrapper is still found', () => {
  const page = parsePage({
    html: `<html><body>
      <section>
        <div class="heading-wrap"><h3>How much does assisted living cost?</h3></div>
        <div class="answer"><p>Assisted living at Sunrise Meadows starts at $3,900 a month, which covers the apartment, all three meals and personal care.</p></div>
      </section>
      <section><div><h3>Do you accept Medicaid?</h3></div><div><p>Not at this time.</p></div></section>
    </body></html>`,
    requestedUrl: 'https://sunrisemeadows.example/faq',
    roles: ['faq'],
    fetchedVia: 'http',
  });

  assert.deepEqual(
    page.questionSections.map((section) => section.question),
    ['How much does assisted living cost?', 'Do you accept Medicaid?'],
  );
  // Read from the sibling wrapper, and stopping before the next question.
  assert.equal(page.questionSections[0]?.answerWords, 20);
  assert.equal(page.questionSections[1]?.answerWords, 4);
});
