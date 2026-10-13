/*
 * White Paper Builder core: turns a paper (a plain JavaScript object, saved as a project
 * file) into HTML for Paged.js to lay out as printed pages. No page, no network: the
 * tests run this directly.
 *
 * Citations come from OSINT Citation Generator list files and are formatted by that
 * tool's own core (OSINT), which the page loads before this file: the first citation of
 * a source is given in full, later ones in short form.
 */
var WP = (function () {
  'use strict';
  var CITER = typeof OSINT !== 'undefined' ? OSINT : null;
  function useCiter(c) { CITER = c; }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The OSINT Citation Generator's source types and saved fields (list file format 2).
  var OSINT_TYPES = ['book', 'journal', 'news', 'chapter', 'web', 'report', 'social', 'video', 'archival', 'live', 'imagery', 'ai'];
  var OSINT_KEYS = ['lead', 'authors', 'editors', 'translators', 'contributors', 'title', 'titleStyle', 'transTitle', 'origLang', 'transBy', 'location', 'descType', 'descDetails',
    'accessNote', 'rating', 'publisher', 'date', 'dateKind', 'accessed', 'url', 'archiveUrl', 'archiveDate', 'locator', 'note', 'shortName', 'shortTitle'];
  var RATING_KEY = {
    rel: [['A', 'Completely reliable'], ['B', 'Usually reliable'], ['C', 'Fairly reliable'], ['D', 'Not usually reliable'], ['E', 'Unreliable'], ['F', 'Reliability cannot be judged']],
    cred: [['1', 'Confirmed by other sources'], ['2', 'Probably true'], ['3', 'Possibly true'], ['4', 'Doubtful'], ['5', 'Improbable'], ['6', 'Truth cannot be judged']]
  };
  var VISUAL_KINDS = {
    bar: { label: 'Column chart', fig: 'figure' },
    hbar: { label: 'Bar chart', fig: 'figure' },
    line: { label: 'Line chart', fig: 'figure' },
    table: { label: 'Table', fig: 'table' },
    timeline: { label: 'Timeline', fig: 'figure' },
    stats: { label: 'Key numbers', fig: '' },
    image: { label: 'Image or map', fig: 'figure' }
  };

  // ------------------------------------------------------------------ small helpers
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function lines(s) { return String(s == null ? '' : s).split(/\r?\n/).map(clean).filter(Boolean); }
  function words(s) { var t = clean(String(s || '').replace(/[#*>\[\]^@{}]/g, ' ')); return t ? t.split(' ').length : 0; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function letter(n) { return String.fromCharCode(65 + n); }
  function safeUrl(u) { u = clean(u); return /^(https?:|mailto:)/i.test(u) ? u : ''; }
  function safeImage(u) { return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+\/=\s]+$/.test(String(u || '')) ? String(u).replace(/\s/g, '') : ''; }
  function slug(s) { return clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Inline formatting inside an already-escaped string: **bold**, *italic*, [text](url).
  function fmt(escaped) {
    return escaped
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, function (m, t, u) { return '<a href="' + u.replace(/"/g, '%22') + '">' + t + '</a>'; })
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<i>$2</i>');
  }
  function fmtText(s) { return fmt(esc(smart(s))); }
  // Typographer's quotes and apostrophes: "a" -> “a”, it's -> it’s.
  function smart(s) {
    return String(s == null ? '' : s)
      .replace(/(^|[\s(\[{\u2014\u2013\/-])"/g, '$1\u201C').replace(/"/g, '\u201D')
      .replace(/(^|[\s(\[{\u2014\u2013\/-])'/g, '$1\u2018').replace(/'/g, '\u2019');
  }
  // The same, applied only to the text between tags of a finished HTML string.
  function smartHtml(h) { return String(h).split(/(<[^>]*>)/).map(function (part, i) { return i % 2 ? part : smart(part); }).join(''); }

  // ------------------------------------------------------------------ sources
  function surnameOf(name) {
    var n = clean(name);
    if (!n) return '';
    if (n.indexOf(',') !== -1) return n.split(',')[0];
    var w = n.split(' ');
    return w.length > 1 && !/\b(Staff|Department|Ministry|Institute|University|Corporation|Council|Bureau|Service|Office|Agency|News|Organization|Press|Group|Center|Centre)\b/.test(n) ? w[w.length - 1] : w[0];
  }
  var STOP = /^(a|an|the|of|on|in|and|for|to|how|why|what|is|are|at|by|with)$/i;
  function keyFor(st, taken) {
    var who = surnameOf(lines(st.authors)[0] || st.publisher || st.location || '');
    var tw = clean(st.title).replace(/["“”]/g, '').split(/[\s:]+/).filter(function (w) { return w && !STOP.test(w); })[0] || '';
    var base = slug((who ? who + '-' : '') + tw).split('-').slice(0, 4).join('-') || 'source';
    var k = base, n = 2;
    while (taken[k]) k = base + '-' + n++;
    taken[k] = 1;
    return k;
  }
  // Reads an OSINT Citation Generator list file into sources with short keys for citing.
  function importOsintList(text, existing) {
    if (!CITER) return { error: 'The OSINT citation engine is not loaded.' };
    var res = CITER.parseListFile(text, OSINT_TYPES, OSINT_KEYS);
    if (res.error) return { error: res.error };
    var taken = {}, have = {};
    var texts = {};
    (existing || []).forEach(function (s) { taken[s.key] = 1; if (s.osintId) have[s.osintId] = s; if (s.kind === 'osint') texts[sourceLabel(s)] = 1; });
    var added = [], skipped = 0;
    res.items.forEach(function (it) {
      var label = sourceLabel({ kind: 'osint', st: it.st });
      if (have[it.id] || texts[label]) { skipped++; return; }
      texts[label] = 1;
      added.push({ key: keyFor(it.st, taken), kind: 'osint', osintId: it.id, st: it.st });
    });
    return { name: res.name, sources: added, skipped: skipped };
  }
  function sourceLabel(src) {
    if (src.kind === 'osint' && CITER) return CITER.toPlain(CITER.build(Object.assign({}, src.st, { locator: '' })).seg);
    return clean(src.full);
  }
  // A locator added before the closing period of a typed citation.
  function withLocator(text, loc) {
    var t = clean(text);
    if (!loc) return t;
    if (/\.["\u201D]$/.test(t)) return t.replace(/\.(["\u201D])$/, ',$1') + ' ' + loc + '.';
    return t.replace(/\.$/, '') + ', ' + loc + '.';
  }
  function citeHtml(src, loc, first) {
    if (src.kind === 'osint' && CITER) {
      var st = Object.assign({}, src.st, { locator: loc || '' });
      var seg = first ? CITER.build(st).seg : CITER.shortForms(st).short;
      return smartHtml(CITER.toHTML(seg));
    }
    var raw = first || !clean(src.short) ? src.full : src.short;
    return fmtText(withLocator(raw, loc && CITER ? CITER.normLocator(loc) : loc));
  }

  // ------------------------------------------------------------------ inline text with notes and citations
  // ^[note text] is a footnote; [@key, p. 4; @other] cites sources in a footnote of their own,
  // or inline when it sits inside a note.
  function matching(s, i) {
    var depth = 0;
    for (var j = i; j < s.length; j++) {
      if (s[j] === '[') depth++;
      else if (s[j] === ']') { depth--; if (depth === 0) return j; }
    }
    return -1;
  }
  function parseCites(inner) {
    return inner.split(';').map(function (part) {
      var m = part.match(/^\s*(.*?)@([A-Za-z0-9][\w.:-]*)\s*,?\s*(.*?)\s*$/);
      return m ? { prefix: m[1], key: m[2].replace(/[.:]$/, ''), loc: m[3] } : { text: clean(part) };
    });
  }
  function inline(text, ctx, inNote) {
    var s = String(text == null ? '' : text), out = '', buf = '', i = 0;
    function flush() { if (buf) { out += fmtText(buf); buf = ''; } }
    while (i < s.length) {
      if (!inNote && s[i] === '^' && s[i + 1] === '[') {
        var end = matching(s, i + 1);
        if (end > 0) { buf = buf.replace(/\s+$/, ''); flush(); out += ctx.note(inline(s.slice(i + 2, end), ctx, true)); i = end + 1; continue; }
      }
      if (s[i] === '[' && s[i + 1] === '@') {
        var e2 = s.indexOf(']', i);
        if (e2 > 0) {
          if (!inNote) buf = buf.replace(/\s+$/, '');
          flush();
          var html = ctx.cite(parseCites(s.slice(i + 1, e2)));
          i = e2 + 1;
          if (inNote) {
            // The note's own punctuation follows: drop the citation's final period, or, after a
            // closing quotation mark (."), drop the period typed after the brackets instead.
            if (/\.$/.test(html)) html = html.replace(/\.$/, '');
            else if (/\.\u201D$/.test(html.replace(/<[^>]+>/g, '')) && s[i] === '.') i++;
            out += html;
          } else out += ctx.note(html);
          continue;
        }
      }
      buf += s[i++];
    }
    flush();
    return out;
  }

  // ------------------------------------------------------------------ blocks
  // # section, ## subsection, ### minor heading, > quotation, !> key point, >> margin note,
  // - bullets, 1. numbers, {R1} labeled item, [[visual-id]], [[rating-key]], --- new page.
  function blocks(md) {
    var out = [], para = [], last = null;
    function flush() { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } last = null; }
    String(md || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var line = raw.trim(), m;
      if (!line) { flush(); return; }
      if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { flush(); out.push({ t: 'h', level: m[1].length, text: m[2] }); return; }
      if ((m = line.match(/^\[\[\s*([\w.-]+)\s*\]\]$/))) { flush(); out.push({ t: 'visual', id: m[1] }); return; }
      if (/^-{3,}$/.test(line)) { flush(); out.push({ t: 'break' }); return; }
      var kinds = [[/^!>\s?(.*)$/, 'key'], [/^>>\s?(.*)$/, 'side'], [/^>\s?(.*)$/, 'quote']];
      for (var k = 0; k < kinds.length; k++) {
        if ((m = line.match(kinds[k][0]))) {
          if (para.length) flush();
          if (last && last.t === kinds[k][1]) last.text += ' ' + m[1];
          else { last = { t: kinds[k][1], text: m[1] }; out.push(last); }
          return;
        }
      }
      if ((m = line.match(/^[-*•]\s+(.+)$/)) || (m = line.match(/^(\d+)[.)]\s+(.+)$/))) {
        var ordered = m.length === 3, item = ordered ? m[2] : m[1];
        if (para.length) flush();
        var t = ordered ? 'ol' : 'ul';
        if (last && last.t === t) last.items.push(item);
        else { last = { t: t, items: [item], start: ordered ? +m[1] : 1 }; out.push(last); }
        return;
      }
      if ((m = line.match(/^\{([^}]{1,24})\}\s*(.*)$/))) {
        if (para.length) flush();
        if (last && last.t === 'labeled') last.items.push({ label: m[1], text: m[2] });
        else { last = { t: 'labeled', items: [{ label: m[1], text: m[2] }] }; out.push(last); }
        return;
      }
      if (last && (last.t === 'ul' || last.t === 'ol')) { last.items[last.items.length - 1] += ' ' + line; return; }
      if (last && last.t === 'labeled') { last.items[last.items.length - 1].text += ' ' + line; return; }
      if (last) last = null;
      para.push(line);
    });
    flush();
    return out;
  }

  // ------------------------------------------------------------------ data for visuals
  function parseNumber(s) {
    var t = clean(s).replace(/[,\s$€£¥]/g, '').replace(/%$/, '');
    return /^[-+−]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t.replace('−', '-')) : null;
  }
  function splitRow(line, d) {
    if (d === '|') return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(clean);
    if (d === '\t') return line.split('\t').map(clean);
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === d) { out.push(clean(cur)); cur = ''; }
      else cur += c;
    }
    out.push(clean(cur));
    return out;
  }
  // Pasted CSV, tab-separated (from a spreadsheet), or a Markdown table. A first row with
  // words where the numbers go is a header.
  function parseData(text, header) {
    var rows = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() && !/^\s*\|?\s*:?-{2,}/.test(l); });
    if (!rows.length) return { head: null, rows: [] };
    var f = rows[0], d = f.indexOf('\t') !== -1 ? '\t' : /^\s*\|/.test(f) ? '|' : (f.indexOf(';') !== -1 && f.indexOf(',') === -1) ? ';' : ',';
    var cells = rows.map(function (r) { return splitRow(r, d); });
    var head = null;
    if (header === true && cells.length > 1) head = cells.shift();
    else if (header === undefined && cells.length > 1 && cells[0].slice(1).some(function (c) { return c && parseNumber(c) === null; }) && cells[1].slice(1).some(function (c) { return parseNumber(c) !== null; })) head = cells.shift();
    return { head: head, rows: cells };
  }
  function series(data) {
    var n = Math.max.apply(null, data.rows.map(function (r) { return r.length; }).concat([2])) - 1, out = [];
    for (var j = 1; j <= n; j++) out.push({ name: data.head ? data.head[j] || '' : '', values: data.rows.map(function (r) { return parseNumber(r[j]); }) });
    return out.filter(function (s) { return s.values.some(function (v) { return v !== null; }); });
  }
  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    var a = Math.abs(v), dp = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    var s = v.toFixed(dp).replace(/\.0+$|(\.\d*?)0+$/, '$1');
    var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.').replace(/^-/, '−');
  }
  function niceStep(range, target) {
    var raw = range / target, e = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function scale(min, max) {
    if (min === max) { max = max === 0 ? 1 : max * 1.1; min = Math.min(0, min); }
    var step = niceStep(max - min, 4), lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  // ------------------------------------------------------------------ charts (SVG)
  var INK = '#15181B', GRAY = '#565C61', RULE = '#C2C6BF';
  function svgText(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + ' font-family="' + (o.serif ? 'IBM Plex Serif' : 'IBM Plex Mono') + ', serif" font-size="' + (o.size || 11) + '"'
      + (o.bold ? ' font-weight="700"' : '') + ' fill="' + (o.fill || GRAY) + '">' + esc(s) + '</text>';
  }
  function trunc(s, n) { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function palette(accent) { return [INK, accent, '#8A9096', '#7A3B2E']; }
  function legend(ss, accent, W) {
    if (ss.length < 2) return { svg: '', h: 0 };
    var x = 0, out = '', pal = palette(accent);
    ss.forEach(function (s, i) {
      out += '<rect x="' + x + '" y="2" width="14" height="4" fill="' + pal[i % 4] + '"/>' + svgText(x + 20, 9, trunc(s.name || 'Series ' + (i + 1), 28), { fill: INK });
      x += 34 + Math.min(28, (s.name || 'Series 1').length) * 6.6;
    });
    return { svg: out, h: 22 };
  }
  function chartSvg(v, accent) {
    var data = parseData(v.data), ss = series(data), W = 512, kind = v.kind;
    var labels = data.rows.map(function (r) { return r[0] || ''; });
    if (!ss.length || !labels.length) return '<div class="vempty">Paste data under Data to draw this chart.</div>';
    var hl = clean(v.highlight).toLowerCase(), pal = palette(accent), lg = legend(ss, accent, W);
    var all = []; ss.forEach(function (s) { s.values.forEach(function (x) { if (x !== null) all.push(x); }); });
    var sc = scale(Math.min(0, Math.min.apply(null, all)), Math.max(0, Math.max.apply(null, all)));
    var out = [], H, top = lg.h + 8;
    if (kind === 'hbar') {
      var rowH = ss.length > 1 ? 14 * ss.length + 10 : 26, lw = 150, cw = W - lw - 48;
      H = top + labels.length * rowH + 26;
      var hx = function (x) { return lw + (x - sc.lo) / (sc.hi - sc.lo) * cw; };
      sc.ticks.forEach(function (t) { out.push('<line x1="' + hx(t).toFixed(1) + '" x2="' + hx(t).toFixed(1) + '" y1="' + top + '" y2="' + (H - 22) + '" stroke="' + RULE + '" stroke-width="0.75"/>' + svgText(hx(t), H - 8, fmtNum(t), { anchor: 'middle' })); });
      labels.forEach(function (lab, i) {
        var y0 = top + i * rowH + 4, hot = hl && lab.toLowerCase() === hl;
        out.push(svgText(lw - 8, y0 + (rowH - 8) / 2 + 4, trunc(lab, 24), { anchor: 'end', serif: true, size: 12, fill: hot ? accent : INK, bold: hot }));
        ss.forEach(function (s, j) {
          var val = s.values[i]; if (val === null) return;
          var bh = ss.length > 1 ? 12 : rowH - 10, y = y0 + j * (bh + 2), x0 = hx(Math.max(0, sc.lo)), x1 = hx(val);
          out.push('<rect x="' + Math.min(x0, x1).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, Math.abs(x1 - x0)).toFixed(1) + '" height="' + bh + '" fill="' + (ss.length > 1 ? pal[j % 4] : hot ? accent : INK) + '"/>');
          out.push(svgText(Math.max(x0, x1) + 4, y + bh / 2 + 4, fmtNum(val), { fill: hot ? accent : INK }));
        });
      });
      out.push('<line x1="' + hx(Math.max(0, sc.lo)).toFixed(1) + '" x2="' + hx(Math.max(0, sc.lo)).toFixed(1) + '" y1="' + top + '" y2="' + (H - 22) + '" stroke="' + INK + '" stroke-width="1"/>');
    } else {
      H = top + 260 + 30;
      var L = 44, R = 8, ch = 260, cw2 = W - L - R, n = labels.length;
      var y = function (val) { return top + ch - (val - sc.lo) / (sc.hi - sc.lo) * ch; };
      sc.ticks.forEach(function (t) { out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="' + RULE + '" stroke-width="0.75"/>' + svgText(L - 6, y(t) + 4, fmtNum(t), { anchor: 'end' })); });
      var every = Math.ceil(n / 12), band = cw2 / n;
      labels.forEach(function (lab, i) {
        if (i % every && i !== n - 1) return;
        var hot = hl && lab.toLowerCase() === hl;
        out.push(svgText(L + band * (i + 0.5), top + ch + 16, trunc(lab, Math.max(4, Math.floor(band * every / 7))), { anchor: 'middle', fill: hot ? accent : GRAY, bold: hot }));
      });
      if (kind === 'line') {
        ss.forEach(function (s, j) {
          var pts = [], col = pal[j % 4];
          s.values.forEach(function (val, i) { if (val !== null) pts.push([L + band * (i + 0.5), y(val), val, i]); });
          out.push('<polyline fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>');
          var lastP = pts[pts.length - 1];
          if (lastP) out.push('<circle cx="' + lastP[0].toFixed(1) + '" cy="' + lastP[1].toFixed(1) + '" r="3" fill="' + col + '"/>' + svgText(Math.min(lastP[0], W - 30), lastP[1] - 8, fmtNum(lastP[2]), { anchor: 'middle', fill: col, bold: true }));
          pts.forEach(function (p) { if (hl && labels[p[3]].toLowerCase() === hl) out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + accent + '"/>' + svgText(p[0], p[1] - 9, fmtNum(p[2]), { anchor: 'middle', fill: accent, bold: true })); });
        });
      } else {
        var gw = band * 0.7, bw = gw / ss.length;
        labels.forEach(function (lab, i) {
          var hot = hl && lab.toLowerCase() === hl;
          ss.forEach(function (s, j) {
            var val = s.values[i]; if (val === null) return;
            var x = L + band * i + (band - gw) / 2 + j * bw, y0 = y(Math.max(0, sc.lo)), y1 = y(val);
            out.push('<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + Math.max(1, bw - (ss.length > 1 ? 1 : 0)).toFixed(1) + '" height="' + Math.max(1, Math.abs(y1 - y0)).toFixed(1) + '" fill="' + (ss.length > 1 ? pal[j % 4] : hot ? accent : INK) + '"/>');
            if (ss.length === 1 && n <= 12) out.push(svgText(x + bw / 2, Math.min(y0, y1) - 5, fmtNum(val), { anchor: 'middle', fill: hot ? accent : INK, bold: hot }));
          });
        });
      }
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(Math.max(0, sc.lo)).toFixed(1) + '" y2="' + y(Math.max(0, sc.lo)).toFixed(1) + '" stroke="' + INK + '" stroke-width="1"/>');
      out.push('<line x1="' + L + '" x2="' + L + '" y1="' + top + '" y2="' + (top + ch) + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(clean(v.title) || 'Chart') + '">' + lg.svg + out.join('') + '</svg>';
  }
  function tableHtml(v, ctx) {
    var data = parseData(v.data, !v.noHeader);
    if (!data.rows.length) return '<div class="vempty">Paste the table under Data.</div>';
    var cols = Math.max.apply(null, data.rows.map(function (r) { return r.length; }).concat(data.head ? [data.head.length] : []));
    var num = []; for (var c = 0; c < cols; c++) num.push(c > 0 && data.rows.every(function (r) { return !r[c] || parseNumber(r[c]) !== null || /^[\d\s–-]+$/.test(r[c]); }));
    var hl = clean(v.highlight).toLowerCase();
    var cell = function (s) { return inline(s, ctx, true); };
    var h = '<table class="dtable">';
    if (data.head) h += '<thead><tr>' + data.head.map(function (x, c) { return '<th' + (num[c] ? ' class="n"' : '') + '>' + cell(x) + '</th>'; }).join('') + '</tr></thead>';
    h += '<tbody>' + data.rows.map(function (r) {
      var hot = hl && clean(r[0]).toLowerCase() === hl;
      var row = []; for (var c2 = 0; c2 < cols; c2++) row.push('<td' + (num[c2] ? ' class="n"' : '') + '>' + cell(r[c2] || '') + '</td>');
      return '<tr' + (hot ? ' class="hot"' : '') + '>' + row.join('') + '</tr>';
    }).join('') + '</tbody></table>';
    return h;
  }
  // "March 3, 2022, What happened": the date runs to its year; "1,200, What it measures": the
  // number keeps its thousands separators. Otherwise a tab, or the first comma, divides the line.
  function splitLead(line, kind) {
    var l = clean(line), m;
    if (l.indexOf('\t') !== -1 || /\t/.test(line)) { var t = String(line).split('\t'); return [clean(t[0]), clean(t.slice(1).join(' '))]; }
    if (kind === 'timeline' && (m = l.match(/^(.*?\b\d{3,4}s?\b(?:\s*(?:BC|BCE|AD|CE))?)\s*[,:\u2013\u2014-]\s*(.+)$/))) return [m[1], m[2]];
    if (kind === 'stats' && (m = l.match(/^((?:[^,\s]|,(?=\d{3}(?!\d)))+)\s*,\s*(.+)$/))) return [m[1], m[2]];
    var i = l.indexOf(',');
    return i === -1 ? [l, ''] : [clean(l.slice(0, i)), clean(l.slice(i + 1))];
  }
  function leadRows(text, kind) { return String(text || '').split(/\r?\n/).filter(function (x) { return x.trim(); }).map(function (x) { return splitLead(x, kind); }); }
  function timelineHtml(v, ctx) {
    var rows = leadRows(v.data, 'timeline');
    if (!rows.length) return '<div class="vempty">Add one event per line: date, then what happened.</div>';
    return '<ol class="timeline">' + rows.map(function (r) {
      return '<li><span class="when">' + fmtText(r[0]) + '</span><span class="what">' + inline(r[1], ctx, true) + '</span></li>';
    }).join('') + '</ol>';
  }
  function statsHtml(v, ctx) {
    var rows = leadRows(v.data, 'stats');
    if (!rows.length) return '<div class="vempty">Add one number per line: the number, then what it measures.</div>';
    return '<div class="stats" style="grid-template-columns: repeat(' + Math.min(4, rows.length) + ', minmax(0, 1fr))">' + rows.slice(0, 4).map(function (r) {
      return '<div class="stat"><div class="big">' + fmtText(r[0]) + '</div><div class="what">' + inline(r[1], ctx, true) + '</div></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ the paper
  function defaults() {
    return {
      meta: {
        series: 'White paper series', masthead: 'White Paper', tagline: 'Cybersecurity\nGeopolitics\nMilitary affairs',
        number: '001', date: '', version: '1.0', versionNote: 'first edition', title: '', subtitle: '', author: '', shortTitle: '',
        publisher: 'Ryan McBeth', site: 'ryanmcbeth.substack.com', url: '', accent: '#C42A14', paper: 'tinted', coverImage: '', coverCaption: '', sectionBreaks: true
      },
      summary: { lead: '', findings: '', recommendations: '' },
      aboutSeries: '',
      body: '', appendix: '',
      back: { include: true, bio: '', history: '', series: '', license: '' },
      visuals: [], sources: []
    };
  }
  function normalize(doc) {
    var d = defaults();
    doc = doc && typeof doc === 'object' ? doc : {};
    ['meta', 'summary', 'back'].forEach(function (k) {
      var src = doc[k] && typeof doc[k] === 'object' ? doc[k] : {};
      Object.keys(d[k]).forEach(function (f) { if (typeof src[f] === typeof d[k][f]) d[k][f] = src[f]; });
    });
    ['aboutSeries', 'body', 'appendix'].forEach(function (k) { if (typeof doc[k] === 'string') d[k] = doc[k]; });
    if (Array.isArray(doc.visuals)) d.visuals = doc.visuals.filter(function (v) { return v && typeof v.id === 'string' && VISUAL_KINDS[v.kind]; }).map(function (v) {
      return { id: v.id.slice(0, 60), kind: v.kind, title: String(v.title || ''), subtitle: String(v.subtitle || ''), source: String(v.source || ''), note: String(v.note || ''),
        data: String(v.data || ''), highlight: String(v.highlight || ''), image: safeImage(v.image), wide: !!v.wide, noHeader: !!v.noHeader };
    });
    if (Array.isArray(doc.sources)) d.sources = doc.sources.filter(function (s) { return s && typeof s.key === 'string' && s.key; }).map(function (s) {
      if (s.kind === 'osint' && s.st && typeof s.st === 'object') {
        var st = {}; OSINT_KEYS.forEach(function (k) { st[k] = typeof s.st[k] === 'string' ? s.st[k] : ''; });
        st.type = OSINT_TYPES.indexOf(s.st.type) !== -1 ? s.st.type : 'web';
        st.access = Array.isArray(s.st.access) ? s.st.access.filter(function (x) { return typeof x === 'string'; }) : [];
        st.quals = Array.isArray(s.st.quals) ? s.st.quals.filter(function (x) { return typeof x === 'string'; }) : [];
        st.shortUseTitle = s.st.shortUseTitle !== false;
        return { key: s.key.slice(0, 60), kind: 'osint', osintId: String(s.osintId || ''), st: st };
      }
      return { key: s.key.slice(0, 60), kind: 'typed', full: String(s.full || ''), short: String(s.short || '') };
    });
    return d;
  }

  function render(input) {
    var doc = normalize(input), m = doc.meta, accent = /^#[0-9a-f]{6}$/i.test(m.accent) ? m.accent : '#C42A14';
    var problems = [], notes = 0, srcByKey = {}, seen = {}, usedKeys = {};
    doc.sources.forEach(function (s) { srcByKey[s.key] = s; });
    var visById = {}; doc.visuals.forEach(function (v) { visById[v.id] = v; });
    function problem(level, msg, where) { if (!problems.some(function (p) { return p.msg === msg; })) problems.push({ level: level, msg: msg, where: where || '' }); }
    var ctx = {
      note: function (html) { notes++; return '<span class="fn"><span class="fn-n">' + notes + '</span> ' + html + '</span><sup class="fn-call">' + notes + '</sup>'; },
      cite: function (list) {
        return list.map(function (c, n) {
          if (c.text !== undefined) return fmtText(c.text);
          var src = srcByKey[c.key];
          if (!src) { problem('fix', 'No source has the key @' + c.key + '. Check the spelling, or open the list file that has it under Sources.', 'sources'); return '<span class="missing">[@' + esc(c.key) + ']</span>'; }
          usedKeys[c.key] = 1;
          var first = !seen[c.key]; seen[c.key] = 1;
          var h = citeHtml(src, c.loc, first);
          if (n < list.length - 1) h = h.replace(/\.(\u201D)?$/, '$1');
          return (c.prefix ? fmtText(c.prefix) : '') + h;
        }).join('; ');
      }
    };
    var figs = [], figN = 0, tabN = 0, appTabN = 0, appFigN = 0, usedVis = {}, toc = [];
    function visualHtml(id, inAppendix, sectionLetter) {
      var v = visById[id];
      if (id === 'rating-key') return ratingKey(inAppendix ? (sectionLetter || 'A') + (++appTabN) : String(++tabN));
      if (!v) { problem('fix', 'There is no visual called [[' + id + ']]. Check its name under Visuals.', 'visuals'); return '<p class="missing">[[' + esc(id) + ']]</p>'; }
      usedVis[id] = 1;
      var kind = VISUAL_KINDS[v.kind], label = '', anchor = 'v-' + slug(id);
      if (kind.fig === 'figure') label = 'Figure ' + (inAppendix ? (sectionLetter || 'A') + (++appFigN) : ++figN);
      else if (kind.fig === 'table') label = 'Table ' + (inAppendix ? (sectionLetter || 'A') + (++appTabN) : ++tabN);
      if (label && clean(v.title)) figs.push({ label: label, title: v.title, anchor: anchor });
      if (label && !clean(v.source) && v.kind !== 'image') problem('check', label + ' (' + (clean(v.title) || id) + ') has no source line. Say where the data comes from.', 'visuals');
      if (v.kind === 'stats' && leadRows(v.data, 'stats').length > 4) problem('check', 'Key numbers ([[' + id + ']]) shows only the first four lines.', 'visuals');
      if (label && v.kind === 'image' && !v.image) problem('fix', label + ' (' + (clean(v.title) || id) + ') has no image yet.', 'visuals');
      var bodyH = v.kind === 'table' ? tableHtml(v, ctx) : v.kind === 'timeline' ? timelineHtml(v, ctx) : v.kind === 'stats' ? statsHtml(v, ctx)
        : v.kind === 'image' ? (v.image ? '<img class="vimg" src="' + v.image + '" alt="' + esc(clean(v.title)) + '">' : '<div class="vempty">Choose an image file under Visuals.</div>')
        : chartSvg(v, accent);
      if (v.kind === 'stats') return '<div class="vis stats-wrap" id="' + anchor + '">' + (clean(v.title) ? '<h4 class="stats-title">' + fmtText(v.title) + '</h4>' : '') + bodyH + (clean(v.source) ? '<div class="stats-src">' + inline(v.source, ctx, true) + '</div>' : '') + '</div>';
      return '<figure class="vis vis-' + v.kind + (v.wide ? ' wide' : '') + '" id="' + anchor + '">'
        + '<figcaption class="gut">' + (label ? '<div class="vlabel">' + label + '</div>' : '') + (clean(v.source) ? '<div class="vsrc">' + inline(v.source, ctx, true) + '</div>' : '') + (clean(v.note) ? '<div class="vnote">' + inline(v.note, ctx, true) + '</div>' : '') + '</figcaption>'
        + '<div class="vbody">' + (clean(v.title) ? '<h4 class="vtitle">' + fmtText(v.title) + '</h4>' : '') + (clean(v.subtitle) ? '<div class="vsub">' + fmtText(v.subtitle) + '</div>' : '') + bodyH + '</div></figure>';
    }
    function ratingKey(n) {
      var label = 'Table ' + n;
      figs.push({ label: label, title: 'Source rating key', anchor: 'v-rating-key' });
      var rows = function (list) { return list.map(function (r) { return '<tr><td class="code">' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join(''); };
      return '<figure class="vis vis-table rating" id="v-rating-key"><figcaption class="gut"><div class="vlabel">' + label + '</div><div class="vsrc">Admiralty system, as used in the OSINT Style Guide.</div></figcaption><div class="vbody">'
        + '<h4 class="vtitle">Source rating key</h4><div class="ratings"><table class="dtable"><thead><tr><th>Code</th><th>Reliability of source</th></tr></thead><tbody>' + rows(RATING_KEY.rel) + '</tbody></table>'
        + '<table class="dtable"><thead><tr><th>Code</th><th>Credibility of information</th></tr></thead><tbody>' + rows(RATING_KEY.cred) + '</tbody></table></div>'
        + '<p class="rnote">A note may carry a two-character rating: a letter for the reliability of the source and a number for the credibility of the information. B2 means a usually reliable source reporting information that is probably true.</p></div></figure>';
    }

    // Body and appendix share one renderer; the appendix numbers A, A.1.
    function flow(md, appendix) {
      var bs = blocks(md), out = [], sec = 0, sub = 0, pendingSide = '', letterNow = '';
      bs.forEach(function (b) {
        var side = pendingSide; pendingSide = '';
        var sideHtml = side ? '<aside class="side">' + side + '</aside>' : '';
        if (b.t === 'h') {
          var text = inline(b.text, ctx, false), plain = plainText(b.text);
          if (b.level === 1) {
            sec++; sub = 0;
            var num = appendix ? letter(sec - 1) : String(sec), id = (appendix ? 'app-' : 'sec-') + num;
            letterNow = num;
            if (appendix) { appTabN = 0; appFigN = 0; }
            var runLabel = appendix ? 'Appendix ' + num : num + ' ' + plain;
            toc.push({ level: 1, num: num, title: appendix ? 'Appendix ' + num + ': ' + plain : plain, anchor: id });
            out.push('<h2 class="sec' + (m.sectionBreaks ? ' brk' : '') + '" id="' + id + '" data-run="' + esc(runLabel) + '"><span class="num">' + num + '</span>' + (appendix ? '<span class="pre">Appendix ' + num + '</span>' : '') + '<span class="t">' + text + '</span></h2>');
          } else if (b.level === 2) {
            sub++;
            var n2 = (sec ? (appendix ? letter(sec - 1) : sec) + '.' : '') + sub, id2 = (appendix ? 'app-' : 'sec-') + (sec ? n2.replace('.', '-') : '0-' + sub);
            toc.push({ level: 2, num: n2, title: plain, anchor: id2 });
            out.push('<h3 class="sub" id="' + id2 + '"><span class="num">' + n2 + '</span>' + text + '</h3>');
          } else out.push('<h4 class="minor">' + text + '</h4>');
          if (sideHtml) out.push(sideHtml);
          return;
        }
        if (b.t === 'side') { pendingSide = inline(b.text, ctx, false); return; }
        if (b.t === 'break') { out.push('<div class="pagebreak"></div>'); return; }
        if (b.t === 'visual') { out.push(sideHtml + visualHtml(b.id, appendix, letterNow)); return; }
        if (b.t === 'p') { out.push(sideHtml + '<p>' + inline(b.text, ctx) + '</p>'); return; }
        if (b.t === 'quote') { out.push(sideHtml + '<blockquote>' + inline(b.text, ctx) + '</blockquote>'); return; }
        if (b.t === 'key') { out.push('<div class="keypoint"><div class="gut">Key point</div><div class="kp">' + inline(b.text, ctx) + '</div></div>'); return; }
        if (b.t === 'ul' || b.t === 'ol') { out.push(sideHtml + '<' + b.t + (b.t === 'ol' && b.start !== 1 ? ' start="' + b.start + '"' : '') + '>' + b.items.map(function (x) { return '<li>' + inline(x, ctx) + '</li>'; }).join('') + '</' + b.t + '>'); return; }
        if (b.t === 'labeled') { out.push(sideHtml + '<div class="labeled">' + b.items.map(function (x) { return '<div class="li"><div class="gut">' + fmtText(x.label) + '</div><div class="lt">' + inline(x.text, ctx) + '</div></div>'; }).join('') + '</div>'); return; }
      });
      if (pendingSide) out.push('<aside class="side">' + pendingSide + '</aside>');
      return out.join('\n');
    }

    var title = clean(m.title) || 'Untitled paper', shortTitle = clean(m.shortTitle) || title;
    if (!clean(m.title)) problem('fix', 'The paper has no title yet. Fill it in under Paper.', 'paper');
    if (!clean(m.author)) problem('check', 'No author is given. Fill it in under Paper.', 'paper');
    if (!clean(m.date)) problem('check', 'No date is given for the cover. Fill it in under Paper.', 'paper');
    if (clean(m.title) && words(m.title) > 12) problem('note', 'The template suggests a title of about ten words or fewer.', 'paper');

    // Summary first: its notes and first citations come before the body's.
    var sum = doc.summary, sumHtml = '';
    var findings = lines(sum.findings), recs = lines(sum.recommendations), hasSummary = clean(sum.lead) || findings.length || recs.length;
    if (hasSummary) {
      sumHtml = '<section class="summary' + (m.sectionBreaks ? '' : ' endbreak') + '"><h2 class="front" id="summary" data-run="Executive summary">Executive summary</h2>'
        + (clean(sum.lead) ? String(sum.lead).split(/\n\s*\n/).map(function (p) { return '<p class="lead">' + inline(p.replace(/\n/g, ' '), ctx) + '</p>'; }).join('') : '')
        + (findings.length ? '<h3 class="plain">Key findings</h3><div class="findings">' + findings.map(function (f, i) { return '<div class="finding"><div class="gut">' + pad2(i + 1) + '</div><div class="ft">' + inline(f, ctx) + '</div></div>'; }).join('') + '</div>' : '')
        + (recs.length ? '<h3 class="plain">Recommendations</h3><div class="recs">' + recs.map(function (r, i) { return '<div class="rec"><div class="gut">R' + (i + 1) + '</div><div class="rt">' + inline(r, ctx) + '</div></div>'; }).join('') + '</div>' : '')
        + '</section>';
      if (words(sum.lead) + words(sum.findings) + words(sum.recommendations) > 450) problem('check', 'The executive summary runs past one page (about 300 words is the target).', 'summary');
      if (findings.length > 5) problem('note', 'More than five key findings. Three is the template\'s target.', 'summary');
    } else problem('check', 'The executive summary is empty.', 'summary');

    var bodyHtml = flow(doc.body, false);
    if (!clean(doc.body)) problem('fix', 'The body is empty.', 'body');
    var appHtml = clean(doc.appendix) ? flow(doc.appendix, true) : '';
    doc.visuals.forEach(function (v) { if (!usedVis[v.id]) problem('note', 'The visual [[' + v.id + ']] is not placed in the text yet.', 'visuals'); });
    doc.sources.forEach(function (s) { if (!usedKeys[s.key]) problem('note', 'Source @' + s.key + ' is not cited.', 'sources'); });

    // Cover.
    var tag = lines(m.tagline).slice(0, 4), mast = clean(m.masthead);
    // The masthead fills the width left by the topic list: Plex Mono is 0.6 em a character, plus tracking.
    var mastSize = Math.max(40, Math.min(168, Math.floor((tag.length ? 500 : 676) / (Math.max(4, mast.length) * 0.62))));
    var dateTxt = clean(m.date), ver = clean(m.version) + (clean(m.versionNote) ? ' · ' + clean(m.versionNote) : '');
    var cover = '<section class="cover">'
      + '<div class="cv-top"><div class="b">' + esc(clean(m.series)) + '</div><div class="r">' + (dateTxt ? '<span>' + esc(dateTxt) + '</span>' : '') + '<span class="tag">WP-' + esc(clean(m.number) || '000') + '</span></div></div>'
      + (mast ? '<div class="cv-mast"><div class="word" style="font-size:' + mastSize + 'px">' + esc(mast) + '</div>' + (tag.length ? '<div class="topics">' + tag.map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('') + '</div>' : '') + '</div>' : '')
      + '<div class="cv-rule"><span></span><i></i></div>'
      + '<div class="cv-no">White paper No. ' + esc(clean(m.number) || '000') + '</div>'
      + '<h1 class="cv-title">' + fmtText(title) + '</h1>'
      + (clean(m.subtitle) ? '<div class="cv-sub">' + fmtText(m.subtitle) + '</div>' : '')
      + '<div class="cv-meta">' + (clean(m.author) ? '<div><div class="k">Author</div><div class="v">' + fmtText(clean(m.author)) + '</div></div>' : '')
      + (clean(ver) ? '<div><div class="k">Version</div><div class="v">' + esc(ver) + '</div></div>' : '')
      + '<div><div class="k">Length</div><div class="v"><span class="cover-length">—</span> pages</div></div></div>'
      + (m.coverImage && safeImage(m.coverImage) ? '<figure class="cv-img"><img src="' + safeImage(m.coverImage) + '" alt="">' + (clean(m.coverCaption) ? '<figcaption>' + fmtText(m.coverCaption) + '</figcaption>' : '') + '</figure>' : '')
      + '<div class="cv-foot"><div>' + (clean(m.publisher) ? 'Published by <b>' + esc(clean(m.publisher)) + '</b>' : '') + '</div><div>' + esc(clean(m.site)) + '</div></div>'
      + '</section>';

    // Back page.
    var b = doc.back, backHtml = '';
    if (b.include) {
      var hist = lines(b.history).map(function (l) { return l.split('|').map(clean); });
      var ser = lines(b.series).map(function (l) { return l.split('|').map(clean); });
      var cite = (clean(m.author) ? fmtText(invertName(m.author)) + '. ' : '') + '“' + fmtText(title) + '.” <i>White Paper</i> No. ' + esc(clean(m.number) || '000') + ', version ' + esc(clean(m.version) || '1.0') + '. '
        + (clean(m.publisher) ? esc(clean(m.publisher)) + ', ' : '') + esc(dateTxt || 'n.d.') + '.' + (safeUrl(m.url) ? ' ' + esc(safeUrl(m.url)) + '.' : (clean(m.site) ? ' ' + esc(clean(m.site)) + '.' : ''));
      backHtml = '<section class="back"><h2 class="front" id="about" data-run="About this paper">About this paper</h2>'
        + (clean(m.author) || clean(b.bio) ? '<div class="brow"><div class="gut">Author</div><div class="bt"><b>' + fmtText(clean(m.author)) + '</b>' + (clean(b.bio) ? ' ' + inline(b.bio, ctx, false) : '') + '</div></div>' : '')
        + '<div class="brow"><div class="gut">Cite as</div><div class="bt">' + cite + '</div></div>'
        + (hist.length ? '<div class="brow"><div class="gut">Version history</div><div class="bt"><table class="dtable"><thead><tr><th>Version</th><th>Date</th><th>Change</th></tr></thead><tbody>' + hist.map(function (r) { return '<tr><td class="code">' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') + '</td><td>' + fmtText(r[2] || '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '')
        + (ser.length ? '<div class="brow"><div class="gut">In this series</div><div class="bt series">' + ser.map(function (r) { return '<div class="sr"><span class="code">No. ' + esc(r[0] || '') + '</span><span class="st">' + fmtText(r[1] || '') + '</span><span class="sw">' + fmtText(r[2] || '') + '</span></div>'; }).join('') + '</div></div>' : '')
        + '<div class="colophon">' + (clean(m.series) ? '<div class="b">' + esc(clean(m.series)) + '</div>' : '') + (clean(m.publisher) ? '<div>Published by ' + esc(clean(m.publisher)) + '</div>' : '') + (clean(m.site) ? '<div>' + esc(clean(m.site)) + '</div>' : '')
        + (clean(b.license) ? '<div class="lic">' + fmtText(b.license) + '</div>' : '') + '</div>'
        + '</section>';
      toc.push({ level: 0, num: '', title: 'About this paper', anchor: 'about' });
    }

    // Contents, built last because it needs every heading and figure.
    var tocRows = (hasSummary ? [{ level: 0, num: '', title: 'Executive summary', anchor: 'summary' }] : []).concat(toc);
    var contents = '<section class="contents' + (!hasSummary && !m.sectionBreaks ? ' endbreak' : '') + '"><h2 class="front" id="contents" data-run="Contents">Contents</h2><ol class="toc">'
      + tocRows.map(function (r) { return '<li class="l' + r.level + '"><span class="num">' + esc(r.num) + '</span><a href="#' + r.anchor + '">' + esc(r.title) + '</a></li>'; }).join('') + '</ol>'
      + (figs.length ? '<div class="lof"><div class="gut">Figures and tables</div><ol>' + figs.map(function (f) { return '<li><span class="lab">' + esc(f.label.replace('Figure', 'Fig.')) + '</span><a href="#' + f.anchor + '">' + esc(clean(f.title)) + '</a></li>'; }).join('') + '</ol></div>' : '')
      + (clean(doc.aboutSeries) ? '<div class="series-box"><div class="sb-h">About the series</div>' + String(doc.aboutSeries).split(/\n\s*\n/).map(function (p) { return '<p>' + fmtText(p.replace(/\n/g, ' ')) + '</p>'; }).join('') + '</div>' : '')
      + '</section>';

    var vars = ':root{--wp-accent:' + accent + ';--wp-paper:' + (m.paper === 'white' ? '#FFFFFF' : '#F4F5F2') + ';}';
    // Header and footer: paper number and section above, short title and page count below.
    var box = 'font-family:"Plex Mono",monospace;font-size:12px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:#15181B;';
    var running = '@page{'
      + '@top-left{content:"' + cssStr('White paper No. ' + (clean(m.number) || '000')) + '";' + box + 'font-weight:700;vertical-align:bottom;padding-bottom:10px;border-bottom:1px solid #15181B;margin-bottom:36px;}'
      + '@top-right{content:string(section);' + box + 'vertical-align:bottom;padding-bottom:10px;border-bottom:1px solid #15181B;margin-bottom:36px;}'
      + '@bottom-left{content:"' + cssStr(shortTitle) + '";' + box + 'color:#565C61;vertical-align:top;padding-top:10px;border-top:1px solid #15181B;margin-top:28px;}'
      + '@bottom-right{content:counter(page, decimal-leading-zero) " / " counter(pages, decimal-leading-zero);' + box + 'vertical-align:top;padding-top:10px;border-top:1px solid #15181B;margin-top:28px;}'
      + '}';
    var html = '<div class="wp">' + cover + contents + sumHtml + '<section class="wp-body">' + bodyHtml + '</section>' + (appHtml ? '<section class="wp-appendix">' + appHtml + '</section>' : '') + backHtml + '</div>';
    return {
      html: html, vars: vars + running, problems: problems,
      stats: { notes: notes, words: words(doc.body) + words(doc.summary.lead) + words(doc.appendix), figures: figs.length, cited: Object.keys(usedKeys).length },
      runningLeft: 'White paper No. ' + (clean(m.number) || '000'), shortTitle: shortTitle
    };
  }
  // A heading as the contents and running head show it: no notes, citations, or markup.
  function plainText(s) {
    var t = String(s || ''), out = '', i = 0;
    while (i < t.length) {
      if ((t[i] === '^' && t[i + 1] === '[') || (t[i] === '[' && t[i + 1] === '@')) { var e = t[i] === '^' ? matching(t, i + 1) : t.indexOf(']', i); if (e > 0) { i = e + 1; continue; } }
      out += t[i++];
    }
    return smart(clean(out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|\*/g, '')));
  }
  function cssStr(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' '); }
  function invertName(name) {
    var n = clean(name);
    if (!n || /[,\[\]&]| and /.test(n)) return n;
    var w = n.split(' ');
    return w.length > 1 ? w[w.length - 1] + ', ' + w.slice(0, -1).join(' ') : n;
  }

  // ------------------------------------------------------------------ project files
  function projectFile(doc) { return JSON.stringify({ app: 'White Paper Builder', format: 1, savedAt: new Date().toISOString(), paper: normalize(doc) }, null, 1) + '\n'; }
  function parseProject(text) {
    var j;
    try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return { error: 'That file is not a White Paper Builder project: it could not be read.' }; }
    if (j && j.app === 'OSINT Citation Generator') return { error: 'That is an OSINT Citation Generator list file. Open it under Sources to cite from it.' };
    if (!j || typeof j !== 'object' || !j.paper || typeof j.paper !== 'object') return { error: 'That file is not a White Paper Builder project.' };
    return { doc: normalize(j.paper) };
  }

  return {
    useCiter: useCiter, defaults: defaults, normalize: normalize, render: render, blocks: blocks, inline: inline, parseData: parseData, parseNumber: parseNumber,
    chartSvg: chartSvg, plainText: plainText, splitLead: splitLead, importOsintList: importOsintList, keyFor: keyFor, sourceLabel: sourceLabel, projectFile: projectFile, parseProject: parseProject,
    VISUAL_KINDS: VISUAL_KINDS, MONTHS: MONTHS, slug: slug, words: words, invertName: invertName
  };
})();
if (typeof module !== 'undefined') module.exports = WP;
