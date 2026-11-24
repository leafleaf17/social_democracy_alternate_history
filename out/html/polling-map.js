(function() {
  'use strict';

  var states = [
    ['AK','Alaska'],['WA','Washington'],['OR','Oregon'],['CA','California'],
    ['ID','Idaho'],['NV','Nevada'],['AZ','Arizona'],['HI','Hawaii'],
    ['MT','Montana'],['WY','Wyoming'],['UT','Utah'],['CO','Colorado'],
    ['NM','New Mexico'],['ND','North Dakota'],['SD','South Dakota'],['NE','Nebraska'],
    ['KS','Kansas'],['OK','Oklahoma'],['TX','Texas'],['MN','Minnesota'],
    ['IA','Iowa'],['MO','Missouri'],['AR','Arkansas'],['LA','Louisiana'],
    ['WI','Wisconsin'],['IL','Illinois'],['KY','Kentucky'],['TN','Tennessee'],
    ['MS','Mississippi'],['MI','Michigan'],['IN','Indiana'],['OH','Ohio'],
    ['WV','West Virginia'],['AL','Alabama'],['NY','New York'],['PA','Pennsylvania'],
    ['VA','Virginia'],['NC','North Carolina'],['GA','Georgia'],['FL','Florida'],
    ['VT','Vermont'],['NJ','New Jersey'],['MD','Maryland'],['SC','South Carolina'],
    ['NH','New Hampshire'],['DE','Delaware'],['ME','Maine'],['MA','Massachusetts'],
    ['CT','Connecticut'],['RI','Rhode Island'],['DC','District of Columbia']
  ];

  var svgUrls = [
    'img/Blank_US_Map_(states_only).svg',
    'Blank_US_Map_(states_only).svg',
    'https://wikimedia.org'
  ];

  var colors = {
    dem: ['#949bb3', '#8aafff', '#577ccc', '#1c408c'],
    rep: ['#cf8980', '#ff8b98', '#ff5865', '#bf1d29']
  };

  var mapReady = false;
  var svgLoading = false;
  var activeTab = 'pres'; // 'pres', 'senate', or 'gov'

  function getQ() {
    var ui = window.dendryUI;
    return (ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities) || null;
  }

  function getPolling() {
    var q = getQ();
    if (!q) return null;
    if (typeof window.simulate_polling === 'function') window.simulate_polling();
    return q.polling || null;
  }

  function colorForMargin(margin) {
    var abs = Math.abs(margin);
    var band = abs >= 15 ? 3 : abs >= 5 ? 2 : abs >= 1 ? 1 : 0;
    return (margin >= 0 ? colors.dem : colors.rep)[band];
  }

  function getActiveRaces(q, tab) {
    var yr = Number(q.year) || 2021;
    if (tab === 'pres') return null;

    if (tab === 'senate') {
      if (yr >= 2023) {
        return q.senate_races_2024 || [
          'AZ','CA','CT','DE','FL','HI','IN','ME','MD','MA','MI','MN','MS','MO',
          'MT','NE','NV','NJ','NM','NY','ND','OH','PA','RI','TN','TX','UT','VT',
          'VA','WA','WV','WI','WY'
        ];
      }
      return q.senate_races_2022 || [
        'AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IN','IA',
        'KS','KY','LA','MD','MO','NV','NH','NY','NC','ND','OH','OK','OR','PA',
        'SC','SD','UT','VT','WA','WI'
      ];
    }

    if (tab === 'gov') {
      var govMap = q.gov_races || {
        2021: ['NJ', 'VA'],
        2022: ['AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IA','KS','ME','MD','MA','MI','MN','NE','NV','NH','NM','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','VT','WI','WY'],
        2023: ['KY', 'LA', 'MS']
      };
      if (govMap[yr]) return govMap[yr];
      return yr < 2022 ? govMap[2021] : govMap[2022];
    }
    return null;
  }

  function calcRaceResult(q, polling, code, tab) {
    var base = polling[code];
    if (!base) return null;
    var buff = 0;
    if (tab === 'senate') {
      buff += Number(q.nat_senate_buff || 0);
      if (q.senate_buffs && q.senate_buffs[code]) buff += Number(q.senate_buffs[code]);
    }
    if (tab === 'gov' && q.gov_buffs && q.gov_buffs[code]) {
      buff += Number(q.gov_buffs[code]);
    }

    var dem = +(Math.max(1, Math.min(99, Number(base.dem) + buff))).toFixed(2);
    var rep = +(100 - dem).toFixed(2);
    var margin = +(dem - rep).toFixed(2);

    var cands = { dem: 'Generic Democrat', rep: 'Generic Republican' };
    if (tab === 'pres' && q.candidates && q.candidates.pres) {
      cands = q.candidates.pres;
    } else if (tab === 'senate' && q.candidates && q.candidates.senate && q.candidates.senate[code]) {
      cands = q.candidates.senate[code];
    } else if (tab === 'gov' && q.candidates && q.candidates.gov && q.candidates.gov[code]) {
      cands = q.candidates.gov[code];
    }

    return {
      name: base.name,
      ev: base.ev,
      dem: dem,
      rep: rep,
      margin: margin,
      demCand: cands.dem,
      repCand: cands.rep
    };
  }

  function tooltipText(code, res, tab, isActive) {
    if (!isActive) {
      var label = tab === 'senate' ? 'Senate' : 'Gubernatorial';
      return '<strong>' + res.name + ' (' + code + ')</strong><br>' +
        '<span style="color:#999999;">No ' + label + ' election this cycle</span>';
    }

    var m = Number(res.margin);
    var lead = m > 0 ? 'Democrat lead' : m < 0 ? 'Republican lead' : 'Tie';
    var pre = m > 0 ? 'D+' : m < 0 ? 'R+' : 'Even ';
    var marginColor = m > 0 ? '#5c9eff' : m < 0 ? '#ff5865' : '#ffffff';
    var extra = tab === 'pres' ? '<br>' + res.ev + ' electoral votes' : '';

    return '<strong>' + res.name + ' (' + code + ')</strong> — ' + lead + '<br>' +
      '<span style="color:#5c9eff;"><strong>' + res.demCand + '</strong></span>: ' + res.dem.toFixed(2) + '%<br>' +
      '<span style="color:#ff5865;"><strong>' + res.repCand + '</strong></span>: ' + res.rep.toFixed(2) + '%<br>' +
      'Margin: <span style="color:' + marginColor + ';"><strong>' + pre + Math.abs(m).toFixed(2) + '</strong></span> points' +
      extra;
  }

    function formatDiff(diff) {
    if (diff > 0) return '<span class="seat-diff" data-dir="gain">(+' + diff + ')</span>';
    if (diff < 0) return '<span class="seat-diff" data-dir="loss">(' + diff + ')</span>';
    return '<span class="seat-diff" data-dir="even">(±0)</span>';
  }


  function addStyles() {
    if (document.getElementById('polling-map-styles')) return;
    var s = document.createElement('style');
    s.id = 'polling-map-styles';
    s.textContent =
      '#polling-map-drawer,.polling-map-drawer{width:min(1100px,94vw) !important;height:min(86vh,900px) !important;top:7vh !important;right:3vw !important;overflow:auto !important;z-index:40 !important;padding:1.2em !important;background:#000000 !important;background-color:#000000 !important;color:#ffffff !important;border:1px solid #444 !important}' +
      '.polling-map-content h2,.polling-map-content p,.polling-map-tooltip{color:#ffffff !important}' +
      '.polling-map-drawer button{background:#222222 !important;color:#ffffff !important;border:1px solid #666666 !important;padding:5px 12px;cursor:pointer;font-weight:bold}' +
      '.polling-map-drawer button:hover{background:#333333 !important;border-color:#ffffff !important}' +
      '.polling-map-tabs{display:flex;gap:8px;margin:0.5em 0 0.7em}' +
      '.polling-map-tab.active{background:#1c408c !important;border-color:#5c9eff !important;color:#ffffff !important}' +
      '#polling-map-drawer .polling-map-score{margin:0.3em 0 0.75em;font-size:1.4em;font-weight:bold;letter-spacing:0.02em}' +
      '#polling-map-drawer .polling-map-score span:first-child{color:#5c9eff !important}' +
      '#polling-map-drawer .polling-map-score span:last-child{color:#ff5865 !important}' +
      '.polling-map-legend{display:none !important}' +
      '.polling-map-svg-wrap{width:100%;min-height:300px;background:#000000 !important;border:1px solid #444;overflow:auto}' +
      '.polling-map-svg-wrap svg{display:block;width:100%;max-width:960px;height:auto;margin:0 auto;background:#000000 !important}' +
      '.polling-map-svg-wrap svg rect{fill:#000000 !important}' +
      '.polling-map-state{cursor:pointer;stroke:#555555 !important;stroke-width:0.75px}.polling-map-state:hover{opacity:.85;stroke:#ffffff !important}' +
      '.polling-map-tooltip{display:none;position:absolute;z-index:5;white-space:normal;padding:.55em .75em;max-width:265px;background:#171717 !important;color:#fff !important;border:1px solid #fff;font:14px/1.45 sans-serif;pointer-events:none}' +
      '.polling-map-tooltip.visible{display:block}';
    document.head.appendChild(s);
  }

  function findStateShape(svg, code, name) {
    var byId = svg.querySelector('#' + code) || svg.querySelector('#' + code.toLowerCase());
    if (byId) return byId;
    var targetCode = code.toLowerCase();
    var targetName = name.toLowerCase();
    var candidates = svg.querySelectorAll('path, g, circle, polygon');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var id = (el.getAttribute('id') || '').toLowerCase();
      var label = (el.getAttribute('inkscape:label') || el.getAttribute('data-name') || '').toLowerCase();
      var titleEl = el.querySelector(':scope > title');
      var title = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      if (id === targetCode || id === targetName || label === targetCode || label === targetName || title === targetName || title === targetCode) {
        return el;
      }
    }
    return null;
  }

  function ensureDrawerContent(drawer) {
    addStyles();
    var content = drawer.querySelector('.polling-map-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'polling-map-content';
      drawer.appendChild(content);
    }

    var tabBar = content.querySelector('.polling-map-tabs');
    if (!tabBar) {
      tabBar = document.createElement('div');
      tabBar.className = 'polling-map-tabs';
      [
        { id: 'pres', label: 'Presidential' },
        { id: 'senate', label: 'Senate' },
        { id: 'gov', label: 'Governor' }
      ].forEach(function(t) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'polling-map-tab';
        btn.dataset.tab = t.id;
        btn.textContent = t.label;
        btn.onclick = function() {
          activeTab = t.id;
          updateMap();
        };
        tabBar.appendChild(btn);
      });
      content.appendChild(tabBar);
    }

    tabBar.querySelectorAll('.polling-map-tab').forEach(function(b) {
      if (b.dataset.tab === activeTab) b.classList.add('active');
      else b.classList.remove('active');
    });

var score = content.querySelector('.polling-map-score');
if (!score) {
score = document.createElement('div');
score.className = 'polling-map-score';
content.appendChild(score);
}
var wrap = content.querySelector('.polling-map-svg-wrap');
if (!wrap) {
wrap = document.createElement('div');
wrap.className = 'polling-map-svg-wrap';
wrap.innerHTML = 'Loading map...';
content.appendChild(wrap);
}
if (!mapReady && !svgLoading) {
svgLoading = true;
tryLoadSvg(svgUrls, 0, wrap);
}
}
function updateMap() {
var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
if (!drawer) return;
ensureDrawerContent(drawer);
var q = getQ();
var polling = getPolling();
var svg = drawer.querySelector('.polling-map-svg-wrap svg');
if (!q || !polling || !svg || !mapReady) return;
var yr = Number(q.year) || 2021;
var activeList = getActiveRaces(q, activeTab);
var demTotal = 0, repTotal = 0;
if (activeTab === 'senate') {
if (yr >= 2023) {
demTotal = 28;
repTotal = 39;
} else {
demTotal = 36;
repTotal = 30;
}
}
var tip = drawer.querySelector('.polling-map-tooltip');
if (!tip) {
tip = document.createElement('div');
tip.className = 'polling-map-tooltip';
drawer.appendChild(tip);
}
states.forEach(function(pair) {
var code = pair[0];
var name = pair[1];
var shape = findStateShape(svg, code, name);
if (!shape) return;
var isActive = (activeList === null) || (activeList.indexOf(code) !== -1);
var res = calcRaceResult(q, polling, code, activeTab);
if (!res) return;
if (isActive) {
if (activeTab === 'pres') {
if (res.margin >= 0) demTotal += Number(res.ev);
else repTotal += Number(res.ev);
} else {
if (res.margin >= 0) demTotal += 1;
else repTotal += 1;
}
}
var col = isActive ? colorForMargin(res.margin) : '#262626';
shape.style.setProperty('fill', col, 'important');
shape.setAttribute('fill', col);
shape.querySelectorAll('path, circle, polygon').forEach(function(el) {
el.style.setProperty('fill', col, 'important');
el.setAttribute('fill', col);
});
shape.classList.add('polling-map-state');
shape.onpointerenter = function(e) {
tip.innerHTML = tooltipText(code, res, activeTab, isActive);
tip.classList.add('visible');
var r = drawer.getBoundingClientRect();
tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 275) + 'px';
tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 155) + 'px';
};
shape.onpointermove = shape.onpointerenter;
shape.onpointerleave = function() { tip.classList.remove('visible'); };
});
var score = drawer.querySelector('.polling-map-score');
 var score = drawer.querySelector('.polling-map-score');
    if (score) {
      if (activeTab === 'senate') {
        var currentDemSenate = Number(q.dem_senate_seats) || 50;
        var currentRepSenate = 100 - currentDemSenate;
        var demDiff = formatDiff(demTotal - currentDemSenate);
        var repDiff = formatDiff(repTotal - currentRepSenate);

        score.innerHTML =
          '<span class="score-dem">Democrat: ' + demTotal + ' Seats ' + demDiff + '</span>' +
          '<span class="score-sep" style="margin:0 0.5em;">·</span>' +
          '<span class="score-rep">Republican: ' + repTotal + ' Seats ' + repDiff + '</span>';
      } else {
        var unit = activeTab === 'pres' ? 'EV' : 'Races';
        score.innerHTML =
          '<span class="score-dem">Democrat: ' + demTotal + ' ' + unit + '</span>' +
          '<span class="score-sep" style="margin:0 0.5em;">·</span>' +
          '<span class="score-rep">Republican: ' + repTotal + ' ' + unit + '</span>';
      }

      var demSpan = score.querySelector('.score-dem');
      var sepSpan = score.querySelector('.score-sep');
      var repSpan = score.querySelector('.score-rep');
      if (demSpan) demSpan.style.setProperty('color', '#5c9eff', 'important');
      if (sepSpan) sepSpan.style.setProperty('color', '#888888', 'important');
      if (repSpan) repSpan.style.setProperty('color', '#ff5865', 'important');

      score.querySelectorAll('.seat-diff').forEach(function(el) {
        var dir = el.getAttribute('data-dir');
        var col = dir === 'gain' ? '#4ade80' : dir === 'loss' ? '#ff5865' : '#aaaaaa';
        el.style.setProperty('color', col, 'important');
      });
    }
}
function tryLoadSvg(urls, idx, wrap) {
if (idx >= urls.length) {
svgLoading = false;
wrap.innerHTML = 'Failed to load U.S. SVG map.';
return;
}
fetch(urls[idx])
.then(function(r) { if (!r.ok) throw new Error(r.status); return r.text(); })
.then(function(txt) {
var doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
var parsed = doc.querySelector('svg');
if (!parsed) throw new Error('Bad SVG');
var svg = document.importNode(parsed, true);
svg.removeAttribute('width');
svg.removeAttribute('height');
if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 959 593');
var dc = findStateShape(svg, 'DC', 'District of Columbia');
if (dc && dc.tagName.toLowerCase() === 'circle') {
dc.setAttribute('r', '6');
dc.style.stroke = '#fff';
}
wrap.innerHTML = '';
wrap.appendChild(svg);
mapReady = true;
svgLoading = false;
updateMap();
})
.catch(function() { tryLoadSvg(urls, idx + 1, wrap); });
}
  function makeDraggable(drawer) {
    if (!drawer || drawer.dataset.draggableReady) return;
    drawer.dataset.draggableReady = '1';

    var handle = drawer.querySelector('h2') ? drawer.querySelector('h2').parentElement : drawer;
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';

    var dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('pointerdown', function(e) {
      if (e.target.closest('button')) return; // Don't drag when clicking Close
      dragging = true;
      var rect = drawer.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      drawer.style.setProperty('right', 'auto', 'important');
      drawer.style.setProperty('bottom', 'auto', 'important');
      drawer.style.setProperty('left', startLeft + 'px', 'important');
      drawer.style.setProperty('top', startTop + 'px', 'important');
      e.preventDefault();
    });

    window.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var newLeft = Math.max(0, Math.min(window.innerWidth - 120, startLeft + dx));
      var newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
      drawer.style.setProperty('left', newLeft + 'px', 'important');
      drawer.style.setProperty('top', newTop + 'px', 'important');
    });

    window.addEventListener('pointerup', function() {
      dragging = false;
    });
  }
function initObserver() {
addStyles();
var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
if (drawer) {
var obs = new MutationObserver(function() {
if (drawer.classList.contains('open')) {
updateMap();
}
});
obs.observe(drawer, { attributes: true, attributeFilter: ['class', 'style'] });
if (drawer.classList.contains('open')) updateMap();
}
  function initObserver() {
    addStyles();
    var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
    if (drawer) {
      makeDraggable(drawer);
      var obs = new MutationObserver(function() {
        if (drawer.classList.contains('open')) {
          updateMap();
        }
      });
      obs.observe(drawer, { attributes: true, attributeFilter: ['class', 'style'] });
      if (drawer.classList.contains('open')) updateMap();
    }

    document.addEventListener('click', function() {
      setTimeout(updateMap, 50);
    });
  }
document.addEventListener('click', function() {
setTimeout(updateMap, 50);
});
}
window.openPollingMap = updateMap;
window.updatePollingMap = updateMap;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', initObserver);
} else {
initObserver();
}
})();
(function() {
  'use strict';

  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function getQ() {
    var ui = window.dendryUI;
    return (ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities) || null;
  }

  function ensureHistory(q) {
    if (!q.econ_history) {
      q.econ_history = {
        labels: ['Feb 20','Mar 20','Apr 20','May 20','Jun 20','Jul 20','Aug 20','Sep 20','Oct 20','Nov 20','Dec 20','Jan 21'],
        inflation:    [2.3, 1.5, 0.3, 0.1, 0.6, 1.0, 1.3, 1.4, 1.2, 1.2, 1.4, Number(q.inflation || 1.4)],
        unemployment: [3.5, 4.4, 14.8, 13.3, 11.1, 10.2, 8.4, 7.9, 6.9, 6.7, 6.7, Number(q.unemployment || 6.3)],
                gdp: [21.5, 21.1, 19.6, 19.8, 20.4, 21.0, 21.4, 21.6, 21.7, 21.8, 21.8, Number(q.us_gdp || 21.8)],
        budget:       [-18, -22, -31, -34, -33, -32, -31, -31, -30, -30, -29, Number(q.budget || -29)],
        sp500:        [2954, 2585, 2912, 3044, 3100, 3271, 3500, 3363, 3270, 3622, 3756, Number(q.sp500 || 3714)]
      };
    }

    var yr = Number(q.year) || 2021;
    var mo = Math.max(1, Math.min(12, Number(q.month) || 1));
    var currentLabel = monthNames[mo - 1] + ' ' + String(yr).slice(-2);
    var h = q.econ_history;
    var lastIdx = h.labels.length - 1;

    var curInf = Number(q.inflation !== undefined ? q.inflation : 1.4);
    var curUnemp = Number(q.unemployment !== undefined ? q.unemployment : 6.3);
    var curGrowth = Number(q.economic_growth !== undefined ? q.economic_growth : 4.0);
    var curBudget = Number(q.budget !== undefined ? q.budget : -29);
    var curSp = Number(q.sp500 !== undefined ? q.sp500 : 3714);

    if (h.labels[lastIdx] !== currentLabel) {
      h.labels.push(currentLabel);
      h.inflation.push(curInf);
      h.unemployment.push(curUnemp);
      h.growth.push(curGrowth);
      h.budget.push(curBudget);
      h.sp500.push(curSp);
    } else {
      h.inflation[lastIdx] = curInf;
      h.unemployment[lastIdx] = curUnemp;
      h.growth[lastIdx] = curGrowth;
      h.budget[lastIdx] = curBudget;
      h.sp500[lastIdx] = curSp;
    }

    return h;
  }

  function buildClassicChartSVG(data, labels, strokeColor, zeroLine) {
    var w = 270, h = 115, padL = 36, padR = 12, padT = 10, padB = 26;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var rawMin = Math.min.apply(null, data);
    var rawMax = Math.max.apply(null, data);
    if (zeroLine) {
      rawMin = Math.min(rawMin, 0);
      rawMax = Math.max(rawMax, 0);
    }
    if (rawMax === rawMin) { rawMax += 1; rawMin -= 1; }

    var range = rawMax - rawMin;
    var min = rawMin - range * 0.08;
    var max = rawMax + range * 0.08;

    var toX = function(i) {
      return padL + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    };
    var toY = function(v) {
      return padT + plotH - ((v - min) / (max - min)) * plotH;
    };

    var pts = data.map(function(v, i) {
      return toX(i).toFixed(1) + ',' + toY(v).toFixed(1);
    }).join(' ');

    // Y-axis ticks (4 clean intervals like D3)
    var yTicks = '';
    var tickCount = 4;
    for (var t = 0; t <= tickCount; t++) {
      var val = min + (t / tickCount) * (max - min);
      var ty = toY(val).toFixed(1);
      var lbl = Math.abs(val) >= 100 ? Math.round(val) : (Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(1));
      yTicks +=
        '<line x1="' + (padL - 4) + '" y1="' + ty + '" x2="' + padL + '" y2="' + ty + '" stroke="#222" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (Number(ty) + 3) + '" font-size="9" font-family="Times New Roman, serif" fill="#222" text-anchor="end">' + lbl + '</text>';
    }

    // X-axis ticks (Start, Mid, End)
    var xTicks = '';
    var idxs = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    idxs.forEach(function(idx) {
      if (idx < 0 || idx >= data.length) return;
      var tx = toX(idx).toFixed(1);
      var xLbl = labels[idx] || '';
      xTicks +=
        '<line x1="' + tx + '" y1="' + (padT + plotH) + '" x2="' + tx + '" y2="' + (padT + plotH + 4) + '" stroke="#222" stroke-width="1"/>' +
        '<text x="' + tx + '" y="' + (padT + plotH + 14) + '" font-size="9" font-family="Times New Roman, serif" fill="#222" text-anchor="middle">' + xLbl + '</text>';
    });

    var zeroSvg = '';
    if (zeroLine && min < 0 && max > 0) {
      var zy = toY(0).toFixed(1);
      zeroSvg = '<line x1="' + padL + '" y1="' + zy + '" x2="' + (w - padR) + '" y2="' + zy + '" stroke="#888" stroke-dasharray="2,2" stroke-width="1"/>';
    }

    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block;margin-top:4px;">' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '" stroke="#222" stroke-width="1"/>' +
        '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (w - padR) + '" y2="' + (padT + plotH) + '" stroke="#222" stroke-width="1"/>' +
        zeroSvg +
        yTicks +
        xTicks +
        '<polyline fill="none" stroke="' + strokeColor + '" stroke-width="1.8" points="' + pts + '"/>' +
      '</svg>'
    );
  }

  function addEconStyles() {
    if (document.getElementById('us-econ-styles')) return;
    var s = document.createElement('style');
    s.id = 'us-econ-styles';
    s.textContent =
      '#us-econ-modal{display:none;position:fixed;top:6vh;left:50%;transform:translateX(-50%);width:min(960px,94vw);max-height:88vh;overflow-y:auto;z-index:50;background:#f4f1ea;color:#1c1b18;border:2px solid #2c2a26;box-shadow:0 10px 30px rgba(0,0,0,0.55);padding:16px 20px;font-family:"Times New Roman",Times,Georgia,serif}' +
      '#us-econ-modal.open{display:block}' +
      '.us-econ-header{display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid #2c2a26;border-bottom:1.5px solid #2c2a26;padding:6px 4px;margin-bottom:14px}' +
      '.us-econ-header h2{margin:0;font-size:1.3em;letter-spacing:0.14em;text-transform:uppercase;font-weight:normal;color:#1c1b18}' +
      '.us-econ-close{background:#eae6dc;border:1px solid #555;color:#1c1b18;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:0.95em}' +
      '.us-econ-close:hover{background:#dcd6c8}' +
      '.us-econ-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}' +
      '.us-econ-card{background:#faf8f3;border:1px solid #3c3a35;padding:10px 12px}' +
      '.us-econ-card-title{text-align:center;font-size:0.95em;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid #bfb8a8;padding-bottom:4px;margin-bottom:6px;color:#1c1b18}' +
      '.us-econ-val{text-align:center;font-size:1.35em;margin:3px 0}' +
      '.us-econ-sub{text-align:center;font-size:0.85em;color:#444;margin-bottom:4px}' +
      '#open-us-econ-btn{display:block;width:100%;margin-top:8px;padding:5px 8px;background:#eae6dc;color:#1c1b18;border:1px solid #555;font-family:"Times New Roman",Times,serif;font-size:0.95em;cursor:pointer;text-align:center}' +
      '#open-us-econ-btn:hover{background:#dcd6c8}';
    document.head.appendChild(s);
  }

   function renderEconModal() {
    addEconStyles();
    var q = getQ();
    if (!q) return;
    var h = ensureHistory(q);

    var modal = document.getElementById('us-econ-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'us-econ-modal';
      document.body.appendChild(modal);
    }

    var deltaBadge = function(arr, invertGood, decimals) {
      if (arr.length < 2) return '';
      var cur = arr[arr.length - 1];
      var prev = arr[arr.length - 2];
      var diff = +(cur - prev).toFixed(decimals);
      if (diff === 0) return '<span style="color:#666;font-size:0.75em;"> —</span>';
      var up = diff > 0;
      var good = invertGood ? !up : up;
      var col = good ? '#1e6b34' : '#a51c30';
      var arrow = up ? '▲' : '▼';
      return ' <span style="color:' + col + ';font-size:0.7em;">' + arrow + ' ' + Math.abs(diff).toFixed(decimals) + '</span>';
    };

    var inf = h.inflation[h.inflation.length - 1];
    var unemp = h.unemployment[h.unemployment.length - 1];
    var growth = h.growth[h.growth.length - 1];
    var bud = h.budget[h.budget.length - 1];
    var sp = h.sp500[h.sp500.length - 1];

    var budStatus = bud < 0
      ? '<span style="color:#a51c30;">Deficit ' + Math.abs(bud) + '</span>'
      : '<span style="color:#1e6b34;">Surplus +' + bud + '</span>';

    var card1 =
      '<div class="us-econ-card">' +
        '<div class="us-econ-card-title">Inflation (CPI YoY)</div>' +
        '<div class="us-econ-val">' + inf.toFixed(1) + '%' + deltaBadge(h.inflation, true, 1) + '</div>' +
        '<div class="us-econ-sub">Fed Target: 2.0%</div>' +
        buildClassicChartSVG(h.inflation, h.labels, '#1a237e', false) +
      '</div>';

    var card2 =
      '<div class="us-econ-card">' +
        '<div class="us-econ-card-title">Unemployment Rate</div>' +
        '<div class="us-econ-val">' + unemp.toFixed(1) + '%' + deltaBadge(h.unemployment, true, 1) + '</div>' +
        '<div class="us-econ-sub">Civilian Labor Force</div>' +
        buildClassicChartSVG(h.unemployment, h.labels, '#b71c1c', false) +
      '</div>';

        var gdp = h.gdp[h.gdp.length - 1];
    var growthRate = Number(q.economic_growth !== undefined ? q.economic_growth : 4.0);

    var card3 =
      '<div class="us-econ-card">' +
        '<div class="us-econ-card-title">U.S. Nominal GDP</div>' +
        '<div class="us-econ-val">$' + gdp.toFixed(2) + 'T' + deltaBadge(h.gdp, false, 2) + '</div>' +
        '<div class="us-econ-sub">Annualized Growth: ' + (growthRate >= 0 ? '+' : '') + growthRate.toFixed(1) + '%</div>' +
        buildClassicChartSVG(h.gdp, h.labels, '#1b5e20', false) +
      '</div>';


    var card4 =
      '<div class="us-econ-card">' +
        '<div class="us-econ-card-title">Federal Budget</div>' +
        '<div class="us-econ-val">' + budStatus + deltaBadge(h.budget, false, 0) + '</div>' +
        '<div class="us-econ-sub">Fiscal Balance Index</div>' +
        buildClassicChartSVG(h.budget, h.labels, '#0d47a1', true) +
      '</div>';

    var card5 =
      '<div class="us-econ-card">' +
        '<div class="us-econ-card-title">S&amp;P 500 Index</div>' +
        '<div class="us-econ-val">' + Math.round(sp).toLocaleString() + deltaBadge(h.sp500, false, 0) + '</div>' +
        '<div class="us-econ-sub">Wall Street Benchmark</div>' +
        buildClassicChartSVG(h.sp500, h.labels, '#2e7d32', false) +
      '</div>';

    modal.innerHTML =
      '<div class="us-econ-header">' +
        '<span style="font-size:0.9em;color:#444;">' + h.labels[h.labels.length - 1] + '</span>' +
        '<h2>U.S. Economic History</h2>' +
        '<button type="button" class="us-econ-close" id="close-us-econ">Close ×</button>' +
      '</div>' +
      '<div class="us-econ-grid">' +
        card1 + card2 + card3 + card4 + card5 +
      '</div>';

    modal.querySelector('#close-us-econ').onclick = function() {
      modal.classList.remove('open');
    };
  }

window.openUsEconModal = function() {
renderEconModal();
var m = document.getElementById('us-econ-modal');
if (m) m.classList.add('open');
};
  function injectSidebarButton() {
    addEconStyles();
    if (document.getElementById('open-us-econ-btn')) return;

    var all = document.querySelectorAll('p, div, span, li');
    for (var i = all.length - 1; i >= 0; i--) {
      var el = all[i];
      if (el.children.length === 0 && el.textContent && el.textContent.indexOf('Budget:') !== -1) {
        var btn = document.createElement('button');
        btn.id = 'open-us-econ-btn';
        btn.type = 'button';
        btn.textContent = 'View Economic Charts';
        btn.onclick = window.openUsEconModal;
        el.parentNode.insertBefore(btn, el.nextSibling);
        break;
      }
    }
  }

setInterval(function() {
var q = getQ();
if (q) ensureHistory(q);
injectSidebarButton();
var m = document.getElementById('us-econ-modal');
if (m && m.classList.contains('open')) renderEconModal();
}, 400);
})();