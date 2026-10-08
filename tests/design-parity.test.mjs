import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceTemplate} from '../src/components/ReferenceTemplate.mjs';
import {referenceProcess} from '../src/components/ReferenceProcess.mjs';
import {referenceCSS} from '../src/components/ReferenceStyle.mjs';

test('preserve provided hero, farm frame, prototype architecture, and green-cream visual tokens',()=>{
 assert.match(referenceTemplate,/data-reference-portal="monitor"/);
 assert.match(referenceTemplate,/data-reference-portal="dashboard"/);
 assert.match(referenceTemplate,/data-reference-portal="products"/);
 assert.match(referenceTemplate,/data-reference-portal="contact"/);
 assert.match(referenceTemplate,/id="architecture"/);
 assert.match(referenceTemplate,/__BED_COUNT__/);
 assert.match(referenceTemplate,/__SLOT_COUNT__/);
 assert.match(referenceTemplate,/bg-\[\#2d5a27\]/);
 assert.match(referenceTemplate,/rounded-\[28px\]/);
 assert.match(referenceCSS,/\.min-h-screen/);
 assert.match(referenceCSS,/\.lg\\:grid-cols-/);
});
test('no fabricated harvest, revenue, farmers or fixed facilities in reference template',()=>{
 for(const forbidden of ['১২০+ কৃষক','২,৪০০ কেজি','৩,০৫০ কেজি','২০২৫','ROI ৩০০%','প্রতিদিন একটি বেড খালি হয়','৮x৫ সিস্টেম']){
  assert.equal(referenceTemplate.includes(forbidden),false,`Unexpected fake demo data: ${forbidden}`);
 }
 assert.match(referenceProcess,/__BED_COUNT__/);
 assert.match(referenceProcess,/__SLOT_COUNT__/);
 assert.match(referenceProcess,/__PRECOMPOST_DAYS__/);
});
