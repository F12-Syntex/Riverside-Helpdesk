import test from 'node:test';
import assert from 'node:assert/strict';
import { orderSlides } from '../rag/parsers/pptx.mjs';

// A deck where slide3.xml was deleted and the remaining parts reordered: the
// display order in presentation.xml no longer matches the filename numbers.
const PRESENTATION = `<?xml version="1.0"?><p:presentation xmlns:r="rel"><p:sldIdLst>
  <p:sldId id="256" r:id="rId2"/>
  <p:sldId id="257" r:id="rId4"/>
  <p:sldId id="258" r:id="rId3"/>
</p:sldIdLst></p:presentation>`;

const RELS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId2" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Target="slides/slide5.xml"/>
</Relationships>`;

const NAMES = ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide5.xml'];

test('slides are numbered by presentation display order, not filename', () => {
  const order = orderSlides(PRESENTATION, RELS, NAMES);
  assert.deepEqual(order, [
    { name: 'ppt/slides/slide1.xml', num: 1 },
    { name: 'ppt/slides/slide5.xml', num: 2 },
    { name: 'ppt/slides/slide2.xml', num: 3 },
  ]);
});

test('unparseable/missing metadata falls back to filename order, numbered by position', () => {
  const order = orderSlides('', '', ['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml']);
  assert.deepEqual(order, [
    { name: 'ppt/slides/slide2.xml', num: 1 },
    { name: 'ppt/slides/slide10.xml', num: 2 },
  ]);
});

test('a slide not referenced by the id list is still kept, appended in filename order', () => {
  const present = `<p:sldIdLst><p:sldId r:id="rId2"/></p:sldIdLst>`;
  const rels = `<Relationship Id="rId2" Target="slides/slide1.xml"/>`;
  const order = orderSlides(present, rels, ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']);
  assert.deepEqual(order, [
    { name: 'ppt/slides/slide1.xml', num: 1 },
    { name: 'ppt/slides/slide2.xml', num: 2 },
  ]);
});
