/* Threshold: the tools beside the Ad Decoder, and the consultant page. */
(function () {
  'use strict';
  var PT = window.PT;
  if (!PT) { return; }
  var $ = PT.$, esc = PT.esc, money = PT.money, plural = PT.plural;

  /* ---------- small helpers ---------- */
  function load(key, def) {
    var out = JSON.parse(JSON.stringify(def));
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { out[k] = o[k]; } }
      }
    } catch (e) { /* storage blocked: defaults are used */ }
    return out;
  }
  function save(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* ignore */ } }
  function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function pos(v) { return Math.max(0, n(v)); }

  function head(title, sub) {
    return '<div class="page-head"><h1>' + title + '</h1><p>' + sub + '</p></div>';
  }
  // One input. unit: 'money', '%', or any short word shown after the number.
  function field(f, state) {
    var val = state[f.k] === undefined || state[f.k] === null ? '' : state[f.k];
    var inner;
    if (f.options) {
      inner = '<select data-k="' + f.k + '">' + f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    } else if (f.text) {
      inner = '<input type="text" data-k="' + f.k + '" value="' + esc(val) + '" placeholder="' + esc(f.ph || '') + '" maxlength="' + (f.max || 80) + '">';
    } else {
      inner = (f.unit === 'money' ? '<b data-cur>' + esc(PT.cur()) + '</b>' : '') +
        '<input type="number" inputmode="decimal" min="0" step="any" data-k="' + f.k + '" value="' + esc(val) + '" placeholder="0">' +
        (f.unit && f.unit !== 'money' ? '<b class="after">' + esc(f.unit) + '</b>' : '');
    }
    return '<label class="f' + (f.full ? ' full' : '') + '"><span>' + esc(f.label) + '</span><div class="in">' + inner + '</div>' +
      (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
  }
  function fields(list, state) { return '<div class="fields">' + list.map(function (f) { return field(f, state); }).join('') + '</div>'; }
  function rows(list) {
    return '<div class="rows">' + list.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
  }
  function bars(list) {
    var max = 0;
    list.forEach(function (b) { if (b[1] > max) { max = b[1]; } });
    return '<div class="bars">' + list.filter(function (b) { return b[1] > 0; }).map(function (b) {
      return '<div class="row"><span>' + esc(b[0]) + '</span><b>' + money(b[1]) + '</b><div class="track"><i style="width:' + (max ? Math.max(2, b[1] / max * 100) : 0) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  // Wire up a tool: typing saves and recalculates; the currency picker updates every sign.
  function bind(view, key, state, recalc) {
    view.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-curpick')) {
        PT.setCur(t.value);
        var signs = document.querySelectorAll('[data-cur]');
        for (var i = 0; i < signs.length; i++) { signs[i].textContent = t.value; }
        recalc();
        return;
      }
      var k = t.getAttribute('data-k');
      if (!k) { return; }
      state[k] = t.value;
      save(key, state);
      recalc();
    });
  }
  function segHtml(id, options, current) {
    return '<div class="seg" id="' + id + '" role="group">' + options.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === current ? 'true' : 'false') + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function setSeg(id, value) {
    var b = $(id).querySelectorAll('button');
    for (var i = 0; i < b.length; i++) { b[i].setAttribute('aria-pressed', b[i].getAttribute('data-v') === value ? 'true' : 'false'); }
  }
  var FINE = '<p class="fine">A simple model to help you compare and ask questions. The fees and rates already filled in are typical figures. They change, and they differ between emirates, so confirm the current ones with your agent, your bank or the Land Department. This is not financial or mortgage advice. Figures last checked on 14 November 2026 against published fee guides. <button type="button" class="link-btn inline" data-go="consult">Spot a wrong figure? Tell us.</button></p>';

  /* =====================================================================
     TRUE COST
     ===================================================================== */
  var COST_KEY = 'pt.cost.v4';
  var cost = load(COST_KEY, {
    mode: 'rent',
    rent: 85000, cheques: '4', furn: 'un', type: 'apt', comm: 5, ejari: 220, utilact: 130, moving: 1500,
    dewa: 600, chiller: 0, net: 389, parking: 0, commute: 300,
    price: 1500000, kind: 'resale', pay: 'mortgage', down: 20, rate: 4.5, years: 25, transfer: 4, agent: 2, bankfee: 1, fixed: 8000,
    size: 1000, service: 15, bchiller: 0, butil: 700, maint: 0.5, hins: 1000, ownrent: 95000
  });
  var costBuilt = false;
  var VAT = 0.05;

  function mortgagePayment(loan, ratePct, years) {
    var r = ratePct / 1200, N = Math.max(1, Math.round(years * 12));
    if (loan <= 0) { return 0; }
    return r > 0 ? loan * r / (1 - Math.pow(1 + r, -N)) : loan / N;
  }

  function costForm() {
    if (cost.mode === 'rent') {
      return '<p class="subhead">The rent</p>' + fields([
        { k: 'rent', label: 'Rent for the year', unit: 'money' },
        { k: 'cheques', label: 'Paid in', options: [['1', '1 cheque'], ['2', '2 cheques'], ['4', '4 cheques'], ['6', '6 cheques'], ['12', '12 cheques']] },
        { k: 'furn', label: 'The home is', options: [['un', 'Unfurnished (5% deposit)'], ['fu', 'Furnished (10% deposit)']], hint: 'The usual deposits. They are custom, not law, so the owner may ask for a different amount.' },
        { k: 'type', label: 'Type of home', options: [['apt', 'Apartment'], ['villa', 'Villa or townhouse']] }
      ], cost) +
      '<p class="subhead">Paid once, when you move in</p>' + fields([
        { k: 'comm', label: 'Agency commission', unit: '%', hint: 'Usually 5% of the yearly rent, plus 5% VAT.' },
        { k: 'ejari', label: 'Tenancy registration (Ejari)', unit: 'money', hint: 'About AED 220 at a service centre, a little less online.' },
        { k: 'utilact', label: 'Utility connection fee', unit: 'money', hint: 'Between AED 110 and 130.' },
        { k: 'moving', label: 'Movers', unit: 'money' }
      ], cost) +
      '<p class="subhead">Every month, on top of rent</p>' + fields([
        { k: 'dewa', label: 'Electricity and water', unit: 'money', hint: 'Higher in summer, when the AC runs all day.' },
        { k: 'chiller', label: 'District cooling (chiller)', unit: 'money', hint: 'Leave at 0 if the home is chiller free.' },
        { k: 'net', label: 'Internet and TV', unit: 'money' },
        { k: 'parking', label: 'Parking', unit: 'money' },
        { k: 'commute', label: 'Getting around', unit: 'money', hint: 'Salik, fuel, metro or taxis.' }
      ], cost);
    }
    return '<p class="subhead">The purchase</p>' + fields([
      { k: 'price', label: 'Price of the home', unit: 'money' },
      { k: 'kind', label: 'You are buying', options: [['resale', 'A ready home, from its owner'], ['offplan', 'Off-plan, from the developer']] },
      { k: 'pay', label: 'You are paying', options: [['mortgage', 'With a mortgage'], ['cash', 'In cash']] },
      { k: 'down', label: 'Down payment', unit: '%', hint: 'Banks usually ask expatriate residents for at least 20% on a first home under AED 5 million.' },
      { k: 'rate', label: 'Mortgage interest rate', unit: '%' },
      { k: 'years', label: 'Mortgage length', unit: 'years', hint: '25 years is the usual maximum.' }
    ], cost) +
    '<p class="subhead">Fees on the day</p>' + fields([
      { k: 'transfer', label: 'Transfer fee', unit: '%', hint: '4% of the price, paid to the Land Department. Most buyers pay all of it. It cannot be added to the mortgage.' },
      { k: 'agent', label: 'Agency fee', unit: '%', hint: 'The standard on a ready home is 2% of the price, plus 5% VAT. Off-plan, the developer pays the agent, so you pay nothing.' },
      { k: 'bankfee', label: 'Bank arrangement fee', unit: '%', hint: 'A share of the loan, plus 5% VAT.' },
      { k: 'fixed', label: 'Other fixed fees', unit: 'money', hint: 'Trustee office (about AED 4,200), Land Department admin fee (AED 580) and the bank valuation.' }
    ], cost) +
    '<p class="subhead">The running costs</p>' + fields([
      { k: 'size', label: 'Size of the home', unit: 'sq ft' },
      { k: 'service', label: 'Service charge', unit: 'AED per sq ft a year' },
      { k: 'bchiller', label: 'District cooling per month', unit: 'money', hint: 'Leave at 0 if there is none.' },
      { k: 'butil', label: 'Electricity and water per month', unit: 'money' },
      { k: 'maint', label: 'Upkeep allowance per year', unit: '%', hint: 'A share of the price, for AC servicing, repairs and repainting.' },
      { k: 'hins', label: 'Home insurance per year', unit: 'money' },
      { k: 'ownrent', label: 'What the home would rent for, per year', unit: 'money', hint: 'In Dubai, owners living in their home pay a housing fee of 5% of its rental value, on the utility bill. Set to 0 to leave it out.' }
    ], cost);
  }

  function costCalc() {
    var out = $('costOut');
    if (!out) { return; }
    var html;
    if (cost.mode === 'rent') {
      var rent = pos(cost.rent);
      var ch = Math.max(1, Math.round(pos(cost.cheques)) || 1);
      var depPct = cost.furn === 'fu' ? 10 : 5;
      var deposit = rent * depPct / 100;
      var utilDep = cost.type === 'villa' ? 4000 : 2000;
      var commission = rent * pos(cost.comm) / 100 * (1 + VAT);
      var setup = pos(cost.ejari) + pos(cost.utilact) + pos(cost.moving);
      var oneoff = commission + setup;
      var housing = rent * 0.05 / 12;
      var power = pos(cost.dewa) + pos(cost.chiller);
      var life = pos(cost.net) + pos(cost.parking) + pos(cost.commute);
      var allIn = rent / 12 + power + housing + life + oneoff / 12;
      var upfront = rent / ch + deposit + utilDep + oneoff;
      var over = rent > 0 ? (allIn / (rent / 12) - 1) * 100 : 0;
      html = '<div class="result-label">True monthly cost</div><div class="result-big">' + money(allIn) + '</div>';
      if (rent > 0) {
        html += '<p class="result-note">The ad says <b>' + money(rent) + '</b> a year, which is <b>' + money(rent / 12) + '</b> a month. Counting everything, this home costs <b>' +
          Math.round(over) + '% more</b> than that.</p>';
      }
      html += '<div class="callout">You need <b>' + money(upfront) + '</b> on the day you sign' +
        (ch === 1 ? ', because the whole year is paid in one cheque.' : ': the first of ' + ch + ' cheques, both deposits, the commission and the set-up costs.') +
        ' Owners often accept a lower rent for fewer cheques, so ask what the rent is with 1, 2 and 4.</div>';
      html += bars([['Rent', rent / 12], ['Electricity, water and cooling', power], ['Housing fee on the utility bill', housing],
        ['Internet, parking and getting around', life], ['Commission and set-up, spread over the year', oneoff / 12]]);
      html += rows([
        [ch === 1 ? 'The one cheque' : 'Each of the ' + ch + ' cheques', money(rent / ch)],
        ['Security deposit (' + depPct + '%)', money(deposit)],
        ['Utility deposit', money(utilDep)],
        ['Agency commission with VAT', money(commission)],
        ['Total for the year', money(allIn * 12)]
      ]);
      html += '<p class="lede" style="margin-top:12px">Both deposits should come back when you leave, so they count towards the cash you need but not the monthly cost. The housing fee is 5% of the yearly rent, added to the utility bill in Dubai.</p>';
    } else {
      var price = pos(cost.price);
      var cash = cost.pay === 'cash';
      var downAmt = cash ? price : price * Math.min(100, pos(cost.down)) / 100;
      var loan = price - downAmt;
      var years = Math.max(1, pos(cost.years) || 25);
      var pi = cash ? 0 : mortgagePayment(loan, pos(cost.rate), years);
      var transfer = price * pos(cost.transfer) / 100;
      var offplan = cost.kind === 'offplan';
      var agent = offplan ? 0 : price * pos(cost.agent) / 100 * (1 + VAT);
      var bank = cash ? 0 : loan * pos(cost.bankfee) / 100 * (1 + VAT);
      var mreg = cash || loan <= 0 ? 0 : loan * 0.0025 + 290;
      var fees = transfer + agent + bank + mreg + pos(cost.fixed);
      var serviceM = pos(cost.size) * pos(cost.service) / 12;
      var maintM = price * pos(cost.maint) / 100 / 12;
      var housingM = pos(cost.ownrent) * 0.05 / 12;
      var bills = pos(cost.butil) + pos(cost.bchiller);
      var monthly = pi + serviceM + bills + maintM + pos(cost.hins) / 12 + housingM;
      var interest = cash ? 0 : pi * Math.round(years * 12) - loan;
      html = '<div class="result-label">True monthly cost</div><div class="result-big">' + money(monthly) + '</div>' +
        (cash ? '<p class="result-note">With no mortgage, this is what the home still costs you every month.</p>'
          : '<p class="result-note">The mortgage is <b>' + money(pi) + '</b> of that. The other <b>' + money(monthly - pi) + '</b> a month is what the asking price does not show.</p>');
      html += '<div class="callout">You need <b>' + money(downAmt + fees) + '</b> in cash: ' + (cash ? 'the price' : 'the down payment') + ' plus <b>' + money(fees) +
        '</b> in fees, which is ' + (price > 0 ? (fees / price * 100).toFixed(1) : '0') + '% of the price. The fees cannot be borrowed.</div>';
      html += bars([['Mortgage payment', pi], ['Service charge', serviceM], ['Electricity, water and cooling', bills],
        ['Upkeep allowance', maintM], ['Insurance', pos(cost.hins) / 12], ['Housing fee', housingM]]);
      var list = [[cash ? 'Price paid' : 'Down payment', money(downAmt)], ['Transfer fee', money(transfer)], [offplan ? 'Agency fee (paid by the developer)' : 'Agency fee with VAT', money(agent)]];
      if (!cash) {
        list.push(['Mortgage registration', money(mreg)], ['Bank fee with VAT', money(bank)]);
      }
      list.push(['Other fixed fees', money(pos(cost.fixed))]);
      if (!cash) {
        list.push(['Amount borrowed', money(loan)], ['Interest over ' + plural(Math.round(years), 'year', 'years'), money(Math.max(0, interest))]);
      }
      html += rows(list);
    }
    out.innerHTML = html;
  }

  PT.register('cost', function () {
    var view = $('view-cost');
    if (!costBuilt) {
      view.innerHTML = head('True Cost', 'The advertised figure is never the full figure. Enter what you know and see what the home really costs. The numbers already filled in are examples: replace them with yours.') +
        '<div class="two"><div class="panel glass"><div class="sheet-head">' +
        segHtml('costSeg', [['rent', 'Renting'], ['buy', 'Buying']], cost.mode) + '</div>' +
        '<div id="costForm">' + costForm() + '</div></div>' +
        '<div class="stick"><div class="panel glass" id="costOut" aria-live="polite"></div>' +
        '<div class="actions"><button type="button" class="btn btn-gold" data-go="consult">Ask a consultant about these numbers</button></div></div></div>' + FINE;
      bind(view, COST_KEY, cost, costCalc);
      $('costSeg').addEventListener('click', function (e) {
        var v = e.target.getAttribute('data-v');
        if (!v) { return; }
        cost.mode = v;
        save(COST_KEY, cost);
        setSeg('costSeg', v);
        $('costForm').innerHTML = costForm();
        $('costForm').classList.remove('swap-in'); void $('costForm').offsetWidth; $('costForm').classList.add('swap-in');
        costCalc();
      });
      costBuilt = true;
    }
    costCalc();
  });

  /* =====================================================================
     RENT OR BUY
     ===================================================================== */
  var RB_KEY = 'pt.rentbuy.v2';
  var rb = load(RB_KEY, { price: 1500000, down: 20, rate: 4.5, years: 25, owner: 1.5, buyc: 7, sellc: 2, grow: 4, rent: 95000, rentgrow: 4, invest: 5, stay: 7 });
  var rbBuilt = false;
  var rbDraw = false;
  var RB_MAX = 30;

  // Follows two people month by month: one buys, one rents and invests what the buyer spent.
  // s.rent is the rent for one month.
  function rbSimulate(s) {
    var price = pos(s.price), downAmt = price * Math.min(100, pos(s.down)) / 100, loan = price - downAmt;
    var termYears = Math.max(1, pos(s.years) || 25), N = Math.round(termYears * 12);
    var r = pos(s.rate) / 1200;
    var pay = mortgagePayment(loan, pos(s.rate), termYears);
    var gHome = Math.pow(1 + n(s.grow) / 100, 1 / 12) - 1;
    var gInv = Math.pow(1 + n(s.invest) / 100, 1 / 12) - 1;
    var sell = pos(s.sellc) / 100;
    var value = price, bal = loan;
    var renter = downAmt + price * pos(s.buyc) / 100; // the renter keeps and invests the buyer's upfront cash
    var buyer = 0;
    var buyW = [value * (1 - sell) - bal], rentW = [renter];
    var firstBuyOut = 0, firstRent = pos(s.rent);
    for (var m = 1; m <= RB_MAX * 12; m++) {
      value *= 1 + gHome;
      var paid = 0;
      if (m <= N && bal > 0) {
        var interest = bal * r;
        var principal = Math.min(bal, pay - interest);
        bal -= principal;
        paid = interest + principal;
      }
      var ownerM = value * pos(s.owner) / 100 / 12;
      var rentM = pos(s.rent) * Math.pow(1 + n(s.rentgrow) / 100, Math.floor((m - 1) / 12));
      var buyOut = paid + ownerM;
      if (m === 1) { firstBuyOut = buyOut; }
      renter *= 1 + gInv;
      buyer *= 1 + gInv;
      if (buyOut > rentM) { renter += buyOut - rentM; } else { buyer += rentM - buyOut; }
      if (m % 12 === 0) { buyW.push(value * (1 - sell) - bal + buyer); rentW.push(renter); }
    }
    var breakEven = null;
    for (var y = 1; y <= RB_MAX; y++) { if (buyW[y] >= rentW[y]) { breakEven = y; break; } }
    return { buyW: buyW, rentW: rentW, breakEven: breakEven, firstBuyOut: firstBuyOut, firstRent: firstRent };
  }

  function rbChart(sim, stay) {
    var W = 600, H = 270, L = 8, R = 8, T = 14, B = 40;
    var all = sim.buyW.concat(sim.rentW);
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (max === min) { max = min + 1; }
    function x(y) { return L + (W - L - R) * y / RB_MAX; }
    function yv(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    function line(arr) { return arr.map(function (v, i) { return x(i).toFixed(1) + ',' + yv(v).toFixed(1); }).join(' '); }
    var ticks = [0, 10, 20, 30].map(function (t) {
      return '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="' + (t === 0 ? 'start' : (t === 30 ? 'end' : 'middle')) + '">' + (t === 0 ? 'Today' : t + ' yrs') + '</text>';
    }).join('');
    var cls = rbDraw ? 'chart draw' : 'chart';
    rbDraw = false;
    return '<svg class="' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Chart of wealth over 30 years for buying and renting">' +
      '<line class="l-stay" x1="' + x(stay) + '" x2="' + x(stay) + '" y1="' + T + '" y2="' + (H - B) + '" stroke-dasharray="4 5"/>' +
      '<polyline class="l-rent" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + line(sim.rentW) + '"/>' +
      '<polyline class="l-buy" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + line(sim.buyW) + '"/>' +
      '<circle class="d-buy" cx="' + x(stay) + '" cy="' + yv(sim.buyW[stay]) + '" r="5.5"/>' +
      '<circle class="d-rent" cx="' + x(stay) + '" cy="' + yv(sim.rentW[stay]) + '" r="5.5"/>' + ticks + '</svg>' +
      '<div class="chart-key"><span><i class="k-buy"></i>If you buy</span><span><i class="k-rent"></i>If you rent and invest</span><span>Dotted line: the year you plan to move</span></div>';
  }

  function rbInputs() {
    var s = {};
    for (var k in rb) { if (Object.prototype.hasOwnProperty.call(rb, k)) { s[k] = rb[k]; } }
    s.rent = pos(rb.rent) / 12; // people here think of rent by the year
    return s;
  }

  function rbCalc() {
    var out = $('rbOut');
    if (!out) { return; }
    var stay = Math.min(RB_MAX, Math.max(1, Math.round(pos(rb.stay)) || 7));
    var sim = rbSimulate(rbInputs());
    var diff = sim.buyW[stay] - sim.rentW[stay];
    var buyWins = diff >= 0;
    var html = '<div class="result-label">After ' + plural(stay, 'year', 'years') + '</div>' +
      '<div class="result-big">' + (buyWins ? 'Buying' : 'Renting') + ' wins</div>' +
      '<p class="result-note">' + (buyWins ? 'Buying' : 'Renting') + ' leaves you about <b>' + money(Math.abs(diff)) + '</b> better off than ' + (buyWins ? 'renting' : 'buying') + '.</p>';
    if (sim.breakEven === null) {
      html += '<div class="callout">With these numbers, buying does not catch up with renting within 30 years.</div>';
    } else if (sim.breakEven <= 1) {
      html += '<div class="callout green">Buying is ahead from the first year.</div>';
    } else {
      html += '<div class="callout' + (stay >= sim.breakEven ? ' green' : '') + '">Buying starts to win in <b>year ' + sim.breakEven + '</b>. ' +
        (stay >= sim.breakEven ? 'You plan to stay longer than that.' : 'You plan to leave before that, so the fees for buying and selling are not earned back.') + '</div>';
    }
    html += rbChart(sim, stay);
    html += rows([
      ['Your wealth if you buy', money(sim.buyW[stay])],
      ['Your wealth if you rent', money(sim.rentW[stay])],
      ['Monthly cost of owning, year one', money(sim.firstBuyOut)],
      ['Monthly rent, year one', money(sim.firstRent)]
    ]);
    html += '<p class="lede" style="margin-top:12px">"Wealth" is what you would walk away with: the home\'s value after selling costs and the loan, or the renter\'s savings. It assumes the renter invests the down payment and any monthly saving.</p>';
    out.innerHTML = html;
  }

  PT.register('rentbuy', function () {
    var view = $('view-rentbuy');
    if (!rbBuilt) {
      view.innerHTML = head('Rent or Buy', 'Buying costs a lot on day one and pays back slowly. This shows which choice leaves you with more money by the time you plan to move, and the year buying starts to win.') +
        '<div class="two"><div class="panel glass"><h2>Your numbers</h2>' +
        '<p class="subhead">If you buy</p>' + fields([
          { k: 'price', label: 'Price of the home', unit: 'money' },
          { k: 'down', label: 'Down payment', unit: '%' },
          { k: 'rate', label: 'Mortgage interest rate', unit: '%' },
          { k: 'years', label: 'Mortgage length', unit: 'years' },
          { k: 'buyc', label: 'Fees for buying', unit: '%', hint: 'Transfer fee, agency fee, trustee and bank fees. About 7% on a ready home, about 5% off-plan, where the developer pays the agent.' },
          { k: 'sellc', label: 'Fees for selling', unit: '%', hint: 'The agency fee and the developer\'s clearance letter.' },
          { k: 'owner', label: 'Yearly owner costs', unit: '%', hint: 'Service charges, upkeep and insurance, as a share of the home\'s value.' },
          { k: 'grow', label: 'Home value growth per year', unit: '%', hint: 'Nobody knows this. Try a low and a high figure.' }
        ], rb) +
        '<p class="subhead">If you rent</p>' + fields([
          { k: 'rent', label: 'Yearly rent for a similar home', unit: 'money' },
          { k: 'rentgrow', label: 'Rent rise per year', unit: '%' },
          { k: 'invest', label: 'Return on savings per year', unit: '%', hint: 'What the down payment would earn if you kept it invested.' },
          { k: 'stay', label: 'How long you will stay', unit: 'years' }
        ], rb) + '</div>' +
        '<div class="stick"><div class="panel glass" id="rbOut" aria-live="polite"></div>' +
        '<div class="actions"><button type="button" class="btn btn-gold" data-go="consult">Talk this through with a consultant</button></div></div></div>' + FINE;
      bind(view, RB_KEY, rb, rbCalc);
      rbBuilt = true;
    }
    rbDraw = true; // draw the lines once each time the screen opens, not on every keystroke
    rbCalc();
  });

  /* =====================================================================
     COMPARE HOMES
     ===================================================================== */
  var CMP_KEY = 'pt.compare.v2';
  var CRIT = [['location', 'Location and commute'], ['condition', 'Condition'], ['building', 'Building and facilities'], ['view', 'View and balcony'],
    ['space', 'Space and layout'], ['quiet', 'Quiet'], ['feel', 'Gut feeling']];
  var WEIGHT_WORDS = ['Does not matter', 'Nice to have', 'Important', 'Essential'];
  function blankHome(name) {
    var r = {};
    CRIT.forEach(function (c) { r[c[0]] = 3; });
    return { name: name, cost: '', size: '', r: r };
  }
  var cmp = load(CMP_KEY, {
    homes: [blankHome('Home A'), blankHome('Home B')],
    w: { location: 3, condition: 2, building: 2, view: 1, space: 2, quiet: 2, feel: 2 }
  });
  var cmpBuilt = false;

  function cmpHomesHtml() {
    return cmp.homes.map(function (h, i) {
      return '<div class="home-card"><label class="f"><span>Name</span><div class="in"><input type="text" data-h="' + i + '" data-hk="name" value="' + esc(h.name) + '" maxlength="40" placeholder="1-bed in the Marina"></div></label>' +
        '<div class="fields"><label class="f"><span>Yearly rent, or price</span><div class="in"><b data-cur>' + esc(PT.cur()) + '</b><input type="number" inputmode="decimal" min="0" step="any" data-h="' + i + '" data-hk="cost" value="' + esc(h.cost) + '" placeholder="0"></div></label>' +
        '<label class="f"><span>Size</span><div class="in"><input type="number" inputmode="decimal" min="0" step="any" data-h="' + i + '" data-hk="size" value="' + esc(h.size) + '" placeholder="0"><b class="after">sq ft</b></div></label></div>' +
        CRIT.map(function (c) {
          return '<label class="rate"><span>' + c[1] + '</span><output>' + h.r[c[0]] + ' / 5</output>' +
            '<input type="range" min="1" max="5" step="1" data-h="' + i + '" data-r="' + c[0] + '" value="' + h.r[c[0]] + '" aria-label="' + c[1] + ' for ' + esc(h.name) + '"></label>';
        }).join('') +
        (cmp.homes.length > 2 ? '<div class="actions"><button type="button" class="btn btn-quiet btn-sm" data-remove="' + i + '">Remove this home</button></div>' : '') +
        '</div>';
    }).join('');
  }

  function cmpCalc() {
    var out = $('cmpOut');
    if (!out) { return; }
    var wSum = 0;
    CRIT.forEach(function (c) { wSum += pos(cmp.w[c[0]]); });
    var list = cmp.homes.map(function (h, i) {
      var pts = 0;
      CRIT.forEach(function (c) { pts += pos(cmp.w[c[0]]) * n(h.r[c[0]]); });
      var score = wSum ? pts / (wSum * 5) * 100 : 0;
      var c2 = pos(h.cost), size = pos(h.size);
      return { name: h.name || 'Home ' + (i + 1), score: score, cost: c2, per: c2 > 0 && size > 0 ? c2 / size : null, value: c2 > 0 ? score / c2 : null };
    });
    var best = function (key, low) {
      var pick = null;
      list.forEach(function (x) {
        if (x[key] === null || (key === 'cost' && x.cost <= 0)) { return; }
        if (pick === null || (low ? x[key] < pick[key] : x[key] > pick[key])) { pick = x; }
      });
      return pick;
    };
    var topScore = best('score'), cheapest = best('cost', true), topValue = best('value');
    var sorted = list.slice().sort(function (a, b) { return b.score - a.score; });
    var tie = sorted.length > 1 && Math.abs(sorted[0].score - sorted[1].score) < 0.5;
    // Nothing rated yet: every slider is still on the middle value.
    var untouched = cmp.homes.every(function (h) {
      return CRIT.every(function (c) { return n(h.r[c[0]]) === 3; });
    });
    var html = '<div class="result-label">On what matters to you</div><div class="result-big">' +
      (untouched ? 'Rate your homes' : (wSum === 0 ? 'Set what matters' : (tie ? 'Too close to call' : esc(sorted[0].name)))) + '</div>';
    if (untouched) {
      html += '<p class="result-note">Move the sliders for each home and the winner appears here.</p>';
    } else if (wSum > 0 && !tie) {
      html += '<p class="result-note">Scores highest at <b>' + Math.round(sorted[0].score) + ' out of 100</b>.' +
        (topValue && topValue !== sorted[0] ? ' But <b>' + esc(topValue.name) + '</b> gives you more for the money.' : '') + '</p>';
    } else if (tie) {
      html += '<p class="result-note">The top two are within a point of each other. Let the cost, or a second viewing, decide.</p>';
    }
    html += '<div class="rank">' + sorted.map(function (x, i) {
      var badges = [];
      if (x === topScore && !tie && wSum > 0) { badges.push('Highest score'); }
      if (x === cheapest && list.filter(function (y) { return y.cost > 0; }).length > 1) { badges.push('Lowest cost'); }
      if (x === topValue && list.filter(function (y) { return y.value !== null; }).length > 1) { badges.push('Best value'); }
      return '<div class="rank-item' + (i === 0 && !tie && wSum > 0 ? ' win' : '') + '"><div class="rank-top"><h3>' + esc(x.name) + '</h3><b>' + Math.round(x.score) + '</b></div>' +
        '<div class="track"><i style="width:' + Math.max(2, x.score) + '%"></i></div>' +
        (badges.length ? '<div class="badges">' + badges.map(function (b) { return '<span>' + b + '</span>'; }).join('') + '</div>' : '') +
        '<small>' + (x.cost > 0 ? money(x.cost) : 'No cost entered') +
        (x.per !== null ? ', ' + money(x.per) + ' per sq ft' : '') + '</small></div>';
    }).join('') + '</div>';
    out.innerHTML = html;
  }

  PT.register('compare', function () {
    var view = $('view-compare');
    if (!cmpBuilt) {
      view.innerHTML = head('Compare Homes', 'After three viewings they blur together. Rate each home from 1 to 5, say what matters most to you, and see which one comes out on top.') +
        '<div class="two"><div><div class="panel glass"><h2>Your shortlist</h2>' +
        '<p class="lede">Rate straight after each viewing, while you still remember it.</p>' +
        '<div class="homes" id="cmpHomes">' + cmpHomesHtml() + '</div>' +
        '<div class="actions"><button type="button" class="btn" id="cmpAdd">Add another home</button></div></div>' +
        '<div class="panel glass"><h2>What matters to you</h2><p class="lede">Slide each one from "does not matter" to "essential".</p><div class="weights">' +
        CRIT.map(function (c) {
          return '<label class="rate"><span>' + c[1] + '</span><output>' + WEIGHT_WORDS[pos(cmp.w[c[0]])] + '</output>' +
            '<input type="range" min="0" max="3" step="1" data-w="' + c[0] + '" value="' + pos(cmp.w[c[0]]) + '" aria-label="How much ' + c[1] + ' matters"></label>';
        }).join('') + '</div></div></div>' +
        '<div class="stick"><div class="panel glass" id="cmpOut" aria-live="polite"></div></div></div>' + FINE;

      view.addEventListener('input', function (e) {
        var t = e.target;
        if (t.hasAttribute('data-curpick')) {
          PT.setCur(t.value);
          var signs = document.querySelectorAll('[data-cur]');
          for (var i = 0; i < signs.length; i++) { signs[i].textContent = t.value; }
        } else if (t.hasAttribute('data-w')) {
          cmp.w[t.getAttribute('data-w')] = n(t.value);
          t.parentNode.querySelector('output').textContent = WEIGHT_WORDS[n(t.value)];
        } else if (t.hasAttribute('data-h')) {
          var h = cmp.homes[n(t.getAttribute('data-h'))];
          if (!h) { return; }
          if (t.hasAttribute('data-r')) {
            h.r[t.getAttribute('data-r')] = n(t.value);
            t.parentNode.querySelector('output').textContent = t.value + ' / 5';
          } else {
            h[t.getAttribute('data-hk')] = t.value;
          }
        } else { return; }
        save(CMP_KEY, cmp);
        cmpCalc();
      });
      view.addEventListener('click', function (e) {
        var rm = e.target.getAttribute('data-remove');
        if (e.target.id === 'cmpAdd') {
          if (cmp.homes.length >= 4) { PT.toast('Four homes is the most you can compare at once.'); return; }
          cmp.homes.push(blankHome('Home ' + 'ABCD'.charAt(cmp.homes.length)));
        } else if (rm !== null) {
          cmp.homes.splice(n(rm), 1);
        } else { return; }
        save(CMP_KEY, cmp);
        $('cmpHomes').innerHTML = cmpHomesHtml();
        cmpCalc();
      });
      cmpBuilt = true;
    }
    cmpCalc();
  });

  /* =====================================================================
     VIEWING CHECKLIST
     ===================================================================== */
  var VIEW_KEY = 'pt.viewing.v2';
  var CHECKS = [
    { g: 'The building and the area', items: [
      ['b-lifts', 'The lifts all work and the wait is short'],
      ['b-common', 'Lobby, corridors and bin rooms are clean and cool'],
      ['b-parking', 'You have seen your parking space, and it is covered and allocated to this unit'],
      ['b-fac', 'Pool, gym and other facilities are open and looked after'],
      ['b-build', 'No construction site next door or planned in front of the view'],
      ['b-walk', 'You have walked to the metro, shop or school run you will actually use'],
      ['b-signal', 'Your phone has signal in every room'] ] },
    { g: 'Cooling and power', items: [
      ['ac-cool', 'The AC cools every room within a few minutes'],
      ['ac-noise', 'The AC is quiet, with no dripping, stains or smell from the vents'],
      ['ac-who', 'You know who pays for cooling: chiller free, or billed to you'],
      ['ac-sun', 'You know which way the main windows face, and how hot the afternoon sun gets'],
      ['ac-sockets', 'Enough sockets in each room, none loose or scorched'] ] },
    { g: 'Water and damp', items: [
      ['wat-taps', 'Taps and showers have good pressure, and hot water arrives quickly'],
      ['wat-drain', 'The toilets flush well and the sinks drain fast'],
      ['wat-stain', 'No damp patches or peeling paint on ceilings, especially under the AC units'],
      ['wat-smell', 'No musty or drain smell, including inside cupboards and bathrooms'],
      ['wat-under', 'It is dry under the kitchen and bathroom sinks'] ] },
    { g: 'Light, noise and view', items: [
      ['ln-listen', 'Stand still for one minute: no road, flight path or neighbour noise that would bother you'],
      ['ln-view', 'The view matches the ad, from the rooms the ad said'],
      ['ln-seal', 'Windows and balcony doors close tight, with no gaps for dust and heat'] ] },
    { g: 'Kitchen, bathrooms and space', items: [
      ['kb-appl', 'Oven, hob, extractor, fridge and washing machine all work'],
      ['kb-pests', 'No sign of pests in kitchen cupboards or bathroom corners'],
      ['kb-seal', 'Sealant around baths and showers is intact, with no black mould'],
      ['sp-fit', 'Your bed and sofa will fit (measure, do not guess)'],
      ['sp-store', 'There is somewhere for suitcases, a vacuum cleaner and shoes'] ] },
    { g: 'Money and paperwork', mode: 'rent', items: [
      ['rm-agent', 'The agent showed a broker card, and the ad carries a permit number'],
      ['rm-owner', 'You have seen the title deed, and the owner\'s name on it matches the contract'],
      ['rm-cheque', 'Cheques will be written to the owner named on the title deed'],
      ['rm-terms', 'Rent, number of cheques and their dates are confirmed in writing'],
      ['rm-deposit', 'The deposit amount and how you get it back are written in the contract'],
      ['rm-maint', 'The contract says who pays for repairs, and from what amount'],
      ['rm-ejari', 'The tenancy will be registered (Ejari), and you know who arranges it'],
      ['rm-movein', 'You know what the building needs before you can move in'] ] },
    { g: 'Money and paperwork', mode: 'buy', items: [
      ['bm-deed', 'You have seen the title deed, and the seller is the person named on it'],
      ['bm-service', 'You know the service charge per sq ft, and that none is overdue'],
      ['bm-mortgage', 'You know whether the home is mortgaged, and who clears it before transfer'],
      ['bm-tenant', 'You know whether it is vacant or rented, and when any tenancy ends'],
      ['bm-deal', 'The agreement states the deposit, the transfer date and who pays which fee'],
      ['bm-noc', 'You know who pays for the developer\'s clearance letter'],
      ['bm-snag', 'For a new home, a snagging inspection is booked before handover'],
      ['bm-offplan', 'For off-plan, payments go to the project\'s escrow account, never to a person'],
      ['bm-sold', 'You have checked what similar homes in the building sold for recently'] ] }
  ];
  var vw = load(VIEW_KEY, { mode: 'rent', name: '', marks: {}, notes: '' });
  var vwBuilt = false;

  function vwGroups() { return CHECKS.filter(function (g) { return !g.mode || g.mode === vw.mode; }); }
  function vwListHtml() {
    return vwGroups().map(function (g) {
      return '<div class="cl-group"><h3>' + g.g + '</h3>' + g.items.map(function (it) {
        var m = vw.marks[it[0]];
        return '<div class="cl-item"><p>' + esc(it[1]) + '</p><div class="tri" role="group" aria-label="' + esc(it[1]) + '">' +
          '<button type="button" data-id="' + it[0] + '" data-v="ok" aria-pressed="' + (m === 'ok' ? 'true' : 'false') + '">Fine</button>' +
          '<button type="button" data-id="' + it[0] + '" data-v="bad" aria-pressed="' + (m === 'bad' ? 'true' : 'false') + '">Problem</button></div></div>';
      }).join('') + '</div>';
    }).join('');
  }
  function vwStats() {
    var all = [], bad = [], ok = [], open = [];
    vwGroups().forEach(function (g) {
      g.items.forEach(function (it) {
        all.push(it);
        var m = vw.marks[it[0]];
        if (m === 'bad') { bad.push(it[1]); } else if (m === 'ok') { ok.push(it[1]); } else { open.push(it[1]); }
      });
    });
    return { total: all.length, bad: bad, ok: ok, open: open };
  }
  function vwReport() {
    var s = vwStats();
    var lines = ['Viewing report' + (vw.name ? ': ' + vw.name : ''), new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      'Checked ' + (s.total - s.open.length) + ' of ' + s.total + '. Checks failed: ' + s.bad.length + '.', ''];
    if (s.bad.length) { lines.push('FAILED (this was not true)'); s.bad.forEach(function (x) { lines.push('- ' + x); }); lines.push(''); }
    if (s.ok.length) { lines.push('PASSED'); s.ok.forEach(function (x) { lines.push('- ' + x); }); lines.push(''); }
    if (s.open.length) { lines.push('NOT CHECKED'); s.open.forEach(function (x) { lines.push('- ' + x); }); lines.push(''); }
    if (vw.notes.trim()) { lines.push('NOTES', vw.notes.trim()); }
    return lines.join('\n').trim();
  }
  function vwCalc() {
    var out = $('vwOut');
    if (!out) { return; }
    var s = vwStats();
    var done = s.total - s.open.length;
    var html = '<div class="result-label">' + (vw.name ? esc(vw.name) : 'This viewing') + '</div>' +
      '<div class="result-big">' + done + ' of ' + s.total + '</div>' +
      '<div class="progress"><i style="width:' + (s.total ? done / s.total * 100 : 0) + '%"></i></div>';
    if (!done) {
      html += '<p class="result-note">Tap <b>Fine</b> or <b>Problem</b> as you walk round. Tap again to undo.</p>';
    } else if (!s.bad.length) {
      html += '<div class="callout green">No problems marked so far.</div>';
    } else {
      html += '<div class="callout red"><b>' + plural(s.bad.length, 'check', 'checks') + ' failed. Raise ' + (s.bad.length === 1 ? 'it' : 'these') + ' before you commit:</b><ul class="plist">' +
        s.bad.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<div class="actions"><button type="button" class="btn btn-main" id="vwCopy">Copy the report</button>' +
      '<button type="button" class="btn btn-quiet" id="vwReset">Start again</button></div>';
    if (s.bad.length) {
      html += '<div class="actions"><button type="button" class="btn btn-gold" data-go="consult">Ask a consultant about these</button></div>';
    }
    out.innerHTML = html;
    // The small bar that stays in view on a phone while you work down the list.
    var mini = $('vwMini');
    if (mini) {
      mini.innerHTML = '<span><b>' + done + '</b> of ' + s.total + ' checked</span><span' + (s.bad.length ? ' class="bad"' : '') + '><b>' + s.bad.length + '</b> failed</span>';
    }
  }

  PT.register('viewing', function () {
    var view = $('view-viewing');
    if (!vwBuilt) {
      view.innerHTML = head('Viewing Checklist', 'You get about fifteen minutes inside, with an agent talking. Work down the list as you walk round, so nothing gets missed.') +
        '<div class="two"><div class="panel glass"><div class="sheet-head">' + segHtml('vwSeg', [['rent', 'Renting'], ['buy', 'Buying']], vw.mode) + '</div>' +
        '<label class="f"><span>Which home is this?</span><div class="in"><input type="text" id="vwName" value="' + esc(vw.name) + '" maxlength="50" placeholder="1-bed in the Marina"></div></label>' +
        '<div class="vw-mini glass" id="vwMini" aria-hidden="true"></div>' +
        '<div id="vwList">' + vwListHtml() + '</div>' +
        '<div class="cl-group"><h3>Your notes</h3><label for="vwNotes" hidden>Notes</label>' +
        '<textarea id="vwNotes" style="min-height:120px;margin-top:10px" placeholder="Anything the agent said, room sizes, things to check again.">' + esc(vw.notes) + '</textarea></div></div>' +
        '<div class="stick"><div class="panel glass" id="vwOut" aria-live="polite"></div></div></div>' +
        '<p class="fine">A checklist helps you notice things. It does not replace a professional snagging or inspection report before you buy.</p>';

      $('vwSeg').addEventListener('click', function (e) {
        var v = e.target.getAttribute('data-v');
        if (!v) { return; }
        vw.mode = v;
        save(VIEW_KEY, vw);
        setSeg('vwSeg', v);
        $('vwList').innerHTML = vwListHtml();
        vwCalc();
      });
      $('vwList').addEventListener('click', function (e) {
        var id = e.target.getAttribute('data-id');
        if (!id) { return; }
        var v = e.target.getAttribute('data-v');
        if (vw.marks[id] === v) { delete vw.marks[id]; } else { vw.marks[id] = v; }
        save(VIEW_KEY, vw);
        var pair = e.target.parentNode.querySelectorAll('button');
        for (var i = 0; i < pair.length; i++) {
          pair[i].setAttribute('aria-pressed', vw.marks[id] === pair[i].getAttribute('data-v') ? 'true' : 'false');
        }
        vwCalc();
      });
      $('vwName').addEventListener('input', function () { vw.name = this.value; save(VIEW_KEY, vw); vwCalc(); });
      $('vwNotes').addEventListener('input', function () { vw.notes = this.value; save(VIEW_KEY, vw); });
      view.addEventListener('click', function (e) {
        if (e.target.id === 'vwCopy') {
          PT.copyText(vwReport(), 'Report copied');
        } else if (e.target.id === 'vwReset') {
          if (e.target.getAttribute('data-armed') !== '1') {
            e.target.setAttribute('data-armed', '1');
            e.target.textContent = 'Tap again to clear';
            return;
          }
          vw.marks = {}; vw.notes = ''; vw.name = '';
          save(VIEW_KEY, vw);
          $('vwName').value = ''; $('vwNotes').value = '';
          $('vwList').innerHTML = vwListHtml();
          vwCalc();
          PT.toast('Checklist cleared');
        }
      });
      vwBuilt = true;
    }
    vwCalc();
  });

  /* =====================================================================
     MESSAGE WRITER
     ===================================================================== */
  var LET_KEY = 'pt.letters.v2';
  function g(v, k, fallback) { var x = (v[k] || '').toString().trim(); return x || fallback; }
  function amt(v, k) { var x = pos(v[k]); return x > 0 ? money(x) : '[amount]'; }
  var TEMPLATES = [
    { id: 'viewing', name: 'Ask for a viewing', hint: 'With your questions up front',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'The property', text: true, ph: 'Building, unit type or listing title' },
        { k: 'when', label: 'When you can view', text: true, ph: 'Weekday evenings after 6' }],
      build: function (v) {
        var qs = v.useq && PT.lastDecode && PT.lastDecode.questions.length ? PT.lastDecode.questions.slice(0, 8)
          : ['What is the size in sq ft, and which floor is it on?', 'How many cheques will the owner accept, and does the rent change with fewer?',
            'Who pays for cooling, and is there a parking space with the unit?', 'Is the unit vacant, and from what date can I move in?', 'What is the permit number of this listing?'];
        return 'Hello,\n\nI am interested in ' + g(v, 'addr', '[the property]') + ' and would like to arrange a viewing. I am available ' + g(v, 'when', '[days and times]') + '.\n\n' +
          'Before I come, could you tell me:\n' + qs.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') +
          '\n\nA reply in writing would be appreciated.\n\nThank you,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'lower', name: 'Offer a lower rent', hint: 'Using cheques as your bargaining chip',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'The property', text: true },
        { k: 'ask', label: 'Advertised yearly rent', unit: 'money' }, { k: 'offer', label: 'Your offer for the year', unit: 'money' },
        { k: 'chq', label: 'Cheques you can pay in', options: [['1 cheque', '1 cheque'], ['2 cheques', '2 cheques'], ['4 cheques', '4 cheques'], ['6 cheques', '6 cheques'], ['12 cheques', '12 cheques']] },
        { k: 'move', label: 'When you can move in', text: true, ph: '1 March' }],
      build: function (v) {
        return 'Hello,\n\nThank you for showing me ' + g(v, 'addr', '[the property]') + '. I would like to take it.\n\n' +
          'It is advertised at ' + amt(v, 'ask') + ' a year. I can offer ' + amt(v, 'offer') + ', paid in ' + g(v, 'chq', '1 cheque') + '. In return I can:\n' +
          '- move in on ' + g(v, 'move', '[date]') + ', so the unit does not sit empty\n- sign and hand over the cheques and deposit this week\n- send my Emirates ID, visa and salary certificate today\n\n' +
          'If the owner agrees, please send me the draft contract and a copy of the title deed.\n\nKind regards,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'increase', name: 'Reply to a rent increase', hint: 'At renewal',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'Your unit', text: true, ph: 'Unit 1204, building name' },
        { k: 'now', label: 'Current yearly rent', unit: 'money' }, { k: 'new', label: 'Proposed yearly rent', unit: 'money' },
        { k: 'counter', label: 'What you can agree to', unit: 'money' }, { k: 'renew', label: 'Contract ends on', text: true, ph: '30 June' }],
      build: function (v) {
        var now = pos(v.now), nw = pos(v['new']);
        var pct = now > 0 && nw > 0 ? ' That is a rise of ' + Math.round((nw / now - 1) * 100) + '%.' : '';
        return 'Hello,\n\nThank you for your message about the rent for ' + g(v, 'addr', '[unit]') + ' going from ' + amt(v, 'now') + ' to ' + amt(v, 'new') + ' a year.' + pct + '\n\n' +
          'My contract ends on ' + g(v, 'renew', '[date]') + '. My understanding is that a change to the rent needs written notice at least 90 days before that date, ' +
          'and that any increase has to stay within what the official rental index allows for this unit. Could you send me the index result you used?\n\n' +
          'I have paid on time and looked after the home, and I would like to stay. I can agree to ' + amt(v, 'counter') + ' a year. ' +
          'Keeping a reliable tenant also saves the owner an empty month and a new commission.\n\n' +
          'Please let me know if that is acceptable.\n\nKind regards,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'repair', name: 'Request a repair', hint: 'With a clear deadline',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'Your unit', text: true },
        { k: 'problem', label: 'What is wrong', text: true, ph: 'The AC in the bedroom is leaking and not cooling', max: 160, full: true },
        { k: 'since', label: 'Since when', text: true, ph: 'Monday 3 March' }, { k: 'days', label: 'Days you will allow', unit: 'days' }],
      build: function (v) {
        return 'Hello,\n\nI am writing about a repair needed at ' + g(v, 'addr', '[unit]') + '.\n\n' +
          'The problem: ' + g(v, 'problem', '[describe the problem]') + '. This started on ' + g(v, 'since', '[date]') + '.\n\n' +
          'Please arrange for it to be fixed within ' + (pos(v.days) || 7) + ' days of this message. I can give access with a day\'s notice, and I have photos and video if they would help.\n\n' +
          'Please confirm you have received this and tell me when the technician will come.\n\nThank you,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'deposit', name: 'Ask for your deposit back', hint: 'After you move out',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'The unit you left', text: true },
        { k: 'out', label: 'Date you handed over', text: true, ph: '31 January' }, { k: 'dep', label: 'Deposit paid', unit: 'money' },
        { k: 'fwd', label: 'Where to send it', text: true, ph: 'Your IBAN', full: true }],
      build: function (v) {
        return 'Hello,\n\nI handed over ' + g(v, 'addr', '[unit]') + ' and the keys on ' + g(v, 'out', '[date]') + '. The unit was cleaned and painted as the contract required, and the final utility bill has been settled.\n\n' +
          'Please return my security deposit of ' + amt(v, 'dep') + ' to: ' + g(v, 'fwd', '[IBAN]') + '.\n\n' +
          'If you intend to keep any part of it, please send me an itemised list of each deduction with the invoice or quote. ' +
          'I took dated photos and video at the handover.\n\nPlease reply within 14 days.\n\nThank you,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'offer', name: 'Offer below the asking price', hint: 'When buying a ready home',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'The property', text: true },
        { k: 'ask', label: 'Asking price', unit: 'money' }, { k: 'offer', label: 'Your offer', unit: 'money' },
        { k: 'pos', label: 'Your position', options: [['cash', 'Cash buyer'], ['mortgage', 'Mortgage pre-approval in hand'], ['applying', 'Applying for a mortgage']] },
        { k: 'why', label: 'Why you are offering less', text: true, ph: 'Two similar units in the building sold for less last month', max: 200, full: true }],
      build: function (v) {
        var p = { cash: 'I am a cash buyer and can share proof of funds.', mortgage: 'I have a mortgage pre-approval and can share it.',
          applying: 'I am applying for a mortgage and expect the pre-approval shortly.' }[v.pos || 'cash'];
        return 'Hello,\n\nThank you for showing me ' + g(v, 'addr', '[the property]') + '. I would like to make an offer of ' + amt(v, 'offer') + '.\n\n' +
          'I know the asking price is ' + amt(v, 'ask') + '. My offer reflects the following: ' + g(v, 'why', '[your reasons]') + '.\n\n' + p +
          ' I am ready to sign the sale agreement and place the deposit cheque as soon as the seller accepts.\n\n' +
          'Please put this offer to the seller in writing and let me know their response.\n\nKind regards,\n' + g(v, 'me', '[Your name]');
      } },
    { id: 'offplan', name: 'Questions about an off-plan home', hint: 'Before you pay a booking fee',
      fields: [{ k: 'me', label: 'Your name', text: true }, { k: 'addr', label: 'The project and unit', text: true, ph: 'Project name, 1-bedroom' }],
      build: function (v) {
        return 'Hello,\n\nI am interested in ' + g(v, 'addr', '[the project]') + '. Before I pay any booking amount, could you confirm the following in writing:\n\n' +
          '1. The full price, and every fee on top of it (transfer fee, registration, admin).\n' +
          '2. The payment plan, with each instalment, its date and what happens if one is late.\n' +
          '3. The completion date written in the contract, and the compensation if it is missed.\n' +
          '4. The project\'s registration number and the name of its escrow account.\n' +
          '5. The expected service charge per sq ft.\n' +
          '6. The exact unit: floor, view, size, and whether the size includes the balcony.\n' +
          '7. Whether I can sell before handover, and from what percentage paid.\n' +
          '8. Which other projects this developer has handed over, and whether they were on time.\n\n' +
          'Thank you,\n' + g(v, 'me', '[Your name]');
      } }
  ];
  var lt = load(LET_KEY, { tpl: 'viewing', v: { useq: true } });
  var ltBuilt = false;
  function ltTpl() { return TEMPLATES.filter(function (t) { return t.id === lt.tpl; })[0] || TEMPLATES[0]; }
  function ltFormHtml() {
    var t = ltTpl();
    var html = fields(t.fields, lt.v);
    if (t.id === 'viewing') {
      html += '<label class="check" style="margin-top:14px"><input type="checkbox" id="ltUseQ"' + (lt.v.useq ? ' checked' : '') + '>' +
        '<span>' + (PT.lastDecode && PT.lastDecode.questions.length ? 'Use the questions from the ad I just decoded' : 'Use the questions from the Ad Decoder (decode an ad first)') + '</span></label>';
    }
    return html;
  }
  function ltCalc() { var o = $('ltOut'); if (o) { o.value = ltTpl().build(lt.v); } }

  PT.register('letters', function () {
    var view = $('view-letters');
    if (!ltBuilt) {
      view.innerHTML = head('Message Writer', 'The right words are hard to find when money is involved. Pick the situation, fill in the gaps, and copy a message that is firm and polite.') +
        '<div class="two"><div class="panel glass"><h2>What do you need to say?</h2>' +
        '<div class="picker" id="ltPick">' + TEMPLATES.map(function (t) {
          return '<button type="button" class="pick" data-tpl="' + t.id + '" aria-pressed="' + (t.id === lt.tpl ? 'true' : 'false') + '">' + t.name + '<small>' + t.hint + '</small></button>';
        }).join('') + '</div><p class="subhead">Fill in the gaps</p><div id="ltForm">' + ltFormHtml() + '</div></div>' +
        '<div class="stick"><div class="panel glass"><h2>Your message</h2><p class="lede">You can edit it here before you copy it.</p>' +
        '<label for="ltOut" hidden>Your message</label><textarea id="ltOut" class="letter-out"></textarea>' +
        '<div class="actions"><button type="button" class="btn btn-main" id="ltCopy">Copy the message</button></div></div></div></div>' +
        '<p class="fine">These are general templates, not legal advice. Rules on rent increases, notice, repairs and deposits differ between emirates and change over time, so check what applies to your contract.</p>';
      view.addEventListener('input', function (e) {
        var t = e.target;
        if (t.id === 'ltOut') { return; }
        if (t.hasAttribute('data-curpick')) {
          PT.setCur(t.value);
          var signs = document.querySelectorAll('[data-cur]');
          for (var i = 0; i < signs.length; i++) { signs[i].textContent = t.value; }
        } else if (t.id === 'ltUseQ') {
          lt.v.useq = t.checked;
        } else if (t.getAttribute('data-k')) {
          lt.v[t.getAttribute('data-k')] = t.value;
        } else { return; }
        save(LET_KEY, lt);
        ltCalc();
      });
      view.addEventListener('change', function (e) {
        if (e.target.id === 'ltUseQ') { lt.v.useq = e.target.checked; save(LET_KEY, lt); ltCalc(); }
      });
      $('ltPick').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-tpl]') : null;
        if (!b) { return; }
        lt.tpl = b.getAttribute('data-tpl');
        save(LET_KEY, lt);
        var all = this.querySelectorAll('.pick');
        for (var i = 0; i < all.length; i++) { all[i].setAttribute('aria-pressed', all[i] === b ? 'true' : 'false'); }
        $('ltForm').innerHTML = ltFormHtml();
        ltCalc();
      });
      $('ltCopy').addEventListener('click', function () { PT.copyText($('ltOut').value, 'Message copied'); });
      ltBuilt = true;
    } else {
      $('ltForm').innerHTML = ltFormHtml();
    }
    ltCalc();
  });

  /* =====================================================================
     TALK TO A CONSULTANT
     Two ways, set in config.js: open the consultant's own website,
     and / or send a written request through WhatsApp or email.
     ===================================================================== */
  var CON_KEY = 'pt.consult.v2';
  var C = (PT.cfg && PT.cfg.consultant) || {};
  var ROLES = ['Renting a home', 'Buying a home to live in', 'Buying to invest', 'Buying off-plan', 'Selling or letting my property'];
  var TOPICS = ['A second opinion on a listing', 'Is this price or rent fair?', 'Which area suits my budget?', 'Is this off-plan project worth it?',
    'Help with an offer or a renewal', 'Checking an ad is genuine', 'Buying from overseas', 'Something else'];
  var con = load(CON_KEY, { name: '', contact: '', role: ROLES[0], topic: TOPICS[0], area: '', budget: '', when: '', msg: '', attach: true, tips: false });
  var conSent = false, conBusy = false, conError = '';
  var conBuilt = false;
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function siteUrl() {
    var u = (C.website || '').trim();
    if (!u) { return ''; }
    if (!/^https?:\/\//i.test(u)) { u = 'https://' + u; }
    return u;
  }
  function siteHost() { return siteUrl().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, ''); }
  function conChannels() {
    return { form: (C.formEmail || '').trim(), wa: digits(C.whatsapp), email: (C.email || '').trim(), phone: (C.phone || '').trim(), book: (C.bookingUrl || '').trim(), site: siteUrl() };
  }
  function conMessage() {
    var who = C.name ? ' ' + C.name : '';
    var lines = ['Hello' + who + ',', '', 'My name is ' + (con.name.trim() || '[your name]') + '. I am ' + con.role.charAt(0).toLowerCase() + con.role.slice(1) +
      ' and would like help with: ' + con.topic.charAt(0).toLowerCase() + con.topic.slice(1).replace(/\?$/, '') + '.', ''];
    if (con.contact.trim()) { lines.push('Reach me on: ' + con.contact.trim()); }
    if (con.area.trim()) { lines.push('Area or project: ' + con.area.trim()); }
    if (pos(con.budget) > 0) { lines.push('Budget: ' + money(pos(con.budget))); }
    if (con.when.trim()) { lines.push('Best time to reach me: ' + con.when.trim()); }
    if (con.msg.trim()) { lines.push('', con.msg.trim()); }
    if (con.tips) { lines.push('', 'Yes, please send me occasional property tips.'); }
    if (con.attach && PT.lastDecode) { lines.push('', '--- My decoded ad ---', PT.lastDecode.summary); }
    lines.push('', 'Sent from ' + PT.brand + '.');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function conCalc() {
    var ch = conChannels();
    var msg = conMessage();
    var enc = encodeURIComponent(msg);
    var subject = encodeURIComponent(PT.brand + ' request: ' + con.topic);
    var btns = [];
    if (ch.wa) { btns.push('<a class="btn btn-gold" id="conWa" target="_blank" rel="noopener" href="https://wa.me/' + ch.wa + '?text=' + enc + '">Send on WhatsApp</a>'); }
    if (ch.email) { btns.push('<a class="btn' + (ch.wa ? '' : ' btn-gold') + '" id="conEmail" href="mailto:' + esc(ch.email) + '?subject=' + subject + '&body=' + enc + '">Send by email</a>'); }
    if (ch.book) { btns.push('<a class="btn" id="conBook" target="_blank" rel="noopener" href="' + esc(ch.book) + '">Book a call</a>'); }
    if (ch.phone) { btns.push('<a class="btn" id="conCall" href="tel:' + esc(ch.phone.replace(/[^\d+]/g, '')) + '">Call ' + esc(ch.phone) + '</a>'); }
    var box = $('conSend');
    if (!box) { return; }
    $('conPreview').textContent = msg;
    if (ch.form) {
      if (conSent) {
        box.innerHTML = '<div class="sent"><span class="sent-tick"><svg aria-hidden="true"><use href="#i-tick"/></svg></span><div><h3>Request sent</h3>' +
          '<p>' + esc(C.name || 'The consultant') + ' has your request and will reply on ' + esc(con.contact.trim()) + '.</p></div></div>' +
          '<div class="actions"><button type="button" class="btn btn-quiet" id="conAgain">Send another request</button></div>';
        return;
      }
      box.innerHTML = (conError ? '<div class="callout red">' + esc(conError) + '</div>' : '') +
        '<div class="actions"><button type="button" class="btn btn-gold" id="conSubmit"' + (conBusy ? ' disabled' : '') + '>' + (conBusy ? 'Sending…' : 'Send request') + '</button></div>' +
        (btns.length ? '<p class="lede" style="margin-top:14px">Or send it yourself:</p><div class="contact-btns">' + btns.join('').replace('btn btn-gold', 'btn') + '</div>' : '') +
        '<p class="lede" style="margin-top:12px">Your request goes straight to the consultant by email.</p>';
      return;
    }
    if (btns.length) {
      box.innerHTML = '<div class="contact-btns">' + btns.join('') + '</div>' +
        '<p class="lede" style="margin-top:12px">Your request opens in your own WhatsApp or email, ready to send. Nothing is sent until you press send there.</p>';
    } else if (ch.site) {
      box.innerHTML = '<div class="actions"><button type="button" class="btn btn-main" id="conCopy">Copy my request</button></div>' +
        '<p class="lede" style="margin-top:12px">Copy it, then paste it into the contact form on the website.</p>';
    } else {
      box.innerHTML = '<div class="callout">Consultations are not open yet. You can still copy your request and keep it for later.</div>' +
        '<div class="actions"><button type="button" class="btn btn-main" id="conCopy">Copy my request</button></div>';
    }
  }
  // Sends the form to the consultant's inbox through FormSubmit (a free form-to-email service).
  function conSubmit() {
    if (conBusy) { return; }
    var to = (C.formEmail || '').trim();
    if (!con.name.trim() || !con.contact.trim()) {
      conError = 'Please add your name and a phone number or email, so the consultant can reply.';
      conCalc();
      return;
    }
    conBusy = true; conError = '';
    conCalc();
    var body = {
      _subject: PT.brand + ' request: ' + con.topic + ' (' + con.name.trim() + ')',
      _template: 'table', _captcha: 'false',
      Name: con.name.trim(), 'Reach them on': con.contact.trim(), 'They are': con.role, 'Help with': con.topic,
      'Area or project': con.area.trim() || '-', Budget: pos(con.budget) > 0 ? money(pos(con.budget)) : '-',
      'Best time': con.when.trim() || '-', Message: con.msg.trim() || '-',
      'Decoded ad': con.attach && PT.lastDecode ? PT.lastDecode.summary : '-',
      'Wants occasional tips': con.tips ? 'YES, may be contacted again' : 'No'
    };
    if (/^\S+@\S+\.\S+$/.test(con.contact.trim())) { body._replyto = con.contact.trim(); }
    fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
    }).then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
      .then(function (r) {
        conBusy = false;
        if (r.ok && String(r.j.success) === 'true') { conSent = true; PT.count('requests'); }
        else if (/activat/i.test(String(r.j.message || ''))) { conError = 'The request form is still being switched on. Please try again in a little while' + (digits(C.whatsapp) ? ', or use WhatsApp below.' : '.'); }
        else { conError = 'The request could not be sent just now. Please try again' + (digits(C.whatsapp) ? ', or use WhatsApp below.' : '.'); }
        conCalc();
      })
      .catch(function () {
        conBusy = false;
        conError = 'No connection. Check your internet and try again' + (digits(C.whatsapp) ? ', or use WhatsApp below.' : '.');
        conCalc();
      });
  }
  function chips(key, list) {
    return '<div class="choices" data-choices="' + key + '">' + list.map(function (x) {
      return '<button type="button" class="chip" data-choice="' + esc(x) + '" aria-pressed="' + (con[key] === x ? 'true' : 'false') + '">' + esc(x) + '</button>';
    }).join('') + '</div>';
  }
  function openSite() {
    var url = siteUrl();
    if (!url) { return; }
    if (C.websiteInsideApp === false) { window.open(url, '_blank', 'noopener'); return; }
    $('webTitle').textContent = siteHost();
    $('webOut').href = url;
    $('webFrame').src = url;
    $('webview').classList.remove('closing');
    $('webview').hidden = false;
  }
  function closeSite() {
    var w = $('webview');
    if (w.hidden) { return; }
    w.classList.add('closing');
    setTimeout(function () { w.hidden = true; w.classList.remove('closing'); $('webFrame').src = 'about:blank'; }, 300);
  }

  PT.register('consult', function () {
    var view = $('view-consult');
    if (!conBuilt) {
      var name = C.name || 'Your consultant';
      var tick = '<svg aria-hidden="true"><use href="#i-tick"/></svg>';
      var site = siteUrl();
      view.innerHTML = head('Talk to a consultant', 'Tools can tell you what to ask. A person can tell you what they would do.') +
        '<div class="two"><div>' +
        '<div class="panel glass"><div class="who"><div class="avatar" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + '</div><div><h3>' + esc(name) + '</h3><p>' + esc(C.title || 'Property consultant') + '</p></div></div>' +
        '<ul class="ticks">' +
        (C.promise ? '<li>' + tick + '<span>' + esc(C.promise) + '</span></li>' : '') +
        (C.responseTime ? '<li>' + tick + '<span>' + esc(C.responseTime) + '</span></li>' : '') +
        '<li>' + tick + '<span>An honest view of a listing, a price or an offer.</span></li></ul>' +
        (site ? '<div class="actions"><button type="button" class="btn btn-gold" id="conSite">' + esc(C.websiteLabel || 'Visit my website') + '</button></div>' +
          '<p class="lede" style="margin-top:10px">' + esc(siteHost()) + '</p>' : '') + '</div>' +
        '<div class="panel glass"><h2>Request a consultation</h2><p class="lede">A few quick answers, and your request is written for you.</p>' +
        '<p class="qlabel" style="margin-top:18px">You are</p>' + chips('role', ROLES) +
        '<p class="qlabel">You would like help with</p>' + chips('topic', TOPICS) +
        '<div class="fields">' +
        '<label class="f"><span>Your name</span><div class="in"><input type="text" data-k="name" value="' + esc(con.name) + '" maxlength="60" autocomplete="name"></div></label>' +
        '<label class="f"><span>Your phone or email</span><div class="in"><input type="text" data-k="contact" value="' + esc(con.contact) + '" maxlength="80" placeholder="050 123 4567" autocomplete="tel"></div></label>' +
        '<label class="f"><span>Area or project</span><div class="in"><input type="text" data-k="area" value="' + esc(con.area) + '" maxlength="80" placeholder="Marina, JVC, a project name"></div></label>' +
        '<label class="f"><span>Budget</span><div class="in"><b>' + esc(PT.cur()) + '</b><input type="number" inputmode="decimal" min="0" step="any" data-k="budget" value="' + esc(con.budget) + '" placeholder="0"></div><small>Yearly rent, or purchase price.</small></label>' +
        '<label class="f"><span>Best time to reach you</span><div class="in"><input type="text" data-k="when" value="' + esc(con.when) + '" maxlength="60" placeholder="Weekdays after 6 pm"></div></label>' +
        '</div><label class="f" style="margin-top:14px"><span>Anything else</span>' +
        '<textarea data-k="msg" style="min-height:110px" placeholder="What are you unsure about?">' + esc(con.msg) + '</textarea></label>' +
        '<label class="check" style="margin-top:14px"><input type="checkbox" id="conAttach"' + (con.attach ? ' checked' : '') + '><span id="conAttachText"></span></label>' +
        '<label class="check" style="margin-top:12px"><input type="checkbox" id="conTips"' + (con.tips ? ' checked' : '') + '><span>Send me occasional property tips and market updates. You can stop these at any time.</span></label>' +
        '<div id="conSend" style="margin-top:18px"></div></div></div>' +
        '<div class="stick"><div class="panel glass"><h3>What will be sent</h3><p class="lede">Check it before you send.</p><p id="conPreview" style="white-space:pre-wrap;margin-top:12px;font-size:0.93rem;color:var(--muted)"></p></div></div></div>' +
        '<p class="fine">A consultation is a conversation, not a regulated legal, mortgage or investment service unless the consultant tells you otherwise. Your details go only to the consultant, through your own app.</p>';
      view.addEventListener('input', function (e) {
        var k = e.target.getAttribute('data-k');
        if (e.target.id === 'conAttach') { con.attach = e.target.checked; }
        else if (e.target.id === 'conTips') { con.tips = e.target.checked; }
        else if (k) { con[k] = e.target.value; }
        else { return; }
        save(CON_KEY, con);
        conCalc();
      });
      view.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-choice]') : null;
        if (chip) {
          var group = chip.parentNode;
          con[group.getAttribute('data-choices')] = chip.getAttribute('data-choice');
          var all = group.querySelectorAll('.chip');
          for (var i = 0; i < all.length; i++) { all[i].setAttribute('aria-pressed', all[i] === chip ? 'true' : 'false'); }
          save(CON_KEY, con);
          conCalc();
        } else if (e.target.id === 'conCopy') {
          PT.copyText(conMessage(), 'Request copied');
        } else if (e.target.id === 'conSubmit') {
          conSubmit();
        } else if (e.target.id === 'conAgain') {
          conSent = false; con.msg = ''; save(CON_KEY, con);
          var ta = view.querySelector('textarea[data-k="msg"]'); if (ta) { ta.value = ''; }
          conCalc();
        } else if (e.target.id === 'conSite') {
          openSite();
        }
      });
      $('webClose').addEventListener('click', closeSite);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSite(); } });
      conBuilt = true;
    }
    $('conAttachText').textContent = PT.lastDecode ? 'Attach the ad I just decoded' : 'Attach my decoded ad (decode one first and it will be added here)';
    conCalc();
  });

  // For checking the sums in the browser console.
  window.PTTools = { mortgagePayment: mortgagePayment, rbSimulate: rbSimulate };
})();
