(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  WP.useCiter(OSINT);
  var PAPER_CSS = $('paper-css').textContent;
  var K_DOC = 'wpb-paper-v1', K_THEME = 'wpb-theme-v1', K_TAB = 'wpb-tab-v1';

  // ------------------------------------------------------------------ a new paper: the template, with its guidance in square brackets
  function monthYear() { var d = new Date(); return WP.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function starter() {
    var d = WP.defaults();
    Object.assign(d.meta, { title: '[Paper title: the question or the claim, in ten words or fewer]', subtitle: '[Subtitle: the scope, the period, or the method.]', author: '[Author name]', date: monthYear(), shortTitle: '[Short title]' });
    d.aboutSeries = '[Two or three sentences: what the papers cover, who writes them, and how often a new one appears.]\n\nEach paper is numbered, dated, and versioned. When a paper is revised, its version number changes and the change is logged on the back page.';
    d.summary = {
      lead: '[The problem in two sentences: what is happening, and why it will still matter in five years.]',
      findings: '[Finding: the main claim, stated plainly enough that it could be proven wrong.]\n[Finding: the strongest evidence, in one sentence.]\n[Finding: the consequence the reader is most likely to miss.]',
      recommendations: '[Who should act, and what they should do.]\n[A second recommendation, for a different actor.]\n[What to stop doing, or what to start measuring.]'
    };
    d.body = [
      '# Introduction', '',
      '[Body text runs in one 5.3-inch column. Put each note right after the sentence it supports, like this.^[A note is written where it belongs: a caret and the note in square brackets. Notes run in one sequence through the paper and print at the foot of the page.] To cite a source from your OSINT list, write its key in square brackets with an at sign, as Sources explains.]', '',
      '>> [Margin note: a definition or a date. 25 words at most.]',
      '[A paragraph the margin note sits beside. Leave a blank line between paragraphs.]', '',
      '# Background', '',
      '[What the reader needs first: the history, the actors, and the terms.]', '',
      '[[fig-trend]]', '',
      '# Analysis', '',
      '[The core argument.]', '',
      '## [Subsection title]', '',
      '[Subsections are numbered 3.1, 3.2, and so on.]', '',
      '!> [The sentence from this paper a reader would quote.]', '',
      '# Evidence', '',
      '[[key-numbers]]', '',
      '[[table-compare]]', '',
      '# Implications and recommendations', '',
      '## Recommendations', '',
      '{R1} [Who should act, and what they should do. Why, and what it would cost.]',
      '{R2} [A second recommendation, for a different actor.]',
      '{R3} [What to stop doing, or what to start measuring.]', '',
      '## What to watch', '',
      '{Indicator 1} [An event the reader could observe, and what it would confirm.]',
      '{Indicator 2} [A second observable event, and what it would weaken.]',
      '{Indicator 3} [The event that would prove this paper wrong.]'
    ].join('\n');
    d.appendix = ['# Method and sources', '', '## Method', '', '[How the research was done: what was collected, from where, and over what period.]', '',
      '## Limitations', '', '[What the sources cannot show, and where the analysis is weakest.]', '', '## Source ratings', '', '[[rating-key]]'].join('\n');
    d.visuals = [
      { id: 'fig-trend', kind: 'bar', title: '[Chart title: state the finding, not the variable]', subtitle: '[Unit of measure, date range]', source: '[Source: dataset, publisher, year.]', note: 'Placeholder numbers. Replace them under Visuals.', data: 'Year,Value\n2019,28\n2020,34\n2021,31\n2022,46\n2023,58\n2024,82\n2025,71', highlight: '2024', image: '', wide: false },
      { id: 'key-numbers', kind: 'stats', title: '', subtitle: '', source: '', note: '', data: '[00], [What this number measures, with unit and year]\n[00], [A second figure that puts the first in proportion]\n[00], [A third figure, or the comparison that surprised you]', highlight: '', image: '', wide: false },
      { id: 'table-compare', kind: 'table', title: '[Table title: what is being compared]', subtitle: '', source: '[Source: dataset or document, publisher, year. Note any gaps.]', note: '', data: 'Actor or system,Attribute,Year,Count\n[Row label],[Text value],[YYYY],[000]\n[Row label],[Text value],[YYYY],[000]\n[Row label],[Text value],[YYYY],[000]', highlight: '', image: '', wide: false }
    ];
    d.back = { include: true, bio: '[Two-sentence biography: background, and what qualifies the author to write this paper.]', history: '1.0 | [Month DD, YYYY] | First publication', series: '001 | [This paper\'s title] | This paper\n002 | [Forthcoming title] | [Month YYYY]\n003 | [Forthcoming title] | [Month YYYY]', license: '[Reuse and licensing terms]' };
    return d;
  }

  // ------------------------------------------------------------------ state
  var doc = null, saveTimer = null, renderTimer = null, rendering = false, renderAgain = false, lastTarget = null, statusTimer = null;
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function setStatus(msg, bad) {
    var s = $('status'); s.textContent = msg; s.className = 'status' + (bad ? ' bad' : '');
    clearTimeout(statusTimer); if (!bad) statusTimer = setTimeout(function () { s.textContent = ''; }, 3000);
  }
  function get(path) { var p = path.split('.'), o = doc; for (var i = 0; i < p.length; i++) o = o == null ? undefined : o[p[i]]; return o; }
  function put(path, v) { var p = path.split('.'), o = doc; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }
  var warnedSize = false;
  function changed(now) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!store(K_DOC, doc) && !warnedSize) { warnedSize = true; setStatus('This paper is too large to keep in the browser between visits (images take the space). Save a project file to keep it.', true); }
    }, 400);
    schedule(now ? 0 : 650);
  }

  // ------------------------------------------------------------------ fields
  function fillFields() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (el) {
      var v = get(el.getAttribute('data-k'));
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    $('coverInfo').textContent = doc.meta.coverImage ? 'Image chosen.' : 'No image.';
    renderVisualList(); renderSources();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (el) {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input', function () {
      put(el.getAttribute('data-k'), el.type === 'checkbox' ? el.checked : el.value);
      changed(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color');
    });
    if (el.hasAttribute('data-cite')) el.addEventListener('focus', function () { lastTarget = el; });
  });

  // ------------------------------------------------------------------ tabs
  function showTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs [data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name)); });
    Array.prototype.forEach.call(document.querySelectorAll('#panes [data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
    store(K_TAB, name);
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) showTab(b.getAttribute('data-tab')); });

  // ------------------------------------------------------------------ writing toolbar
  function insert(ta, before, after, placeholder) {
    ta = ta || lastTarget || $('t-body');
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e) || placeholder || '';
    ta.focus();
    ta.setRangeText(before + sel + (after || ''), s, e, 'end');
    if (!v.slice(s, e) && placeholder) { ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + placeholder.length; }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Block-level additions go on a line of their own: from the middle of a line, they start
  // after the end of that line rather than splitting it.
  function lineStart(ta, prefix, placeholder) {
    var s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1;
    if (s !== ls || ta.selectionEnd !== s) {
      var le = v.indexOf('\n', ta.selectionEnd); if (le === -1) le = v.length;
      ta.selectionStart = ta.selectionEnd = le;
      insert(ta, '\n\n' + prefix, '', placeholder);
      return;
    }
    // At the start of a line that already has text, the new block goes above it.
    var le2 = v.indexOf('\n', s), rest = v.slice(s, le2 === -1 ? v.length : le2);
    if (rest.trim()) ta.setRangeText('\n\n', s, s, 'start');
    insert(ta, prefix, '', placeholder);
  }
  var TOOLS = [
    ['Section', function (ta) { lineStart(ta, '# ', 'Section title'); }, '# starts a numbered section, on a new page'],
    ['Subsection', function (ta) { lineStart(ta, '## ', 'Subsection title'); }, '## starts a numbered subsection'],
    ['Note', function (ta) { insert(ta, '^[', ']', 'note text'); }, 'A footnote at the cursor'],
    ['Bold', function (ta) { insert(ta, '**', '**', 'bold text'); }, 'Bold: **text**'],
    ['Italic', function (ta) { insert(ta, '*', '*', 'italic text'); }, 'Italic: *text*'],
    ['Cite', function (ta) { lastTarget = ta; showTab('sources'); setStatus('Pick a source and click Cite. It goes where your cursor was.'); }, 'Cite a source from your list'],
    ['Key point', function (ta) { lineStart(ta, '!> ', 'The sentence a reader would quote.'); }, 'A pull-out key point'],
    ['Margin note', function (ta) { lineStart(ta, '>> ', 'A definition or a date.'); }, 'A note in the margin, beside the next paragraph'],
    ['Quote', function (ta) { lineStart(ta, '> ', 'Quoted text'); }, 'A block quotation'],
    ['List', function (ta) { lineStart(ta, '- ', 'Item'); }, 'A bulleted list'],
    ['Labeled', function (ta) { lineStart(ta, '{R1} ', 'Text'); }, 'A row with a label in the margin: {R1}, {Indicator 1}'],
    ['Visual', function (ta) { var ids = doc.visuals.map(function (v) { return v.id; }); lineStart(ta, '[[', ids[0] || 'name'); insert(ta, '', ']]'); }, 'Place a chart, table, or image'],
    ['Page break', function (ta) { lineStart(ta, '---', ''); insert(ta, '\n\n', ''); }, 'Start a new page']
  ];
  Array.prototype.forEach.call(document.querySelectorAll('.toolbar'), function (bar) {
    var ta = $('t-' + bar.getAttribute('data-for'));
    TOOLS.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = t[0]; b.title = t[2];
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { t[1](ta); });
      bar.appendChild(b);
    });
    if (bar.getAttribute('data-for') === 'appendix') {
      var r = document.createElement('button'); r.type = 'button'; r.className = 'btn'; r.textContent = 'Rating key'; r.title = 'The Admiralty source rating key table';
      r.addEventListener('mousedown', function (e) { e.preventDefault(); });
      r.addEventListener('click', function () { lineStart(ta, '[[rating-key]]', ''); });
      bar.appendChild(r);
    }
  });
  var HELP = [
    ['# Title', 'A numbered section. Each starts a new page unless you turn that off under Paper.'],
    ['## Title', 'A numbered subsection: 3.1, 3.2.'],
    ['### Title', 'A small heading, not numbered.'],
    ['(blank line)', 'Starts a new paragraph.'],
    ['*italic*  **bold**', 'Italic and bold. [text](https://...) makes a link.'],
    ['^[note text]', 'A footnote, numbered in order through the paper.'],
    ['[@key, p. 45]', 'Cites a source from Sources in a footnote. First use prints in full, later uses in short form. [@a; @b, p. 3] cites two in one note. Inside a note, [@key] prints the citation inline.'],
    ['!> text', 'A key point, set large with a rule above.'],
    ['>> text', 'A margin note beside the next paragraph.'],
    ['> text', 'A block quotation.'],
    ['- item  /  1. item', 'Bulleted and numbered lists.'],
    ['{R1} text', 'A row with a label in the margin, for recommendations and indicators.'],
    ['[[name]]', 'Places the chart, table, or image with that name from Visuals.'],
    ['---', 'Starts a new page.']
  ];
  $('helpTable').innerHTML = HELP.map(function (h) { return '<tr><td>' + esc(h[0]) + '</td><td>' + esc(h[1]) + '</td></tr>'; }).join('');
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ------------------------------------------------------------------ images
  // Large photos are scaled down so a project file stays a reasonable size.
  function readImage(file, cb) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) { setStatus('That file is not an image this page can use (PNG, JPEG, GIF, WebP, or SVG).', true); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var url = String(rd.result);
      if (file.type === 'image/svg+xml' || file.size < 400 * 1024) { cb(url); return; }
      var img = new Image();
      img.onload = function () {
        var max = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = function () { cb(url); };
      img.src = url;
    };
    rd.readAsDataURL(file);
  }
  $('coverPick').addEventListener('click', function () { $('coverFile').click(); });
  $('coverFile').addEventListener('change', function () { readImage($('coverFile').files[0], function (u) { doc.meta.coverImage = u; $('coverFile').value = ''; $('coverInfo').textContent = 'Image chosen.'; changed(true); }); });
  $('coverClear').addEventListener('click', function () { doc.meta.coverImage = ''; $('coverInfo').textContent = 'No image.'; changed(true); });

  // ------------------------------------------------------------------ visuals
  var KIND_HELP = {
    bar: 'One row per column: a label, then a value. Add more value columns to compare series. Paste from a spreadsheet, or type with commas; write 1200, not 1,200.',
    hbar: 'One row per bar: a label, then a value. Long labels read better here than in a column chart.',
    line: 'One row per point in time: a label, then one value per line. A header row names the lines.',
    table: 'One row per line of the table, cells separated by commas or tabs. Put a cell that contains a comma in "quotation marks".',
    timeline: 'One event per line: the date, a comma, then what happened.',
    stats: 'Up to four lines: the number, a comma, then what it measures.',
    image: 'A map, a screenshot, or a photo. Give its source.'
  };
  (function () {
    var box = $('addVisual');
    Object.keys(WP.VISUAL_KINDS).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = '+ ' + WP.VISUAL_KINDS[k].label;
      b.addEventListener('click', function () {
        var base = WP.slug(WP.VISUAL_KINDS[k].label).split('-')[0] || 'visual', n = 1, id;
        do { id = base + '-' + n++; } while (doc.visuals.some(function (v) { return v.id === id; }));
        doc.visuals.push({ id: id, kind: k, title: '', subtitle: '', source: '', note: '', data: '', highlight: '', image: '', wide: k === 'table' ? false : false });
        renderVisualList(); changed();
        var cards = $('visList').querySelectorAll('.card'); var last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); last.querySelector('input').focus(); }
      });
      box.appendChild(b);
    });
  })();
  function vfield(card, v, key, label, type, attrs) {
    var f = document.createElement('div'); f.className = 'field';
    var id = 'v-' + Math.random().toString(36).slice(2);
    var lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = label; f.appendChild(lab);
    var el = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (type !== 'textarea') el.type = 'text'; else { el.rows = 5; el.className = 'code'; }
    el.id = id; el.value = v[key] || '';
    Object.keys(attrs || {}).forEach(function (a) { el.setAttribute(a, attrs[a]); });
    el.addEventListener('input', function () { v[key] = el.value; changed(); });
    f.appendChild(el); card.appendChild(f);
    return el;
  }
  function renderVisualList() {
    var list = $('visList'); list.textContent = '';
    doc.visuals.forEach(function (v, i) {
      var card = document.createElement('div'); card.className = 'card';
      var top = document.createElement('div'); top.className = 'top';
      var name = document.createElement('input'); name.type = 'text'; name.value = v.id; name.setAttribute('aria-label', 'Name'); name.style.maxWidth = '180px'; name.style.fontFamily = 'var(--mono)';
      name.addEventListener('change', function () {
        var nv = WP.slug(name.value) || v.id;
        if (nv === 'rating-key') { setStatus('rating-key is the built-in source rating table. Choose another name.', true); name.value = v.id; return; }
        if (nv !== v.id && doc.visuals.some(function (x) { return x.id === nv; })) { setStatus('Another visual already has that name.', true); name.value = v.id; return; }
        var re = new RegExp('\\[\\[\\s*' + v.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\]\\]', 'g');
        doc.body = doc.body.replace(re, '[[' + nv + ']]'); doc.appendix = doc.appendix.replace(re, '[[' + nv + ']]');
        $('t-body').value = doc.body; $('t-appendix').value = doc.appendix;
        v.id = nv; name.value = nv; changed();
      });
      var kind = document.createElement('select'); kind.setAttribute('aria-label', 'Kind'); kind.style.maxWidth = '150px';
      Object.keys(WP.VISUAL_KINDS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = WP.VISUAL_KINDS[k].label; kind.appendChild(o); });
      kind.value = v.kind;
      kind.addEventListener('change', function () { v.kind = kind.value; renderVisualList(); changed(true); });
      var grow = document.createElement('span'); grow.className = 'grow';
      var place = document.createElement('button'); place.type = 'button'; place.className = 'btn small'; place.textContent = 'Place in body';
      place.title = 'Adds [[' + v.id + ']] at the cursor in the body';
      place.addEventListener('click', function () { showTab('body'); var ta = $('t-body'); lineStart(ta, '[[' + v.id + ']]', ''); });
      var del = document.createElement('button'); del.type = 'button'; del.className = 'btn small quiet danger'; del.textContent = 'Delete';
      var armed = false;
      del.addEventListener('click', function () {
        if (!armed) { armed = true; del.textContent = 'Click again to delete'; setTimeout(function () { armed = false; del.textContent = 'Delete'; }, 3000); return; }
        doc.visuals.splice(doc.visuals.indexOf(v), 1); renderVisualList(); changed(true);
      });
      top.appendChild(name); top.appendChild(kind); top.appendChild(grow); top.appendChild(place); top.appendChild(del);
      card.appendChild(top);
      var hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = KIND_HELP[v.kind]; card.appendChild(hint);
      vfield(card, v, 'title', v.kind === 'stats' ? 'Heading (optional)' : 'Title: state the finding, not the variable');
      if (v.kind !== 'stats') vfield(card, v, 'subtitle', 'Subtitle: unit of measure, date range');
      if (v.kind === 'image') {
        var row = document.createElement('div'); row.className = 'row'; row.style.gridTemplateColumns = 'auto 1fr'; row.style.alignItems = 'center';
        var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn small'; pick.textContent = v.image ? 'Replace the image' : 'Choose an image';
        var info = document.createElement('span'); info.className = 'hint'; info.textContent = v.image ? 'Image chosen.' : 'No image yet.';
        var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'; file.hidden = true;
        pick.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () { readImage(file.files[0], function (u) { v.image = u; info.textContent = 'Image chosen.'; pick.textContent = 'Replace the image'; changed(true); }); });
        row.appendChild(pick); row.appendChild(info); card.appendChild(row); card.appendChild(file);
      } else {
        vfield(card, v, 'data', 'Data', 'textarea', { spellcheck: 'false', placeholder: v.kind === 'timeline' ? '1993, Event in one line: who did what, and where.' : v.kind === 'stats' ? '41%, What this number measures, with unit and year' : 'Year,Value\n2022,46\n2023,58' });
      }
      if (/^(bar|hbar|line|table)$/.test(v.kind)) vfield(card, v, 'highlight', v.kind === 'table' ? 'Row to highlight (its first cell)' : 'Label to highlight in the accent color');
      vfield(card, v, 'source', 'Source', 'text', { placeholder: 'Source: dataset or document, publisher, year.' });
      if (v.kind !== 'stats') vfield(card, v, 'note', 'Reading note (in the margin, optional)');
      if (v.kind === 'table') {
        var hw = document.createElement('label'); hw.className = 'check';
        var hb = document.createElement('input'); hb.type = 'checkbox'; hb.checked = !v.noHeader;
        hb.addEventListener('change', function () { v.noHeader = !hb.checked; changed(true); });
        hw.appendChild(hb); var hs = document.createElement('span'); hs.textContent = 'The first row is the header'; hw.appendChild(hs); card.appendChild(hw);
      }
      if (v.kind === 'image' || v.kind === 'table') {
        var w = document.createElement('label'); w.className = 'check';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!v.wide;
        cb.addEventListener('change', function () { v.wide = cb.checked; changed(true); });
        w.appendChild(cb); var sp = document.createElement('span'); sp.textContent = 'Full width, across the margin column'; w.appendChild(sp); card.appendChild(w);
      }
      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------------ sources
  function renderSources() {
    var box = $('srcList'); box.textContent = '';
    $('srcEmpty').hidden = doc.sources.length > 0;
    doc.sources.forEach(function (s) {
      var row = document.createElement('div'); row.className = 'src';
      var key = document.createElement('input'); key.type = 'text'; key.className = 'key'; key.value = s.key; key.setAttribute('aria-label', 'Key');
      key.addEventListener('change', function () {
        var nk = key.value.trim().replace(/^@/, '').replace(/[^\w.:-]/g, '-');
        if (!nk || (nk !== s.key && doc.sources.some(function (x) { return x.key === nk; }))) { key.value = s.key; setStatus('Keys must be unique.', true); return; }
        var re = new RegExp('@' + s.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.:-]*\\w)', 'g');
        ['body', 'appendix'].forEach(function (k) { doc[k] = doc[k].replace(re, '@' + nk); });
        ['lead', 'findings', 'recommendations'].forEach(function (k) { doc.summary[k] = doc.summary[k].replace(re, '@' + nk); });
        doc.visuals.forEach(function (v) { ['title', 'subtitle', 'source', 'note', 'data'].forEach(function (k) { v[k] = String(v[k] || '').replace(re, '@' + nk); }); });
        doc.back.bio = doc.back.bio.replace(re, '@' + nk);
        s.key = nk; fillFields(); changed();
      });
      var acts = document.createElement('div'); acts.className = 'acts';
      var cite = document.createElement('button'); cite.type = 'button'; cite.className = 'btn small primary'; cite.textContent = 'Cite';
      cite.title = 'Insert [@' + s.key + '] where your cursor was';
      cite.addEventListener('click', function () {
        var ta = lastTarget || $('t-body');
        var tab = ta.closest('[data-pane]').getAttribute('data-pane'); showTab(tab);
        insert(ta, '[@' + s.key + ']', '');
        setStatus('Cited @' + s.key + '. Add a page inside the brackets: [@' + s.key + ', p. 12].');
      });
      var del = document.createElement('button'); del.type = 'button'; del.className = 'btn small quiet danger'; del.textContent = 'Remove';
      var armedDel = false;
      del.addEventListener('click', function () {
        if (!armedDel) { armedDel = true; del.textContent = 'Click again to remove'; setTimeout(function () { armedDel = false; del.textContent = 'Remove'; }, 3000); return; }
        doc.sources.splice(doc.sources.indexOf(s), 1); renderSources(); changed();
      });
      acts.appendChild(cite); acts.appendChild(del);
      var txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = WP.sourceLabel(s);
      row.appendChild(key); row.appendChild(acts); row.appendChild(txt);
      box.appendChild(row);
    });
  }
  function srcSay(msg, bad) { var e = $('srcMsg'); e.textContent = msg; e.className = 'filemsg' + (bad ? ' bad' : ''); }
  $('srcOpen').addEventListener('click', function () { $('srcPick').click(); });
  $('srcPick').addEventListener('change', function () {
    var files = Array.prototype.slice.call($('srcPick').files), msgs = [], left = files.length;
    files.forEach(function (f) {
      var rd = new FileReader();
      rd.onload = function () {
        var res = WP.importOsintList(String(rd.result), doc.sources);
        if (res.error) msgs.push(f.name + ': ' + res.error);
        else { doc.sources = doc.sources.concat(res.sources); msgs.push(f.name + ': ' + res.sources.length + ' source' + (res.sources.length === 1 ? '' : 's') + ' added' + (res.skipped ? ', ' + res.skipped + ' already here' : '') + '.'); }
        if (--left === 0) { $('srcPick').value = ''; renderSources(); changed(); srcSay(msgs.join(' '), msgs.some(function (m) { return /not|could/.test(m) && !/added/.test(m); })); }
      };
      rd.readAsText(f);
    });
  });
  $('srcAddTyped').addEventListener('click', function () { $('typedForm').hidden = false; $('ty-key').focus(); });
  $('tyCancel').addEventListener('click', function () { $('typedForm').hidden = true; });
  $('tySave').addEventListener('click', function () {
    var k = $('ty-key').value.trim().replace(/^@/, '').replace(/[^\w.:-]/g, '-'), full = $('ty-full').value.trim();
    if (!k || !full) { srcSay('Give the source a key and its full citation.', true); return; }
    if (doc.sources.some(function (x) { return x.key === k; })) { srcSay('Another source already has the key ' + k + '.', true); return; }
    doc.sources.push({ key: k, kind: 'typed', full: full, short: $('ty-short').value.trim() });
    $('ty-key').value = $('ty-full').value = $('ty-short').value = ''; $('typedForm').hidden = true;
    renderSources(); changed(); srcSay('Added @' + k + '.');
  });

  // ------------------------------------------------------------------ layout with Paged.js
  var lastResult = null, pageCount = 0;
  function whenIdle() {
    return new Promise(function (resolve) { (function poll() { if (rendering) setTimeout(poll, 80); else resolve(); })(); });
  }
  function schedule(ms) { clearTimeout(renderTimer); window.__wpbBusy = true; renderTimer = setTimeout(layout, ms); }
  function layout() {
    if (rendering) { renderAgain = true; return Promise.resolve(); }
    rendering = true; $('busy').hidden = false;
    var r;
    try { r = WP.render(doc); } catch (e) { rendering = false; $('busy').hidden = true; setStatus('Something went wrong building the paper: ' + e.message, true); return Promise.resolve(); }
    lastResult = r;
    paintChecks(r.problems);
    Array.prototype.forEach.call(document.querySelectorAll('style[data-pagedjs-inserted-styles]'), function (s) { s.remove(); });
    var stage = $('stage'); stage.textContent = '';
    var previewer = new PagedModule.Previewer();
    return previewer.preview(r.html, [{ 'paper.css': PAPER_CSS + '\n' + r.vars }], stage).then(function (flow) {
      pageCount = flow.total;
      Array.prototype.forEach.call(stage.querySelectorAll('.cover-length'), function (el) { el.textContent = String(flow.total); });
      var pages = $('pages'); pages.textContent = '';
      var holder = stage.querySelector('.pagedjs_pages');
      if (holder) pages.appendChild(holder);
      fit();
      var sumPages = Array.prototype.filter.call(pages.querySelectorAll('.pagedjs_page'), function (pg) { var sec = pg.querySelector('section.summary'); return sec && sec.textContent.trim(); }).length;
      if (sumPages > 1) paintChecks(r.problems.concat([{ level: 'check', msg: 'The executive summary runs to ' + sumPages + ' pages. The template keeps it to one.', where: 'summary' }]));
      $('viewStats').innerHTML = '<b>' + flow.total + '</b> pages · <b>' + r.stats.words.toLocaleString() + '</b> words · <b>' + r.stats.notes + '</b> notes · <b>' + r.stats.figures + '</b> figures and tables';
    }).catch(function (e) { setStatus('The pages could not be laid out: ' + (e && e.message ? e.message : e), true); }).then(function () {
      rendering = false; $('busy').hidden = true;
      if (renderAgain) { renderAgain = false; schedule(50); } else window.__wpbBusy = false;
      window.__wpbRendered = (window.__wpbRendered || 0) + 1;
    });
  }
  function fit() {
    var w = $('scroller').clientWidth - 40, z = Math.min(1, Math.max(0.3, w / 816));
    $('pages').style.zoom = String(z);
  }
  window.addEventListener('resize', function () { fit(); });
  var WHERE = { paper: 'paper', summary: 'summary', body: 'body', visuals: 'visuals', sources: 'sources', back: 'back' };
  function paintChecks(list) {
    var ul = $('checks'); ul.textContent = '';
    list.forEach(function (x) {
      var li = document.createElement('li'), tag = document.createElement('span'), b = document.createElement('button');
      tag.className = 'tag ' + x.level; tag.textContent = x.level; b.type = 'button'; b.textContent = x.msg;
      b.addEventListener('click', function () { if (WHERE[x.where]) showTab(WHERE[x.where]); });
      li.appendChild(tag); li.appendChild(b); ul.appendChild(li);
    });
  }

  // ------------------------------------------------------------------ files and printing
  var inViewer = !!(window.claude && typeof window.claude.use === 'function'), dl = Promise.resolve(null);
  if (inViewer) { try { dl = Promise.resolve(window.claude.use('downloads')).catch(function () { return null; }); } catch (e) {} }
  function giveFile(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    if (inViewer) return dl.then(function (d) { return d ? d.save({ filename: name, data: blob }).then(function () { return true; }, function () { return false; }) : false; });
    try { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return Promise.resolve(true); }
    catch (e) { return Promise.resolve(false); }
  }
  function fileName() {
    var base = WP.slug((doc.meta.number ? 'wp-' + doc.meta.number + '-' : '') + (doc.meta.shortTitle || doc.meta.title || 'white-paper').replace(/[\[\]]/g, '')).slice(0, 60) || 'white-paper';
    return base + '.json';
  }
  $('saveBtn').addEventListener('click', function () {
    var name = fileName();
    giveFile(name, WP.projectFile(doc)).then(function (ok) { setStatus(ok ? 'Saved ' + name + '.' : 'The file could not be saved from this view.', !ok); });
  });
  $('openBtn').addEventListener('click', function () { $('openPick').click(); });
  $('openPick').addEventListener('change', function () {
    var f = $('openPick').files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      $('openPick').value = '';
      var res = WP.parseProject(String(rd.result));
      if (res.error) { setStatus(res.error, true); return; }
      doc = res.doc; fillFields(); changed(true); setStatus('Opened ' + f.name + '.');
    };
    rd.readAsText(f);
  });
  var newArmed = false;
  $('newBtn').addEventListener('click', function () {
    var b = $('newBtn');
    if (!newArmed) { newArmed = true; b.textContent = 'Click again: this clears the current paper'; setTimeout(function () { newArmed = false; b.textContent = 'New paper'; }, 4000); return; }
    newArmed = false; b.textContent = 'New paper';
    doc = starter(); fillFields(); changed(true); showTab('paper'); setStatus('Started a new paper from the template. Save a project file first if you need the old one.');
  });
  $('printBtn').addEventListener('click', function () {
    clearTimeout(renderTimer);
    var go = function () {
      if (!pageCount) { setStatus('The pages are not ready yet.', true); return; }
      setStatus('In the print dialog, choose Save as PDF, and turn on Background graphics if the page color is missing.');
      try { window.print(); } catch (e) { setStatus('Printing is blocked in this view. Open the page in its own browser tab and try again.', true); }
    };
    whenIdle().then(function () { return layout(); }).then(go);
  });

  window.addEventListener('pagehide', function () { clearTimeout(saveTimer); store(K_DOC, doc); });

  // ------------------------------------------------------------------ theme
  ['themeAuto', 'themeLight', 'themeDark'].forEach(function (id) {
    $(id).addEventListener('change', function () { var v = $(id).value; store(K_THEME, v); if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v); });
  });
  var th = load(K_THEME); if (th === 'light' || th === 'dark') $(th === 'light' ? 'themeLight' : 'themeDark').checked = true;

  // ------------------------------------------------------------------ boot
  var saved = load(K_DOC);
  doc = saved ? WP.normalize(saved) : starter();
  fillFields();
  var tab = load(K_TAB); showTab(typeof tab === 'string' && document.querySelector('[data-pane="' + tab + '"]') ? tab : 'paper');
  lastTarget = $('t-body');
  var fontsReady = document.fonts && document.fonts.load ? Promise.all(['400 16px "Plex Serif"', 'italic 400 16px "Plex Serif"', '600 16px "Plex Serif"', '700 40px "Plex Sans Cond"', '600 22px "Plex Sans Cond"', '400 12px "Plex Mono"', '700 12px "Plex Mono"'].map(function (f) { return document.fonts.load(f); })) : Promise.resolve();
  fontsReady.then(function () { layout(); }, function () { layout(); });
})();
