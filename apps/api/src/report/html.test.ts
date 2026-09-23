import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeHtml, html, raw, safeHref, sentenceList } from './html.js';

test('interpolated values are escaped', () => {
  // A community whose Google listing name contains markup is not a hypothetical; the
  // review quotes certainly will.
  const output = html`<p>${'Ivy & Oak <script>alert(1)</script>'}</p>`.value;

  assert.equal(output, '<p>Ivy &amp; Oak &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.ok(!output.includes('<script>'));
});

test('quotes are escaped so a value cannot break out of an attribute', () => {
  const output = html`<div title="${'" onload="alert(1)'}"></div>`.value;

  assert.ok(!output.includes('onload="'));
  assert.ok(output.includes('&quot;'));
});

test('raw and nested html are trusted, everything else is not', () => {
  const inner = html`<em>${'<b>'}</em>`;
  const output = html`<p>${inner}${raw('<br />')}</p>`.value;

  assert.equal(output, '<p><em>&lt;b&gt;</em><br /></p>');
});

test('arrays flatten and nullish values disappear', () => {
  const output = html`<ul>
    ${[1, 2].map((n) => html`<li>${n}</li>`)}${null}${undefined}${false}
  </ul>`.value;

  assert.ok(output.includes('<li>1</li><li>2</li>'));
  assert.ok(!output.includes('null'));
  assert.ok(!output.includes('undefined'));
  assert.ok(!output.includes('false'));
});

test('zero renders as zero, which is why guards are written length > 0', () => {
  // This is the JSX trap: `items.length && html`…`` would print a bare "0". Numbers are
  // content in this report, so the fix belongs at the call site, not in the renderer.
  assert.equal(html`<span>${0}</span>`.value, '<span>0</span>');
});

test('only web and contact links survive', () => {
  assert.equal(safeHref('https://example.com/a?b=c'), 'https://example.com/a?b=c');
  assert.equal(safeHref('tel:+16155550123'), 'tel:+16155550123');
  // A directory listing URL ends up in a file the operator emails to their owner.
  assert.equal(safeHref('javascript:alert(1)'), undefined);
  assert.equal(safeHref('data:text/html,<script>'), undefined);
  assert.equal(safeHref('not a url'), undefined);
  assert.equal(safeHref(undefined), undefined);
});

test('sentenceList drops the parts we do not have', () => {
  assert.equal(sentenceList(['4.4 stars', undefined, '28 reviews'], ', '), '4.4 stars, 28 reviews');
  assert.equal(sentenceList([undefined, false]), '');
});

test('escapeHtml leaves ordinary text alone', () => {
  assert.equal(escapeHtml('Memory care in Brentwood, TN'), 'Memory care in Brentwood, TN');
});
