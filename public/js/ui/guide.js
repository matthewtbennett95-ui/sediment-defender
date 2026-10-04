// ================================================================
//  FIELD GUIDE — reference for BMPs, pollutants, and mechanisms.
//  The matrix fills in as a student SEES each pairing happen in play,
//  so the "what works on what" knowledge is discovered, not handed out.
// ================================================================
import { el, clear, storage } from './dom.js';
import { BMPS, BMP_ORDER, effectiveness, mechanismsAt, effLabel, statsAt } from '../data/bmps.js';
import { POLLUTANTS, POLLUTANT_ORDER, MECHANISMS } from '../data/pollutants.js';
import { bmpIcon, pollutantIcon } from '../render/sprites.js';
import { SCORE_MAX } from '../engine/scoring.js';

const ATTACK_LABEL = {
  area: 'Treats everything in range',
  field: 'Sits in the channel — slows flow',
  beam: 'Focused treatment',
  pulse: 'Treatment pulses',
};

// ---------------------------------------------------------------- discovery
const KEY = 'sd-discovered-v2';
export function loadDiscovered() {
  const s = storage();
  try { return new Set(JSON.parse(s?.getItem(KEY) || '[]')); } catch { return new Set(); }
}
export function saveDiscovered(game) {
  const set = loadDiscovered();
  BMP_ORDER.forEach((b, bi) => POLLUTANT_ORDER.forEach((p, pi) => {
    if (game.seenPairs[bi * 16 + pi]) set.add(b + ':' + p);
  }));
  try { storage()?.setItem(KEY, JSON.stringify([...set])); } catch {}
  return set;
}

// ---------------------------------------------------------------- cards
export function mechBars(mech) {
  return el('div.mech-bars', Object.entries(mech)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => el('div.mech-row', { title: MECHANISMS[k].desc },
      el('span.mech-name', MECHANISMS[k].icon + ' ' + MECHANISMS[k].name),
      el('span.mech-track', el('span.mech-fill', { style: { width: Math.round(v * 100) + '%', background: MECHANISMS[k].color } })),
    )));
}

export function effChips(bmpId, tier, discovered) {
  return el('div.chips', POLLUTANT_ORDER.map(p => {
    const known = !discovered || discovered.has(bmpId + ':' + p);
    const e = effectiveness(bmpId, tier, p);
    const lab = effLabel(e);
    return el(`span.chip.eff-${known ? lab.cls : 'unknown'}`, { title: known ? `${Math.round(e * 100)}% effective` : 'Not seen yet — try it in a game!' },
      pollutantIcon(p, 18), known ? `${POLLUTANTS[p].short} · ${lab.text}` : `${POLLUTANTS[p].short} · ?`);
  }));
}

export function bmpCard(id, opts = {}) {
  const b = BMPS[id];
  const s = statsAt(id, 0);
  return el('article.card.bmp-card',
    el('header.card-head',
      bmpIcon(id, 48),
      el('div',
        el('h3', b.name),
        el('div.card-sub', `$${b.cost} · ${ATTACK_LABEL[b.attack]} · Unlocks Wave ${b.unlockWave}`),
      ),
    ),
    el('p', b.desc),
    el('h4', 'How it treats water'),
    mechBars(mechanismsAt(id, 0)),
    el('h4', 'Against each pollutant'),
    effChips(id, 0, opts.discovered),
    el('div.science', el('strong', 'The science: '), b.science),
    el('div.stat-line',
      `Range ${Math.round(s.range)} · Land ${b.acres} ac · Holds ${s.capacity.toLocaleString()} sediment before clogging`),
    el('h4', 'Upgrades'),
    el('ol.upgrades', b.tiers.map(t => el('li', el('strong', `${t.name} ($${t.cost}): `), t.desc))),
  );
}

export function pollutantCard(id, opts = {}) {
  const p = POLLUTANTS[id];
  const vul = Object.entries(p.vuln).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const immune = Object.keys(MECHANISMS).filter(k => !(p.vuln[k] > 0.05));
  return el('article.card.pol-card' + (opts.isNew ? '.is-new' : ''),
    el('header.card-head',
      pollutantIcon(id, 44),
      el('div',
        opts.isNew ? el('div.new-badge', 'NEW THREAT') : null,
        el('h3', p.name),
        el('div.card-sub', `${p.sub} · reaches creek: −${p.dmg} health${p.splits ? ` · breaks into ${p.splits.count} ${POLLUTANTS[p.splits.into].short.toLowerCase()}` : ''}${p.payload ? ' · carries everything' : ''}`),
      ),
    ),
    el('p', p.desc),
    el('div.harm', el('strong', 'Harm: '), p.harm),
    el('h4', 'Removed by'),
    el('div.chips', vul.map(([k, v]) => el(`span.chip.eff-${v >= 0.7 ? 'hi' : v >= 0.4 ? 'med' : 'lo'}`, { title: MECHANISMS[k].desc },
      MECHANISMS[k].icon + ' ' + MECHANISMS[k].name))),
    immune.length ? el('div.immune', 'Not affected by: ' + immune.map(k => MECHANISMS[k].name).join(', ')) : null,
    opts.showTip ? el('div.tip', '💡 ' + p.tip) : null,
  );
}

// ---------------------------------------------------------------- full guide
export function buildGuide(root, { onClose, startTab = 0 } = {}) {
  clear(root);
  const tabs = ['BMPs', 'Pollutants', 'Mechanisms', 'What Works?', 'How to Play'];
  const body = el('div.guide-body');
  const tabBar = el('div.tabs', tabs.map((t, i) => el('button.tab', { onclick: () => show(i) }, t)));
  root.append(
    el('div.guide-top',
      el('div', el('h1', 'Field Guide'), el('p.muted', 'Every BMP and pollutant here is real engineering used in Georgia today.')),
      onClose ? el('button.btn.ghost', { onclick: onClose }, 'Close ✕') : null,
    ),
    tabBar, body,
  );

  function show(i) {
    [...tabBar.children].forEach((b, j) => b.classList.toggle('on', i === j));
    clear(body);
    const discovered = loadDiscovered();
    if (i === 0) body.append(el('div.card-grid', BMP_ORDER.map(id => bmpCard(id, { discovered }))));
    if (i === 1) body.append(el('div.card-grid', POLLUTANT_ORDER.map(id => pollutantCard(id, { showTip: false }))));
    if (i === 2) body.append(
      el('p.lead', 'BMPs remove pollution through a handful of real physical, chemical, and biological processes. A BMP only works on a pollutant if its processes match what that pollutant is vulnerable to.'),
      el('div.card-grid', Object.entries(MECHANISMS).map(([k, m]) => el('article.card',
        el('h3', { style: { color: m.color } }, m.icon + ' ' + m.name),
        el('p', m.desc),
        el('h4', 'Works on'),
        el('div.chips', POLLUTANT_ORDER.filter(p => (POLLUTANTS[p].vuln[k] || 0) >= 0.3).map(p => el('span.chip', pollutantIcon(p, 18), POLLUTANTS[p].short))),
        el('h4', 'Used by'),
        el('div.chips', BMP_ORDER.filter(b => (BMPS[b].mech[k] || 0) >= 0.3).map(b => el('span.chip', BMPS[b].name))),
      ))));
    if (i === 3) body.append(matrix(discovered));
    if (i === 4) body.append(howToPlay());
  }
  show(startTab);
  return { show };
}

function matrix(discovered) {
  let showAll = false;
  const wrap = el('div');
  const render = () => {
    clear(wrap);
    const found = discovered.size, total = BMP_ORDER.length * POLLUTANT_ORDER.length;
    wrap.append(
      el('p.lead', `This chart fills in as you play — every time one of your BMPs meets a pollutant, you learn how well it works. Discovered ${found} of ${total}.`),
      el('label.toggle', el('input', { type: 'checkbox', checked: showAll, onchange: e => { showAll = e.target.checked; render(); } }), ' Show everything (spoilers!)'),
      el('div.matrix-scroll', el('table.matrix',
        el('thead', el('tr', el('th', 'BMP'), POLLUTANT_ORDER.map(p => el('th', { title: POLLUTANTS[p].name }, pollutantIcon(p, 22), el('div', POLLUTANTS[p].short))))),
        el('tbody', BMP_ORDER.map(b => el('tr',
          el('th', el('span.mx-name', bmpIcon(b, 26), BMPS[b].name)),
          POLLUTANT_ORDER.map(p => {
            const known = showAll || discovered.has(b + ':' + p);
            const e = effectiveness(b, 0, p);
            const lab = effLabel(e);
            return el(`td.mx.eff-${known ? lab.cls : 'unknown'}`, { title: known ? `${BMPS[b].name} vs ${POLLUTANTS[p].name}: ${Math.round(e * 100)}%` : 'Not discovered yet' },
              known ? lab.text : '?');
          }),
        ))),
      )),
      el('p.muted.small', 'Values shown are for base (un-upgraded) BMPs. Some upgrades add new treatment processes.'),
    );
  };
  render();
  return wrap;
}

function howToPlay() {
  return el('div.howto',
    el('section.card',
      el('h3', 'Your mission'),
      el('p', 'Storms wash pollution off the land and down the channels toward the creek. Build BMPs (Best Management Practices) beside the channels to treat the runoff before it gets there. Anything that reaches the creek costs River Health.'),
      el('ul',
        el('li', 'Check the ', el('strong', 'Next Storm'), ' card to see which pollutants are coming before you start a wave.'),
        el('li', 'Each BMP removes pollution through real processes. Match the process to the pollutant. Dissolved nutrients go right through a silt fence!'),
        el('li', 'Sediment fills BMPs up. When the meter turns orange they lose performance — pay to clean them out, or protect them with sediment control upstream (pretreatment).'),
        el('li', 'You can only remove BMPs between storms, and you get back half of what you spent.'),
        el('li', 'On the pond map, click a wall section to repair a breach — or reinforce a wall that shows seepage before it fails. Prevention is cheaper.'),
      ),
    ),
    el('section.card',
      el('h3', 'Scoring — it\'s an engineering trade-off'),
      el('table.score-table',
        el('tr', el('td', 'Water Quality'), el('td', `up to ${SCORE_MAX.water}`), el('td', 'Each storm is graded like a water-quality standard: 100% removed earns full points, 95% or less earns none')),
        el('tr', el('td', 'River Health'), el('td', `up to ${SCORE_MAX.health}`), el('td', 'Health left at the end')),
        el('tr', el('td', 'Storms Survived'), el('td', `up to ${SCORE_MAX.waves}`), el('td', '100 per wave cleared')),
        el('tr', el('td', 'Cost Efficiency'), el('td', `up to ${SCORE_MAX.efficiency}`), el('td', 'Pollution removed per dollar spent — building, upgrades, maintenance, and repairs all count')),
        el('tr', el('td', 'Land Use'), el('td', `up to ${SCORE_MAX.land}`), el('td', 'Land is valuable. Wetlands and buffers work great but use a lot of it')),
        el('tr', el('td', 'Unspent Budget'), el('td', `up to ${SCORE_MAX.budget}`), el('td', 'Money left over at the end')),
      ),
    ),
    el('section.card',
      el('h3', 'Controls'),
      el('ul',
        el('li', 'Tap a BMP in the shop, then tap the map. On a computer, click to place. On a touch screen, tap to preview and tap ✓ to build.'),
        el('li', 'Tap a placed BMP to upgrade, clean, change its targeting, or remove it.'),
        el('li', 'Tap a pollutant on the map to learn about it.'),
        el('li', 'Keyboard: 1–8 select BMPs · Space start wave / pause · F speed · Esc cancel · G field guide'),
      ),
    ),
  );
}
