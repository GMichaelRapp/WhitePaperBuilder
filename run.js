#!/usr/bin/env node
/*
 * Tests for White Paper Builder. Run from the repository root:  node Tests/run.js
 * Needs Node 18 or later and nothing else. It loads index.html, runs the embedded OSINT
 * citation core and the page's own core, and checks what the paper is built from.
 * Page layout itself (Paged.js) needs a browser and is not tested here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grab = (id) => { const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>')); if (!m) throw new Error('No <script id="' + id + '"> in index.html'); return m[1]; };
const OSINT = new Function(grab('osint') + ';return OSINT;')();
const WP = new Function('OSINT', grab('core') + ';return WP;')(OSINT);
WP.useCiter(OSINT);

let failed = 0, passed = 0;
function eq(got, want, label) {
  if (got === want) { passed++; return; }
  failed++; console.log('FAIL  ' + label + '\n  got : ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want));
}
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const notesOf = (h) => (h.match(/<span class="fn">[\s\S]*?<\/span><sup class="fn-call">/g) || []).map((x) => strip(x.replace(/<sup[\s\S]*$/, '')).trim());

// ---- 1. Blocks ----
const bs = WP.blocks('# One\n\nPara line one\nline two.\n\n## Sub\n\n- a\n- b\ncontinued\n\n1. x\n2. y\n\n> quote\n> more\n\n!> key\n\n>> side\n\n{R1} do this\n{R2} do that\n\n[[fig-1]]\n\n---\n\n### Minor');
eq(bs.map((b) => b.t + (b.level || '')).join(' '), 'h1 p h2 ul ol quote key side labeled visual break h3', 'blocks: every kind is recognized');
eq(bs[1].text, 'Para line one line two.', 'blocks: lines of a paragraph join');
eq(bs[3].items.join('|'), 'a|b continued', 'blocks: a line after a list item continues it');
eq(bs[5].text, 'quote more', 'blocks: consecutive quote lines join');
eq(bs[8].items.map((x) => x.label + ':' + x.text).join('|'), 'R1:do this|R2:do that', 'blocks: labeled items group');

// ---- 2. Notes and citations ----
const list = JSON.stringify({ app: 'OSINT Citation Generator', format: 2, sources: [
  { id: 'a1', fields: { type: 'book', authors: 'Michael Beckley', title: "Unrivaled: Why America Will Remain the World's Sole Superpower", titleStyle: 'italics', descType: 'Monograph', publisher: 'Cornell University Press', date: '2018', locator: '99' } },
  { id: 'a2', fields: { type: 'news', authors: 'Jane Doe', title: 'Drones Over the Front', location: 'Example Times', date: '2024-05-01', url: 'https://example.com/x', rating: 'B2' } }] });
const imp = WP.importOsintList(list, []);
eq(imp.sources.map((s) => s.key).join(','), 'beckley-unrivaled,doe-drones', 'sources: keys from author and first title word');
eq(WP.importOsintList(list, imp.sources).sources.length + ':' + WP.importOsintList(list, imp.sources).skipped, '0:2', 'sources: opening the same list again adds nothing');
eq(!!WP.importOsintList('{"x":1}', []).error, true, 'sources: refuses a file that is not a list');

function paper(over) {
  const d = WP.defaults();
  Object.assign(d.meta, { title: 'Test Paper', author: 'Jane Doe', date: 'October 2026', number: '007' });
  d.summary.lead = 'Lead.';
  d.sources = imp.sources.concat([{ key: 'typed', kind: 'typed', full: 'Example Agency, *Annual Report* (2024).', short: 'Example Agency, *Annual Report*.' }]);
  return Object.assign(d, over || {});
}
let r = WP.render(paper({ body: '# Intro\n\nFirst claim [@beckley-unrivaled, 25-27].\n\nAgain [@beckley-unrivaled, 45]. Both [@doe-drones; @typed, 4]. A plain note ^[With an inline cite to [@typed].]' }));
const n = notesOf(r.html);
eq(n[0], '1 Michael Beckley, Unrivaled: Why America Will Remain the World’s Sole Superpower [Monograph] (Cornell University Press: 2018): pp. 25–27.', 'citation: first use is the full OSINT footnote, with the cited pages');
eq(n[1], '2 Beckley, Unrivaled, p. 45.', 'citation: later uses are the short form');
eq(n[2], '3 Jane Doe, “Drones Over the Front,” Example Times [B2] (01 May 2024) https://example.com/x; Example Agency, Annual Report (2024), p. 4.', 'citation: two sources in one note, separated by a semicolon');
eq(n[3], '4 With an inline cite to Example Agency, Annual Report.', 'citation: inside a note, a citation prints inline in short form');
eq(/Again<span class="fn">/.test(r.html.replace(/<sup[^>]*>\d+<\/sup>/g, '')) || /claim<span class="fn">/.test(r.html), true, 'notes: a space before a note call is dropped');
eq(r.stats.notes + ':' + r.stats.cited, '4:3', 'stats: notes and sources cited');
r = WP.render(paper({ body: '# Intro\n\nText [@nobody].' }));
eq(r.problems.some((p) => p.level === 'fix' && /@nobody/.test(p.msg)), true, 'checks: an unknown key is flagged');
eq(r.problems.some((p) => /@doe-drones is not cited/.test(p.msg)), true, 'checks: an uncited source is noted');
eq(strip(WP.inline('She said "yes" and it\'s **bold**, *italic*, [a link](https://example.org).', { note: (h) => h, cite: () => '' })), 'She said “yes” and it’s bold, italic, a link.', 'inline: typographic quotes, bold, italics, links');
eq(/<a href="https:\/\/example.org">a link<\/a>/.test(WP.inline('[a link](https://example.org)', { note: (h) => h, cite: () => '' })), true, 'inline: links keep their address');
eq(/<script/.test(WP.render(paper({ body: '# A\n\n<script>alert(1)</script>' })).html), false, 'inline: typed HTML is escaped');

// ---- 3. Numbering, contents, visuals ----
const vis = [
  { id: 'fig-a', kind: 'bar', title: 'Up', source: 'Data', data: 'Year,Value\n2020,1\n2021,3' },
  { id: 'tab-a', kind: 'table', title: 'Compare', source: 'Data', data: 'Name,Count\nA,1\nB,2', highlight: 'B' },
  { id: 'nums', kind: 'stats', data: '41%, share of something' },
  { id: 'unused', kind: 'line', title: 'Never placed', source: 'x', data: 'a,1\nb,2' },
  { id: 'app-t', kind: 'table', title: 'In the appendix', source: 'Data', data: 'a,b\n1,2' }];
r = WP.render(paper({ visuals: vis, body: '# Intro\n\n[[fig-a]]\n\n## First\n\nText.\n\n## Second\n\n[[tab-a]]\n\n[[nums]]\n\n# Next\n\nMore.', appendix: '# Method\n\n## How\n\n[[app-t]]\n\n[[rating-key]]' }));
eq(['id="sec-1"', 'id="sec-1-1"', 'id="sec-1-2"', 'id="sec-2"', 'id="app-A"', 'id="app-A-1"'].every((s) => r.html.includes(s)), true, 'numbering: sections 1, 1.1, 1.2, 2 and appendix A, A.1');
eq((r.html.match(/<li class="l[012]">/g) || []).length, 8, 'contents: summary, four body headings, two appendix headings, about page');
eq(['Figure 1', 'Table 1', 'Table A1', 'Table A2'].every((s) => r.html.includes('<div class="vlabel">' + s + '</div>')), true, 'visuals: Figure 1, Table 1, and appendix tables A1 and A2');
eq(/class="lab">Fig\. 1<\/span><a href="#v-fig-a">Up<\/a>/.test(r.html), true, 'contents: list of figures and tables links to each');
eq(/<tr class="hot">/.test(r.html), true, 'visuals: a highlighted table row');
eq(/class="vis stats-wrap"/.test(r.html) && !/vlabel">Figure 2/.test(r.html), true, 'visuals: key numbers are not numbered as a figure');
eq(r.problems.some((p) => /\[\[unused\]\] is not placed/.test(p.msg)), true, 'checks: a visual not placed is noted');
eq(WP.render(paper({ body: '# A\n\n[[nothing]]' })).problems.some((p) => p.level === 'fix' && /\[\[nothing\]\]/.test(p.msg)), true, 'checks: a missing visual is flagged');
eq(WP.render(paper({ visuals: [{ id: 'f', kind: 'bar', title: 'T', data: 'a,1' }], body: '# A\n\n[[f]]' })).problems.some((p) => /has no source line/.test(p.msg)), true, 'checks: a figure with no source is flagged');

// ---- 3b. Fixes found in review ----
r = WP.render(paper({ visuals: [{ id: 't1', kind: 'table', title: 'One', source: 'S', data: 'a,b\n1,2' }, { id: 't2', kind: 'table', title: 'Two', source: 'S', data: 'a,b\n1,2' }, { id: 'f1', kind: 'bar', title: 'Fig', source: 'S', data: 'a,1' }],
  body: '## Early\n\n# One\n\nText.', appendix: '# First\n\n[[t1]]\n\n# Second\n\n[[t2]]\n\n[[f1]]' }));
eq(['Table A1', 'Table B1', 'Figure B1'].every((x) => r.html.includes('<div class="vlabel">' + x + '</div>')), true, 'appendix: tables and figures numbered afresh in each appendix');
eq(r.html.includes('id="sec-0-1"') && (r.html.match(/id="sec-1"/g) || []).length === 1, true, 'numbering: a subsection before the first section gets its own anchor');
eq(notesOf(WP.render(paper({ body: '# A\n\nText.^[See [@doe-drones].]' })).html)[0], '1 See Jane Doe, \u201CDrones Over the Front,\u201D Example Times [B2] (01 May 2024) https://example.com/x.', 'citation: no doubled period inside a note');
eq(notesOf(WP.render(paper({ sources: [{ key: 'q', kind: 'typed', full: 'Ann Lee, "A Title."' }], body: '# A\n\nText [@q, p. 3].' })).html)[0], '1 Ann Lee, \u201CA Title,\u201D p. 3.', 'citation: a page after a title ending in a period and quotation mark');
eq(WP.splitLead('1,200, Sea days in 2023', 'stats').join('|') + ' / ' + WP.splitLead('March 3, 2022, The exercise began', 'timeline').join('|'), '1,200|Sea days in 2023 / March 3, 2022|The exercise began', 'data: numbers and dates keep their own commas');
eq(/<thead>/.test(WP.render(paper({ visuals: [{ id: 'w', kind: 'table', title: 'Words', source: 'S', data: 'Approach,Strength\nA,Cheap' }], body: '# A\n\n[[w]]' })).html), true, 'tables: the first row is the header, even with no numbers');
eq(WP.plainText('The **Real** Question^[note] [@doe-drones]'), 'The Real Question', 'contents: headings show without notes, citations, or markup');

// ---- 4. Data and charts ----
eq(JSON.stringify(WP.parseData('Year,Value\n2020,"1,200"\n2021,45%')), '{"head":["Year","Value"],"rows":[["2020","1,200"],["2021","45%"]]}', 'data: CSV with a header and quoted numbers');
eq(JSON.stringify(WP.parseData('a\t1\nb\t2').rows), '[["a","1"],["b","2"]]', 'data: pasted from a spreadsheet (tabs)');
eq(JSON.stringify(WP.parseData('| x | y |\n|---|---|\n| a | 1 |')), '{"head":["x","y"],"rows":[["a","1"]]}', 'data: a Markdown table');
eq(WP.parseNumber('1,200') + ':' + WP.parseNumber('45%') + ':' + WP.parseNumber('−3') + ':' + WP.parseNumber('n/a'), '1200:45:-3:null', 'data: numbers with commas, percent, and a minus sign');
['bar', 'hbar', 'line'].forEach((k) => eq(/^<svg class="chart"[\s\S]*<\/svg>$/.test(WP.chartSvg({ kind: k, title: 't', data: 'Year,A,B\n2020,1,2\n2021,3,-1' }, '#C42A14')), true, 'chart: ' + k + ' draws an SVG'));
eq(/vempty/.test(WP.chartSvg({ kind: 'bar', data: '' }, '#C42A14')), true, 'chart: no data shows a prompt instead');

// ---- 5. Cover, back page, page furniture ----
r = WP.render(paper({ body: '# A\n\nText.', back: { include: true, bio: 'Bio.', history: '1.0 | October 13, 2026 | First publication', series: '007 | Test Paper | This paper', license: 'CC BY 4.0' } }));
eq(strip((r.html.match(/Cite as<\/div><div class="bt">([\s\S]*?)<\/div>/) || [])[1] || ''), 'Doe, Jane. “Test Paper.” White Paper No. 007, version 1.0. Ryan McBeth, October 2026. ryanmcbeth.substack.com.', 'back page: cite as');
eq(/@top-left\{content:"White paper No\. 007"/.test(r.vars) && /@bottom-left\{content:"Test Paper"/.test(r.vars), true, 'pages: header shows the paper number and footer the short title');
eq(/@bottom-left\{content:"Say \\"hi\\""/.test(WP.render(paper({ meta: Object.assign(WP.defaults().meta, { title: 'T', shortTitle: 'Say "hi"' }) })).vars), true, 'pages: quotation marks in the short title are escaped');
eq(WP.invertName('Jane Q. Doe') + '|' + WP.invertName('Doe, Jane') + '|' + WP.invertName('[Author name]'), 'Doe, Jane Q.|Doe, Jane|[Author name]', 'back page: author name inverted for the citation');

// ---- 6. Project files ----
const d0 = paper({ body: '# A\n\nText.', visuals: [{ id: 'img', kind: 'image', image: 'data:image/png;base64,iVBORw0KGgo=' }, { id: 'bad', kind: 'image', image: 'javascript:alert(1)' }] });
const back = WP.parseProject(WP.projectFile(d0));
eq(back.doc.meta.title + '|' + back.doc.sources.length + '|' + back.doc.visuals.map((v) => v.image ? 'img' : 'none').join(','), 'Test Paper|3|img,none', 'project file: saves and reopens; unsafe image data is dropped');
eq(!!WP.parseProject('not json').error && !!WP.parseProject(list).error, true, 'project file: refuses other files, including OSINT lists');
eq(/Open it under Sources/.test(WP.parseProject(list).error), true, 'project file: says what an OSINT list file is for');

console.log(failed ? `\n${failed} failed, ${passed} passed` : `All ${passed} checks passed.`);
process.exit(failed ? 1 : 0);
