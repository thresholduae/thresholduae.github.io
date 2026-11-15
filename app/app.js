/* Threshold: the Ad Decoder, the screens and the menus. The phrases themselves live in phrases.js. */
(function () {
  'use strict';

  var PHRASES = window.LD_PHRASES || [];
  var MISSING = window.LD_MISSING || [];
  var EXAMPLES = window.LD_EXAMPLES || {};
  var FLUFF_SRC = window.LD_FLUFF ? window.LD_FLUFF.source : 'stunning';

  var CFG = window.APP_CONFIG || {};
  var BRAND = CFG.brand || 'Threshold';

  var CAT = {
    scam:  { name: 'Scam warning sign', plural: 'Scam warning signs', color: 'var(--c-scam)',  ink: '#D9694F', rank: 4 },
    watch: { name: 'Watch out',         plural: 'Watch out',          color: 'var(--c-watch)', ink: '#DE9A54', rank: 3 },
    spin:  { name: 'Sales talk',        plural: 'Sales talk',         color: 'var(--c-spin)',  ink: '#E3C77E', rank: 2 },
    fact:  { name: 'Good sign',         plural: 'Good signs',         color: 'var(--c-fact)',  ink: '#9DB58A', rank: 1 },
    fluff: { name: 'Selling word',      plural: 'Selling words',      color: 'var(--c-fluff)', ink: '#B7A792', rank: 0 }
  };

  var SAVE_KEY = 'listingDecoder.saved.v1';
  var MODE_KEY = 'listingDecoder.mode';

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function store(key, value) {
    try {
      if (value === undefined) { return localStorage.getItem(key); }
      localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the app still works, it just cannot remember */ }
    return null;
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- the look (three earthy themes) ---------- */
  var THEME_KEY = 'pt.theme';
  var THEMES = { light: '#EEE8DB', dark: '#0F130E' };
  function setTheme(name, remember) {
    if (!THEMES[name]) { name = 'light'; }
    document.documentElement.setAttribute('data-theme', name);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', THEMES[name]); }
    if (remember) { store(THEME_KEY, name); }
    var picks = document.querySelectorAll('[data-theme-pick]');
    for (var i = 0; i < picks.length; i++) {
      picks[i].setAttribute('aria-pressed', picks[i].getAttribute('data-theme-pick') === name ? 'true' : 'false');
    }
  }

  function copyText(text, doneMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? doneMsg : 'Could not copy. Select the text and copy it by hand.');
    }
    if (NATIVE && plug('Clipboard')) {
      plug('Clipboard').write({ string: text }).then(function () { toast(doneMsg); }, fallback);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(doneMsg); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- anonymous visit count ----------
     Adds one to a public counter: once per visit, and once per tool opened.
     It sends no text, no name and nothing that was typed. Switched off in config.js. */
  var VC = CFG.visitCount || {};
  var counted = {};
  /* True when this is the store app on a phone, not a page in a browser. */
  var NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (NATIVE) { document.documentElement.classList.add('native'); }
  /* A phone feature (sharing, clipboard, files) supplied by the store app. Null in a browser. */
  function plug(name) { return (NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; }
  function count(key) {
    try {
      if (!VC.on || !VC.name || counted[key]) { return; }
      var h = window.location.hostname;
      if (!NATIVE && (!/^https?:$/.test(window.location.protocol) || h === 'localhost' || h === '127.0.0.1')) { return; } // not while testing
      if (key !== 'requests') {
        if (sessionStorage.getItem('pt.c.' + key)) { counted[key] = true; return; }
        sessionStorage.setItem('pt.c.' + key, '1');
      }
      counted[key] = true;
      fetch('https://abacus.jasoncameron.dev/hit/' + encodeURIComponent(VC.name) + '/' + key, { mode: 'cors', credentials: 'omit' }).catch(function () {});
    } catch (e) { /* counting must never break the app */ }
  }

  /* ---------- shared with tools.js ---------- */
  function cur() { return CFG.currency || 'AED'; }
  function money(n) {
    if (!isFinite(n)) { return '–'; }
    var c = cur();
    var s = Math.round(Math.abs(n)).toLocaleString('en-US');
    return (n < 0 ? '−' : '') + (c.length > 1 ? c + ' ' : c) + s;
  }
  var PT = window.PT = {
    $: $, esc: esc, plural: plural, store: store, toast: toast, copyText: copyText,
    cfg: CFG, brand: BRAND, views: {}, lastDecode: null,
    cur: cur, money: money,
    setTheme: setTheme, count: count,
    register: function (name, show) { PT.views[name] = show; },
    go: function (name) { go(name); }
  };

  /* ---------- the decoder ---------- */
  var compiled = PHRASES.map(function (p) {
    var src = p.raw ? p.re.source : '\\b(?:' + p.re.source + ')(?![A-Za-z0-9])';
    return { p: p, rx: new RegExp(src, 'gi') };
  });
  var fluffRx = new RegExp('\\b(?:' + FLUFF_SRC + ')(?![A-Za-z0-9])', 'gi');
  var FLUFF_ENTRY = { id: 'fluff', cat: 'fluff', says: 'Selling word',
    means: 'A word that describes a feeling, not a fact. It tells you nothing you can check.', ask: '' };

  function analyze(text, mode) {
    var found = [];
    compiled.forEach(function (c) {
      if (c.p.mode && c.p.mode !== mode) { return; }
      c.rx.lastIndex = 0;
      var m;
      while ((m = c.rx.exec(text)) !== null) {
        if (m[0].length === 0) { c.rx.lastIndex++; continue; }
        found.push({ start: m.index, end: m.index + m[0].length, text: m[0], p: c.p });
      }
    });
    fluffRx.lastIndex = 0;
    var f;
    while ((f = fluffRx.exec(text)) !== null) {
      if (f[0].length === 0) { fluffRx.lastIndex++; continue; }
      found.push({ start: f.index, end: f.index + f[0].length, text: f[0], p: FLUFF_ENTRY });
    }

    // When two phrases overlap, keep the more serious one, then the longer one.
    found.sort(function (a, b) {
      var r = CAT[b.p.cat].rank - CAT[a.p.cat].rank;
      if (r !== 0) { return r; }
      var l = (b.end - b.start) - (a.end - a.start);
      if (l !== 0) { return l; }
      return a.start - b.start;
    });
    var kept = [];
    found.forEach(function (m) {
      for (var i = 0; i < kept.length; i++) {
        if (m.start < kept[i].end && m.end > kept[i].start) { return; }
      }
      kept.push(m);
    });
    kept.sort(function (a, b) { return a.start - b.start; });

    var notes = [];
    var byId = {};
    var fluffWords = {};
    var fluffCount = 0;
    var facts = [];
    kept.forEach(function (m) {
      if (m.p.cat === 'fluff' || m.p.cat === 'spin') {
        // Selling words and sales-talk phrases both count on the "selling" side of the meter.
        fluffCount++;
        var w = m.text.toLowerCase().replace(/\s+/g, ' ');
        fluffWords[w] = (fluffWords[w] || 0) + 1;
        if (m.p.cat === 'fluff') { return; }
      }
      if (m.p.cat === 'fact') { facts.push(m.text.replace(/\s+/g, ' ')); }
      if (!byId[m.p.id]) {
        byId[m.p.id] = { p: m.p, hits: [] };
        notes.push(byId[m.p.id]);
      }
      var hit = m.text.replace(/\s+/g, ' ');
      var seen = byId[m.p.id].hits.some(function (h) { return h.toLowerCase() === hit.toLowerCase(); });
      if (!seen) { byId[m.p.id].hits.push(hit); }
    });

    var groups = { scam: [], watch: [], spin: [], fact: [] };
    notes.forEach(function (n) { groups[n.p.cat].push(n); });

    var missing = MISSING.filter(function (c) {
      if (c.mode && c.mode !== mode) { return false; }
      if (c.when && !c.when.test(text)) { return false; }
      return !c.re.test(text);
    });

    var bangs = (text.match(/!/g) || []).length;
    var caps = (text.match(/\b[A-Z]{4,}\b/g) || []).filter(function (w) {
      return ['HVAC', 'HDTV', 'WIFI', 'USDA', 'STPP', 'OIEO', 'OIRO', 'EICR'].indexOf(w) === -1;
    }).length;

    var hardScam = groups.scam.filter(function (n) { return n.p.hard; }).length;
    var scamCount = groups.scam.length;
    var isScam = hardScam >= 1 || scamCount >= 2;
    var spinWeight = groups.watch.length * 2 + groups.spin.length + scamCount * 3 +
      (fluffCount > facts.length * 2 + 3 ? 2 : 0);
    var level = isScam ? 'scam' : (spinWeight < 3 ? 'clear' : (spinWeight < 9 ? 'some' : 'heavy'));
    // Little spin but most basics missing: the ad is thin, which is not the same as straight.
    if (level === 'clear' && missing.length >= 4) { level = 'thin'; }

    // Questions: warnings first, then sales talk, then what is missing.
    var questions = [];
    function addQ(q) { if (q && questions.indexOf(q) === -1) { questions.push(q); } }
    groups.watch.forEach(function (n) { addQ(n.p.ask); });
    groups.spin.forEach(function (n) { addQ(n.p.ask); });
    // Keep the message short enough that an agent will actually answer it.
    questions = questions.slice(0, 8);
    missing.slice(0, 4).forEach(function (c) { addQ(c.ask); });

    return {
      text: text, mode: mode, kept: kept, groups: groups, facts: facts,
      fluffCount: fluffCount, fluffWords: fluffWords, missing: missing,
      bangs: bangs, caps: caps, level: level, isScam: isScam, scamCount: scamCount,
      toCheck: groups.scam.length + groups.watch.length + groups.spin.length + missing.length,
      questions: questions
    };
  }

  var VERDICT = {
    scam:  { title: 'Stop before you pay anything', cls: 'is-scam',
             line: function (r) { return 'This ad matches ' + plural(r.scamCount, 'pattern', 'patterns') + ' seen again and again in fake listings. That is not proof, but treat it as a scam until someone lets you inside.'; } },
    heavy: { title: 'Heavy sales talk', cls: '',
             line: function () { return 'A lot of this ad is wording that sounds good and hides the detail. Get answers in writing before you spend time on a viewing.'; } },
    some:  { title: 'Some sales talk', cls: 'is-some',
             line: function () { return 'A fairly normal ad with a few phrases worth questioning.'; } },
    thin:  { title: 'Not much to go on', cls: 'is-thin',
             line: function (r) { return 'There is little sales talk here, but the text leaves out ' + r.missing.length + ' basic facts. Ask for them before you spend time on a viewing.'; } },
    clear: { title: 'Mostly straight talk', cls: 'is-clear',
             line: function () { return 'Very little spin in the wording. That says the ad is plain, not that the property is good, so still view it and check the facts.'; } }
  };

  /* ---------- drawing the results ---------- */
  var current = null;

  function markedHtml(r) {
    var out = '';
    var pos = 0;
    r.kept.forEach(function (m, i) {
      out += esc(r.text.slice(pos, m.start));
      if (m.p.cat === 'fluff') {
        out += '<mark class="hl hl-fluff">' + esc(m.text) + '</mark>';
      } else {
        out += '<mark class="hl hl-' + m.p.cat + '" tabindex="0" role="button" data-k="' + i + '">' + esc(m.text) + '</mark>';
      }
      pos = m.end;
    });
    out += esc(r.text.slice(pos));
    return out;
  }

  function noteHtml(n) {
    var c = CAT[n.p.cat];
    var says = n.hits.map(function (h) { return '<q>' + esc(h) + '</q>'; }).join(', ');
    var askLabel = n.p.cat === 'scam' ? 'Do this' : 'Ask';
    return '<div class="note" id="note-' + n.p.id + '" style="--c:' + c.color + '">' +
      '<div>' + says + '</div>' +
      '<p class="means">' + esc(n.p.means) + '</p>' +
      (n.p.ask ? '<p class="ask"><b>' + askLabel + ':</b> ' + esc(n.p.ask) + '</p>' : '') +
      '</div>';
  }

  function groupHtml(r, cat) {
    var list = r.groups[cat];
    if (!list.length) { return ''; }
    return '<div class="group-title"><i style="color:' + CAT[cat].color + '"></i>' +
      CAT[cat].plural + ' (' + list.length + ')</div>' + list.map(noteHtml).join('');
  }

  function messageText(r) {
    var lines = ['Hi, I am interested in this property. Before I book a viewing, could you tell me:', ''];
    r.questions.forEach(function (q, i) { lines.push((i + 1) + '. ' + q); });
    lines.push('', 'Thank you.');
    return lines.join('\n');
  }

  function summaryText(r) {
    var v = VERDICT[r.level];
    var lines = [BRAND + ' Ad Decoder result: ' + v.title + '.'];
    var parts = [];
    if (r.groups.scam.length) { parts.push(plural(r.groups.scam.length, 'scam warning sign', 'scam warning signs')); }
    if (r.groups.watch.length) { parts.push(plural(r.groups.watch.length, 'thing to watch out for', 'things to watch out for')); }
    if (r.groups.spin.length) { parts.push(plural(r.groups.spin.length, 'piece of sales talk', 'pieces of sales talk')); }
    if (r.missing.length) { parts.push(plural(r.missing.length, 'missing fact', 'missing facts')); }
    if (parts.length) { lines.push(parts.join(', ') + '.'); }
    lines.push('');
    ['scam', 'watch', 'spin'].forEach(function (cat) {
      r.groups[cat].forEach(function (n) {
        lines.push('"' + n.hits[0] + '" often means: ' + n.p.means);
      });
    });
    if (r.missing.length) {
      lines.push('', 'The ad does not say: ' + r.missing.map(function (m) { return m.label.toLowerCase(); }).join('; ') + '.');
    }
    return lines.join('\n');
  }

  function render(r) {
    current = r;
    var v = VERDICT[r.level];
    var box = $('results');
    var html = '';

    // Verdict
    html += '<div class="verdict glass ' + v.cls + '"><h2>' + v.title + '</h2><p>' + esc(v.line(r)) + '</p><div class="tally">';
    if (r.groups.scam.length) { html += '<span><b>' + r.groups.scam.length + '</b> scam ' + (r.groups.scam.length === 1 ? 'sign' : 'signs') + '</span>'; }
    html += '<span><b>' + r.groups.watch.length + '</b> to watch out for</span>';
    html += '<span><b>' + r.groups.spin.length + '</b> sales talk</span>';
    html += '<span><b>' + r.missing.length + '</b> missing ' + (r.missing.length === 1 ? 'fact' : 'facts') + '</span>';
    html += '<span><b>' + r.groups.fact.length + '</b> good ' + (r.groups.fact.length === 1 ? 'sign' : 'signs') + '</span>';
    html += '</div></div>';

    html += '<div class="cols"><div class="col-left">';

    // Marked-up ad
    html += '<div class="block glass"><h3>Your ad, marked up</h3><p class="lede">Tap any highlighted phrase to see what it usually means.</p>' +
      '<div class="marked" id="marked">' + markedHtml(r) + '</div>' +
      '<div class="legend">' +
      '<span><i style="color:' + CAT.scam.color + '"></i>Scam sign</span>' +
      '<span><i style="color:' + CAT.watch.color + '"></i>Watch out</span>' +
      '<span><i style="color:' + CAT.spin.color + '"></i>Sales talk</span>' +
      '<span><i style="color:' + CAT.fact.color + '"></i>Good sign</span>' +
      '<span><i class="dot"></i>Selling word</span></div></div>';

    // Selling words against facts
    var total = r.fluffCount + r.facts.length;
    var a = total ? Math.round((r.fluffCount / total) * 100) : 50;
    var topFluff = Object.keys(r.fluffWords).sort(function (x, y) { return r.fluffWords[y] - r.fluffWords[x]; }).slice(0, 6);
    html += '<div class="block glass"><h3>Selling phrases against facts</h3>' +
      '<p class="lede">A straight ad gives you numbers you can check. A weak one gives you adjectives.</p>' +
      '<div class="meter"><div class="meter-bar" role="img" aria-label="' + r.fluffCount + ' selling phrases against ' + r.facts.length + ' checkable facts">' +
      (total ? '<i class="a" style="width:' + a + '%"></i><i class="b" style="width:' + (100 - a) + '%"></i>' : '') + '</div>' +
      '<div class="meter-key"><span>' + plural(r.fluffCount, 'selling phrase', 'selling phrases') + '</span><span>' + plural(r.facts.length, 'checkable fact', 'checkable facts') + '</span></div>';
    if (topFluff.length) {
      html += '<p class="meter-note">Including: ' + topFluff.map(function (w) {
        return esc(w) + (r.fluffWords[w] > 1 ? ' ×' + r.fluffWords[w] : '');
      }).join(', ') + '.</p>';
    }
    if (r.bangs >= 3 || r.caps >= 3) {
      var shout = [];
      if (r.bangs >= 3) { shout.push(plural(r.bangs, 'exclamation mark', 'exclamation marks')); }
      if (r.caps >= 3) { shout.push(plural(r.caps, 'word in capitals', 'words in capitals')); }
      html += '<p class="meter-note">Also ' + shout.join(' and ') + '. Shouting is pressure, not information.</p>';
    }
    html += '</div>';
    if (r.facts.length) {
      html += '<div class="facts">' + r.facts.slice(0, 12).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    }
    html += '</div>';

    html += '</div><div class="col-right">';

    // Scam steps
    if (r.isScam) {
      html += '<div class="block glass"><h3>What to do now</h3><ol class="steps">' +
        '<li>Do not send money, a booking fee, your Emirates ID or bank details.</li>' +
        '<li>Ask for a viewing inside the property with the person who holds the keys. A real landlord or agent can arrange one.</li>' +
        '<li>Ask for the title deed and the owner\'s ID, and for the agent\'s broker card. Cheques should be in the name on the title deed.</li>' +
        '<li>Search the photos online. Fake ads are often copies of a real listing with the contact details changed.</li>' +
        '<li>If they refuse a viewing or keep pushing you to pay, stop replying and report the ad to the site where you found it.</li>' +
        '</ol></div>';
    }

    // Translations
    var anyNotes = r.groups.scam.length + r.groups.watch.length + r.groups.spin.length + r.groups.fact.length;
    html += '<div class="block glass"><h3>What it says, and what that often means</h3>';
    if (anyNotes) {
      html += groupHtml(r, 'scam') + groupHtml(r, 'watch') + groupHtml(r, 'spin') + groupHtml(r, 'fact');
    } else {
      html += '<p class="lede">None of the phrases in the phrasebook appear in this ad. That can be a good sign: plain ads usually have less to hide. Check the missing facts below.</p>';
    }
    html += '</div>';

    // Missing
    html += '<div class="block glass"><h3>What the ad does not say</h3>';
    if (r.missing.length) {
      html += '<p class="lede">Not found in the text you pasted. Check the rest of the listing page, then ask.</p><ul class="missing">' +
        r.missing.map(function (m) { return '<li>' + esc(m.label) + '</li>'; }).join('') + '</ul>';
    } else {
      html += '<p class="lede">The basics are all mentioned. That is rarer than it should be.</p>';
    }
    html += '</div>';

    // Questions
    if (r.questions.length) {
      html += '<div class="block glass"><h3>Questions to send the agent</h3>' +
        '<p class="lede">Ready to copy into a message. Answers in writing are worth more than answers at a viewing.</p>' +
        '<ol class="questions">' + r.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' +
        '<div class="actions"><button type="button" class="btn btn-main" id="copyMsgBtn">Copy as a message</button></div></div>';
    }

    // Keep and share
    html += '<div class="block glass"><h3>Keep or share this result</h3>' +
      '<div class="save-row"><label for="saveName" hidden>A name for this ad</label>' +
      '<input id="saveName" type="text" maxlength="60" placeholder="Name it, like 1-bed in the Marina">' +
      '<button type="button" class="btn" id="saveBtn">Save this ad</button></div>' +
      '<div class="actions">' +
      '<button type="button" class="btn" id="shareBtn">Share the result</button>' +
      '<button type="button" class="btn" id="cardBtn">Download as a picture</button>' +
      '</div></div>';

    html += '</div></div>';

    // Where to go next
    html += '<div class="nudge glass"><div><h3>' + (r.isScam ? 'Not sure if it is real?' : 'Want a second opinion on this one?') + '</h3>' +
      '<p>Send this result to a consultant with your question, or carry on with the numbers.</p></div>' +
      '<div class="actions" style="margin-top:0">' +
      '<button type="button" class="btn btn-gold" data-go="consult">Talk to a consultant</button>' +
      '<button type="button" class="btn" data-go="cost">Work out the true cost</button></div></div>';

    PT.lastDecode = { summary: summaryText(r), questions: r.questions.slice(), level: r.level, mode: r.mode };

    html += '<p class="fine">These are the usual meanings of the wording, collected from what agents, renters and buyers say about listing language. The decoder cannot see the property, so an honest ad can still trigger a note and a bad one can slip through. Use the result to decide what to ask.</p>';

    box.innerHTML = html;
    box.hidden = false;

    $('marked').addEventListener('click', onMarkActivate);
    $('marked').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarkActivate(e); }
    });
    if ($('copyMsgBtn')) {
      $('copyMsgBtn').addEventListener('click', function () { copyText(messageText(r), 'Message copied'); });
    }
    $('saveBtn').addEventListener('click', saveCurrent);
    $('shareBtn').addEventListener('click', shareResult);
    $('cardBtn').addEventListener('click', downloadCard);
  }

  /* ---------- tap a highlight ---------- */
  var activeMark = null;
  function onMarkActivate(e) {
    var el = e.target.closest ? e.target.closest('mark[data-k]') : null;
    if (!el || !current) { return; }
    var m = current.kept[Number(el.getAttribute('data-k'))];
    if (!m) { return; }
    if (activeMark) { activeMark.classList.remove('is-on'); }
    activeMark = el;
    el.classList.add('is-on');
    var c = CAT[m.p.cat];
    $('popKind').textContent = c.name;
    $('popSays').textContent = '“' + m.text.replace(/\s+/g, ' ') + '”';
    $('popMeans').textContent = m.p.means;
    $('popAsk').innerHTML = m.p.ask ? '<b>' + (m.p.cat === 'scam' ? 'Do this' : 'Ask') + ':</b> ' + esc(m.p.ask) : '';
    document.querySelector('.pop-card').style.setProperty('--c', c.color);
    $('pop').hidden = false;
  }
  function closePop() {
    $('pop').hidden = true;
    if (activeMark) { activeMark.classList.remove('is-on'); activeMark = null; }
  }

  /* ---------- share ---------- */
  function shareResult() {
    if (!current) { return; }
    var text = summaryText(current);
    if (plug('Share')) {
      plug('Share').share({ title: BRAND + ' result', text: text, dialogTitle: 'Share the result' }).catch(function () {});
    } else if (navigator.share) {
      navigator.share({ title: BRAND + ' result', text: text }).catch(function (err) {
        if (err && err.name !== 'AbortError') { copyText(text, 'Result copied'); }
      });
    } else {
      copyText(text, 'Result copied');
    }
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var words = text.split(/\s+/);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) { break; }
      } else {
        line = test;
      }
    }
    if (lines.length < maxLines && line) { lines.push(line); }
    else if (lines.length === maxLines && i < words.length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
    }
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildCard(r) {
    var W = 1080, H = 1350;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var display = '"Instrument Serif", Georgia, serif';
    var body = '"Manrope", "Segoe UI", sans-serif';
    var v = VERDICT[r.level];

    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#F7F2E8');
    bg.addColorStop(0.55, '#EEE8DB');
    bg.addColorStop(1, '#E3DAC8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // header band
    var bandColor = r.level === 'scam' ? '#A63A28' : (r.level === 'clear' ? '#3F6B45' : '#2443C9');
    ctx.font = '400 92px ' + display;
    var tLines = wrapLines(ctx, v.title, W - 200, 2);
    var bandH = 212 + tLines.length * 82;
    ctx.fillStyle = bandColor;
    roundRect(ctx, 50, 50, W - 100, bandH, 40);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 34px ' + body;
    ctx.fillText(BRAND, 100, 125);
    ctx.font = '400 92px ' + display;
    tLines.forEach(function (l, i) { ctx.fillText(l, 100, 220 + i * 82); });
    ctx.font = '600 32px ' + body;
    var tally = [];
    if (r.groups.scam.length) { tally.push(plural(r.groups.scam.length, 'scam sign', 'scam signs')); }
    tally.push(r.groups.watch.length + ' to watch out for');
    tally.push(r.groups.spin.length + ' sales talk');
    tally.push(r.missing.length + ' missing');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(tally.join('   |   '), 100, 220 + tLines.length * 82 + 4);

    // translations
    var picks = r.groups.scam.concat(r.groups.watch, r.groups.spin).slice(0, 4);
    var y = 50 + bandH + 30;
    var floor = H - 120; // nothing may be drawn below this line except the footer
    var drawn = 0;
    picks.forEach(function (n) {
      var c = CAT[n.p.cat].ink;
      ctx.font = '400 50px ' + display;
      var says = '“' + n.hits[0] + '”';
      var saysLines = wrapLines(ctx, says, W - 240, 1);
      ctx.font = '500 34px ' + body;
      var meansLines = wrapLines(ctx, n.p.means, W - 240, 2);
      var h = 60 + 56 + meansLines.length * 44 + 10;
      if (y + h > floor) { return; }
      drawn++;
      ctx.fillStyle = '#2C3624';
      roundRect(ctx, 50, y, W - 100, h, 28);
      ctx.fill();
      ctx.fillStyle = c;
      roundRect(ctx, 50, y, 22, h, 11);
      ctx.fill();
      // highlighter stroke behind the phrase
      ctx.font = '400 50px ' + display;
      var sw = Math.min(ctx.measureText(saysLines[0]).width + 24, W - 220);
      ctx.fillStyle = c;
      roundRect(ctx, 100, y + 30, sw, 58, 12);
      ctx.fill();
      ctx.fillStyle = '#1C120A';
      ctx.fillText(saysLines[0], 112, y + 74);
      ctx.font = '500 34px ' + body;
      ctx.fillStyle = '#F3EADC';
      meansLines.forEach(function (l, i) { ctx.fillText(l, 100, y + 136 + i * 44); });
      y += h + 22;
    });

    if (!picks.length) {
      ctx.fillStyle = '#2C3624';
      roundRect(ctx, 50, y, W - 100, 200, 28);
      ctx.fill();
      ctx.fillStyle = '#F3EADC';
      ctx.font = '500 38px ' + body;
      wrapLines(ctx, 'No sales talk found in the wording. Still check the facts at a viewing.', W - 200, 3)
        .forEach(function (l, i) { ctx.fillText(l, 100, y + 80 + i * 50); });
      y += 222;
    }

    var room = Math.floor((floor - (y + 88)) / 42) + 1; // lines of "missing" text that fit
    if (r.missing.length && room >= 1) {
      ctx.fillStyle = '#2443C9';
      ctx.font = '400 46px ' + display;
      ctx.fillText('The ad does not say:', 60, y + 40);
      ctx.font = '500 32px ' + body;
      ctx.fillStyle = '#5B5145';
      var missLine = r.missing.map(function (m) { return m.label.toLowerCase(); }).join(', ') + '.';
      wrapLines(ctx, missLine, W - 120, Math.min(3, room))
        .forEach(function (l, i) { ctx.fillText(l, 60, y + 88 + i * 42); });
    }

    ctx.fillStyle = '#5B5145';
    ctx.font = '500 28px ' + body;
    ctx.fillText('Common meanings, not proof. Always view before you pay.', 60, H - 60);
    return cv;
  }

  function downloadCard() {
    if (!current) { return; }
    var go = function () {
      var cv = buildCard(current);
      if (plug('Filesystem') && plug('Share')) {
        // In the store app: save the picture, then open the phone's own share sheet.
        plug('Filesystem').writeFile({ path: 'decoded-listing.png', data: cv.toDataURL('image/png').split(',')[1], directory: 'CACHE' })
          .then(function (res) { return plug('Share').share({ title: BRAND + ' result', files: [res.uri], dialogTitle: 'Share the picture' }); })
          .catch(function (err) { if (!err || !/cancel/i.test(String(err.message || err))) { toast('Could not share the picture.'); } });
        return;
      }
      cv.toBlob(function (blob) {
        if (!blob) { toast('Could not make the picture in this browser.'); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'decoded-listing.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        toast('Picture downloaded');
      }, 'image/png');
    };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go, go); } else { go(); }
  }

  /* ---------- saved ads ---------- */
  function loadSaved() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function writeSaved(list) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
  function updateSavedCount() {
    var n = loadSaved().length;
    $('savedCount').textContent = n ? '(' + n + ')' : '';
  }
  function saveCurrent() {
    if (!current) { return; }
    var name = $('saveName').value.trim();
    if (!name) {
      name = current.text.replace(/\s+/g, ' ').trim().slice(0, 42) + '…';
    }
    var list = loadSaved();
    list.unshift({
      id: Date.now().toString(36),
      name: name,
      mode: current.mode,
      text: current.text,
      date: new Date().toISOString(),
      level: current.level,
      counts: { scam: current.groups.scam.length, watch: current.groups.watch.length,
                spin: current.groups.spin.length, missing: current.missing.length }
    });
    if (writeSaved(list.slice(0, 50))) {
      toast('Saved on this device');
      $('saveName').value = '';
      updateSavedCount();
    } else {
      toast('Could not save. Your browser is blocking storage.');
    }
  }
  function renderSaved() {
    var list = loadSaved();
    var box = $('savedList');
    if (!list.length) {
      box.innerHTML = '<div class="empty glass"><h3>Nothing saved yet</h3><p>Decode an ad, then press "Save this ad" under the result. It will be listed here so you can compare places side by side.</p>' +
        '<div class="actions"><button type="button" class="btn btn-main" id="goDecode">Decode an ad</button></div></div>';
      $('goDecode').addEventListener('click', function () { go('decode'); });
      return;
    }
    var levelColor = { scam: CAT.scam.color, heavy: CAT.watch.color, some: CAT.spin.color, thin: CAT.fluff.color, clear: CAT.fact.color };
    box.innerHTML = '<div class="saved-list">' + list.map(function (s) {
      var d = new Date(s.date);
      var when = isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      var c = s.counts || {};
      return '<div class="saved-item glass" style="--c:' + (levelColor[s.level] || CAT.spin.color) + '">' +
        '<h3>' + esc(s.name) + '</h3>' +
        '<div class="saved-meta">' + esc((VERDICT[s.level] || VERDICT.some).title) + '. ' +
        (c.scam ? plural(c.scam, 'scam sign', 'scam signs') + ', ' : '') +
        (c.watch || 0) + ' to watch out for, ' + (c.spin || 0) + ' sales talk, ' + (c.missing || 0) + ' missing. ' +
        (s.mode === 'buy' ? 'Buying' : 'Renting') + (when ? ', saved ' + esc(when) : '') + '.</div>' +
        '<div class="saved-acts"><button type="button" class="btn" data-open="' + esc(s.id) + '">Open</button>' +
        '<button type="button" class="btn btn-quiet" data-del="' + esc(s.id) + '">Delete</button></div></div>';
    }).join('') + '</div>';
  }
  function onSavedClick(e) {
    var openId = e.target.getAttribute('data-open');
    var delId = e.target.getAttribute('data-del');
    if (openId) {
      var item = loadSaved().filter(function (s) { return s.id === openId; })[0];
      if (!item) { return; }
      setMode(item.mode);
      $('adText').value = item.text;
      go('decode');
      runDecode(true);
    } else if (delId) {
      if (e.target.getAttribute('data-armed') !== '1') {
        e.target.setAttribute('data-armed', '1');
        e.target.textContent = 'Tap again to delete';
        setTimeout(function () {
          if (e.target.isConnected) { e.target.removeAttribute('data-armed'); e.target.textContent = 'Delete'; }
        }, 3500);
        return;
      }
      writeSaved(loadSaved().filter(function (s) { return s.id !== delId; }));
      renderSaved();
      updateSavedCount();
      toast('Deleted');
    }
  }

  /* ---------- phrasebook ---------- */
  var bookCat = 'all';
  function renderBook() {
    var q = $('bookSearch').value.trim().toLowerCase();
    var list = PHRASES.filter(function (p) {
      if (bookCat !== 'all' && p.cat !== bookCat) { return false; }
      if (!q) { return true; }
      return (p.says + ' ' + p.means + ' ' + p.ask).toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      $('bookList').innerHTML = '<div class="empty glass"><h3>No phrase matches that</h3><p>Try a shorter word, or choose "All".</p></div>';
      return;
    }
    $('bookList').innerHTML = list.map(function (p) {
      var who = p.mode === 'rent' ? ' (renting)' : (p.mode === 'buy' ? ' (buying)' : '');
      return '<div class="entry" style="--c:' + CAT[p.cat].color + '">' +
        '<h3>' + esc(p.says) + '</h3>' +
        '<p>' + esc(p.means) + '</p>' +
        '<p class="ask"><b>' + (p.cat === 'scam' ? 'Do this' : 'Ask') + ':</b> ' + esc(p.ask) + '</p>' +
        '<p class="ask">' + CAT[p.cat].name + esc(who) + '</p></div>';
    }).join('');
  }

  /* ---------- views, mode, input ---------- */
  var mode = 'rent';
  function setMode(m) {
    mode = m === 'buy' ? 'buy' : 'rent';
    var btns = document.querySelectorAll('#modeSeg button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-mode') === mode ? 'true' : 'false');
    }
    store(MODE_KEY, mode);
  }

  // Every screen: its title in the top bar, how deep it sits, where Back goes, and which tab lights up.
  var SCREENS = {
    home:    { title: '',                   depth: 0, tab: 'home' },
    saved:   { title: 'Saved',              depth: 0, tab: 'saved' },
    consult: { title: 'Consultant',         depth: 0, tab: 'consult' },
    more:    { title: 'Settings',           depth: 0, tab: 'more' },
    decode:  { title: 'Ad Decoder',         depth: 1, tab: 'decode', back: 'home' },
    cost:    { title: 'True Cost',          depth: 1, tab: 'home', back: 'home' },
    compare: { title: 'Compare Homes',      depth: 1, tab: 'home', back: 'home' },
    viewing: { title: 'Viewing Checklist',  depth: 1, tab: 'home', back: 'home' },
    rentbuy: { title: 'Rent or Buy',        depth: 1, tab: 'home', back: 'home' },
    letters: { title: 'Message Writer',     depth: 1, tab: 'home', back: 'home' },
    book:    { title: 'Phrasebook',         depth: 2, tab: 'decode', back: 'decode' }
  };
  var VIEWS = Object.keys(SCREENS);
  var currentView = null;
  var scamFace = false;

  function setBar(name) {
    var s = SCREENS[name];
    var title = $('barTitle');
    if (name === 'home') {
      title.innerHTML = '<svg aria-hidden="true"><use href="#i-mark"/></svg><span>' + esc(BRAND) + '</span>';
    } else {
      title.textContent = (name === 'decode' && scamFace) ? 'Is this ad genuine?' : s.title;
    }
    title.classList.remove('swap');
    void title.offsetWidth; // restart the little title animation
    title.classList.add('swap');
    $('navBack').classList.toggle('is-off', !s.back);
    $('barMore').style.visibility = name === 'more' ? 'hidden' : '';
  }

  function showView(name) {
    if (VIEWS.indexOf(name) === -1) { name = 'home'; }
    var from = currentView;
    currentView = name;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });

    // Slide in from the right when going deeper, from the left when coming back, fade between tabs.
    var el = $('view-' + name);
    el.classList.remove('v-fwd', 'v-back', 'v-fade');
    if (from && from !== name) {
      var d = SCREENS[name].depth - SCREENS[from].depth;
      void el.offsetWidth;
      el.classList.add(d > 0 ? 'v-fwd' : (d < 0 ? 'v-back' : 'v-fade'));
    }

    var navs = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < navs.length; i++) {
      if (navs[i].getAttribute('data-nav') === SCREENS[name].tab) { navs[i].setAttribute('aria-current', 'page'); }
      else { navs[i].removeAttribute('aria-current'); }
    }
    setBar(name);
    closePop();
    closeMenu();
    if (name === 'book') { renderBook(); }
    if (name === 'saved') { renderSaved(); }
    if (name === 'home') { renderHome(); }
    if (PT.views[name]) { PT.views[name](); }
    if (name !== 'home' && name !== 'more') { count('open-' + name); }
    window.scrollTo(0, 0);
  }

  function renderHome() {
    var h = new Date().getHours();
    $('greet').textContent = h < 5 ? 'Good evening' : (h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening'));
    var c = CFG.consultant || {};
    if (c.name) {
      $('homeAvatar').textContent = c.name.charAt(0).toUpperCase();
      $('homeAdvisorSub').textContent = c.name + (c.title ? ', ' + c.title.toLowerCase() : '');
    }
  }

  // Move to a page and remember it in the address, so the browser's Back button works.
  function go(name) {
    if (VIEWS.indexOf(name) === -1) { name = 'home'; }
    showView(name);
    var target = '#/' + name;
    if (window.location.hash !== target) {
      try { window.history.pushState(null, '', target); } catch (e) { window.location.hash = target; }
    }
  }

  function route() {
    var hash = window.location.hash || '';
    var ex = hash.match(/example=(rent|buy|scam)/);
    if (ex && EXAMPLES[ex[1]]) {
      showView('decode');
      setMode(EXAMPLES[ex[1]].mode);
      $('adText').value = EXAMPLES[ex[1]].text;
      runDecode(false);
      return;
    }
    var m = hash.match(/^#\/([a-z]+)/);
    var name = m ? m[1] : 'home';
    if (name !== currentView) { showView(name); }
  }

  function setDecoderFace(scam) {
    scamFace = !!scam;
    $('decodeTitle').textContent = scam ? 'Is this ad genuine?' : 'Ad Decoder';
    $('decodeSub').textContent = scam
      ? 'Paste a rental ad, or a message from a "landlord" or "agent", and see whether it matches the patterns fake listings share.'
      : 'Paste a property ad and see what it is really saying.';
    if (scam) { setMode('rent'); }
  }

  /* ---------- drop-down lists drawn by the app, not the browser ---------- */
  var menuFor = null;
  function closeMenu() {
    var olds = document.querySelectorAll('.menu, .menu-veil');
    for (var i = 0; i < olds.length; i++) { olds[i].parentNode.removeChild(olds[i]); }
    if (menuFor) { menuFor.parentNode.classList.remove('is-open'); menuFor = null; }
  }
  function openMenu(sel) {
    closeMenu();
    menuFor = sel;
    var box = sel.parentNode;
    box.classList.add('is-open');
    var veil = document.createElement('div');
    veil.className = 'menu-veil';
    veil.addEventListener('click', closeMenu);
    var m = document.createElement('div');
    m.className = 'menu';
    m.setAttribute('role', 'listbox');
    var f = sel.closest ? sel.closest('.f') : null;
    var label = f && f.querySelector('span') ? f.querySelector('span').textContent : (sel.getAttribute('aria-label') || '');
    var html = label ? '<div class="menu-title">' + esc(label) + '</div>' : '';
    for (var i = 0; i < sel.options.length; i++) {
      html += '<button type="button" class="menu-opt" role="option" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex ? 'true' : 'false') + '"><span>' +
        esc(sel.options[i].text) + '</span><svg aria-hidden="true"><use href="#i-tick"/></svg></button>';
    }
    m.innerHTML = html;
    m.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.menu-opt') : null;
      if (!b) { return; }
      sel.selectedIndex = Number(b.getAttribute('data-i'));
      closeMenu();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sel.focus();
    });
    m.addEventListener('keydown', function (e) {
      var opts = m.querySelectorAll('.menu-opt');
      var at = Array.prototype.indexOf.call(opts, document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(opts.length - 1, at + 1)].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(0, at - 1)].focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); sel.focus(); }
    });
    document.body.appendChild(veil);
    document.body.appendChild(m);
    var r = box.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)) + 'px';
    m.style.width = Math.max(r.width, 220) + 'px';
    var h = m.offsetHeight;
    if (r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0) { m.style.top = (r.top - 8 - h) + 'px'; m.classList.add('up'); }
    else { m.style.top = (r.bottom + 8) + 'px'; }
    var cur = m.querySelector('[aria-selected="true"]') || m.querySelector('.menu-opt');
    if (cur) { cur.focus(); }
  }
  function wireMenus() {
    function mark(rootEl) {
      var sels = rootEl.querySelectorAll ? rootEl.querySelectorAll('.in select') : [];
      for (var i = 0; i < sels.length; i++) { sels[i].parentNode.classList.add('has-select'); }
    }
    mark(document);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) { if (list[i].addedNodes.length) { mark(document); return; } }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function (e) {
      var box = e.target.closest ? e.target.closest('.in.has-select') : null;
      if (!box) { return; }
      e.preventDefault(); // stops the label from also clicking the hidden list
      var sel = box.querySelector('select');
      if (menuFor === sel) { closeMenu(); } else { openMenu(sel); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuFor) { var s = menuFor; closeMenu(); s.focus(); return; }
      var t = e.target;
      if (t && t.tagName === 'SELECT' && t.parentNode.classList.contains('has-select') &&
          (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        openMenu(t);
      }
    });
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', function () { if (menuFor && window.innerWidth >= 900) { closeMenu(); } }, { passive: true });
  }

  /* ---------- installing it as an app ---------- */
  var installEvent = null;
  function isInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function installHint() {
    var sub = $('installSub');
    if (!sub) { return; }
    if (NATIVE) { $('installBtn').style.display = 'none'; return; }
    if (isInstalled()) { sub.textContent = 'Installed. You are using the app.'; return; }
    if (installEvent) { sub.textContent = 'Add it to your home screen so it opens like any other app.'; return; }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    sub.textContent = ios ? 'In Safari, tap the Share button, then "Add to Home Screen".'
      : (window.location.protocol === 'file:' ? 'Available once the app is online. On this computer, use the "Open Threshold" shortcut.'
        : 'Open your browser menu and choose "Install app" or "Add to Home screen".');
  }
  function wipeAll(btn) {
    if (btn.getAttribute('data-armed') !== '1') {
      btn.setAttribute('data-armed', '1');
      $('wipeSub').textContent = 'Tap again to remove everything. This cannot be undone.';
      setTimeout(function () {
        btn.removeAttribute('data-armed');
        $('wipeSub').textContent = 'Removes saved ads and everything you typed, from this device.';
      }, 4000);
      return;
    }
    try {
      var keep = localStorage.getItem(THEME_KEY);
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('pt.') === 0 || k.indexOf('listingDecoder.') === 0) { localStorage.removeItem(k); }
      });
      if (keep) { localStorage.setItem(THEME_KEY, keep); }
    } catch (e) { /* nothing stored */ }
    window.location.hash = '#/home';
    window.location.reload();
  }

  function showInputMsg(msg) {
    var el = $('inputMsg');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = msg;
    el.hidden = false;
  }

  function runDecode(scroll) {
    var text = $('adText').value.replace(/\r\n/g, '\n').trim();
    closePop();
    if (!text) {
      showInputMsg('Paste an ad into the box first, or try one of the examples below.');
      $('results').hidden = true;
      return;
    }
    var words = text.split(/\s+/).length;
    if (words < 8) {
      showInputMsg('That is only ' + plural(words, 'word', 'words') + '. Paste the full description so there is something to decode.');
      $('results').hidden = true;
      return;
    }
    showInputMsg('');
    render(analyze(text.slice(0, 20000), mode));
    if (scroll) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('results').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function init() {
    var remembered = store(MODE_KEY);
    if (remembered) { setMode(remembered); }
    updateSavedCount();

    // Put the brand name from config.js everywhere it appears.
    var brandEls = document.querySelectorAll('[data-brand]');
    for (var b = 0; b < brandEls.length; b++) { brandEls[b].textContent = BRAND; }
    document.title = BRAND;
    setTheme(document.documentElement.getAttribute('data-theme') || 'light', false);

    // Any button with data-go="page" opens that page.
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-go]') : null;
      if (!el) { return; }
      var name = el.getAttribute('data-go');
      if (name === 'decode') { setDecoderFace(el.getAttribute('data-scam') === '1'); }
      go(name);
    });
    $('navBack').addEventListener('click', function () {
      var s = SCREENS[currentView];
      if (s && s.back) { go(s.back); }
    });
    $('looks').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-theme-pick]') : null;
      if (b) { setTheme(b.getAttribute('data-theme-pick'), true); }
    });
    $('wipeBtn').addEventListener('click', function () { wipeAll(this); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; installHint(); });
    window.addEventListener('appinstalled', function () { installEvent = null; installHint(); toast('Installed'); });
    $('installBtn').addEventListener('click', function () {
      if (installEvent) { installEvent.prompt(); installEvent = null; }
      else { installHint(); toast(isInstalled() ? 'Already installed' : 'See the steps under "Install the app"'); }
    });
    installHint();
    wireMenus();
    count('visits');
    window.addEventListener('scroll', function () {
      $('appbar').classList.toggle('is-scrolled', window.scrollY > 6);
    }, { passive: true });
    // Works offline once it has been opened online (only when served from a web address).
    // In the store app, the phone's Back button steps back a screen, and leaves the app from Home.
    if (plug('App')) {
      plug('App').addListener('backButton', function (ev) {
        var w = $('webview');
        if (w && !w.hidden) { w.hidden = true; if ($('webFrame')) { $('webFrame').src = 'about:blank'; } return; }
        if (ev && ev.canGoBack) { window.history.back(); } else { plug('App').exitApp(); }
      });
    }
    if (!NATIVE && 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* the app works without it */ });
    }
    window.addEventListener('popstate', route);
    window.addEventListener('hashchange', route);
    var segs = document.querySelectorAll('#modeSeg button');
    for (var j = 0; j < segs.length; j++) {
      segs[j].addEventListener('click', function () {
        setMode(this.getAttribute('data-mode'));
        if (!$('results').hidden) { runDecode(false); }
      });
    }
    $('decodeBtn').addEventListener('click', function () { runDecode(true); });
    $('clearBtn').addEventListener('click', function () {
      $('adText').value = '';
      $('results').hidden = true;
      current = null;
      showInputMsg('');
      closePop();
      $('adText').focus();
    });
    $('pasteBtn').addEventListener('click', function () {
      if (plug('Clipboard')) {
        plug('Clipboard').read().then(function (r) {
          var t = r && r.value;
          if (t && String(t).trim()) { $('adText').value = t; showInputMsg(''); toast('Pasted'); }
          else { toast('Your clipboard is empty. Copy the ad first.'); }
        }, function () { toast('Press and hold the box, then choose Paste.'); });
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          if (t && t.trim()) { $('adText').value = t; showInputMsg(''); toast('Pasted'); }
          else { toast('Your clipboard is empty. Copy the ad first.'); }
        }, function () {
          toast('Your browser blocked this. Press and hold the box, then choose Paste.');
        });
      } else {
        toast('Press and hold the box, then choose Paste.');
      }
    });
    var chips = document.querySelectorAll('[data-example]');
    for (var k = 0; k < chips.length; k++) {
      chips[k].addEventListener('click', function () {
        var ex = EXAMPLES[this.getAttribute('data-example')];
        if (!ex) { return; }
        setMode(ex.mode);
        $('adText').value = ex.text;
        runDecode(true);
      });
    }
    $('popClose').addEventListener('click', closePop);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); } });

    // The opening screen fades by itself; this removes it for certain.
    setTimeout(function () { var sp = document.querySelector('.splash'); if (sp) { sp.parentNode.removeChild(sp); } }, 1600);

    $('bookSearch').addEventListener('input', renderBook);
    $('bookFilters').addEventListener('click', function (e) {
      var cat = e.target.getAttribute('data-cat');
      if (!cat) { return; }
      bookCat = cat;
      var fb = this.querySelectorAll('.chip');
      for (var i2 = 0; i2 < fb.length; i2++) {
        fb[i2].setAttribute('aria-pressed', fb[i2].getAttribute('data-cat') === cat ? 'true' : 'false');
      }
      renderBook();
    });
    $('savedList').addEventListener('click', onSavedClick);

    // Open the page named in the address. A link ending in #example=rent, #example=buy
    // or #example=scam opens the decoder with that example already decoded.
    route();
  }

  // Exposed for testing in the browser console.
  window.ListingDecoder = { analyze: analyze, summaryText: summaryText, messageText: messageText, buildCard: buildCard };

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
