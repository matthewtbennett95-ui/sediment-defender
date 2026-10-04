import { BMPS, BMP_ORDER, effectiveness } from '../public/js/data/bmps.js';
import { POLLUTANT_ORDER } from '../public/js/data/pollutants.js';
const pad=(s,n)=>String(s).padEnd(n);
for (const tier of [0,2]) {
  console.log('\nTIER', tier);
  console.log(pad('',16)+POLLUTANT_ORDER.map(p=>pad(p.slice(0,6),7)).join(''));
  for (const b of BMP_ORDER) console.log(pad(b,16)+POLLUTANT_ORDER.map(p=>pad(Math.round(effectiveness(b,tier,p)*100),7)).join(''));
}
