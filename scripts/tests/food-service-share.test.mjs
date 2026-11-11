import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFSShareData, buildFSShareHtml } from '../../src/lib/vigia/food-service-share.ts';

test('share excludes empty rows but preserves explicit zero and partial measurements', () => {
  for (const row of [undefined, null, {opened:null,sealed:null,system_qty:null}]) assert.equal(hasFSShareData(row),false);
  for (const field of ['opened','sealed','system_qty']) {
    assert.equal(hasFSShareData({opened:null,sealed:null,system_qty:null,[field]:0}),true);
  }
});
test('general report keeps category headings, codes and partial data without fake totals', () => {
  const product={name:'Café <especial>',code:'internal',itemCode:'00123',category:'cafe',unit:'gramo'};
  const html=buildFSShareHtml('Inventario general','11 de noviembre',[
    {product,calc:null,count:{opened:0,sealed:null,system_qty:null}},
    {product:{...product,name:'Salchichas',category:'pan'},calc:null,count:{opened:null,sealed:2,system_qty:null}},
  ],{cafe:'Café / Nescafé',pan:'Pan y Salchichas'},1,2);
  assert.ok(html.includes('Café / Nescafé') && html.includes('Pan y Salchichas'));
  assert.ok(html.includes('00123') && html.includes('Café &lt;especial&gt;'));
  assert.ok(html.includes('Parte 1 de 2') && html.includes('Sin completar'));
  assert.ok(!html.includes('Correcto'));
});
