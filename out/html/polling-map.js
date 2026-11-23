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
    if (diff > 0) return '(+' + diff + ')';
    if (diff < 0) return '(' + diff + ')';
    return '(±0)';
  }

  function addStyles() {
    if (document.getElementById('polling-map-styles')) return;
    var s = document.createElement('style');
    s.id = 'polling-map-styles';
    s.textContent =
      '#polling-map-drawer,.polling-map-drawer{width:min(1100px,94vw) !important;height:min(86vh,900px) !important;top:7vh !important;right:3vw !important;overflow:auto !important;z-index:40 !important;padding:1.2em !important;background:#000000 !important;background-color:#000000 !important;color:#ffffff !important;border:1px solid #444 !important}' +
      '.polling-map-content,.polling-map-content h2,.polling-map-content p,.polling-map-tooltip{color:#ffffff !important}' +
      '.polling-map-drawer button{background:#222222 !important;color:#ffffff !important;border:1px solid #666666 !important;padding:5px 12px;cursor:pointer;font-weight:bold}' +
      '.polling-map-drawer button:hover{background:#333333 !important;border-color:#ffffff !important}' +
      '.polling-map-tabs{display:flex;gap:8px;margin:0.5em 0 0.7em}' +
      '.polling-map-tab.active{background:#1c408c !important;border-color:#5c9eff !important;color:#ffffff !important}' +
      '.polling-map-score{margin:0.3em 0 0.6em;font-size:1.4em;font-weight:bold;letter-spacing:0.02em}' +
      '.polling-map-legend{display:flex;flex-wrap:wrap;gap:0.4em 1em;margin:0.4em 0 0.75em;font-size:0.88em;color:#dddddd}' +
      '.polling-map-swatch{display:inline-block;width:0.95em;height:0.95em;vertical-align:-0.15em;margin-right:0.3em;border:1px solid #777}' +
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
var legend = content.querySelector('.polling-map-legend');
if (!legend) {
legend = document.createElement('div');
legend.className = 'polling-map-legend';
legend.innerHTML =
'Republican 15+' +
'Republican 5–15' +
'Republican 1–5' +
'Republican <1' +
'Democrat <1' +
'Democrat 1–5' +
'Democrat 5–15' +
'Democrat 15+';
content.appendChild(legend);
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
// 2024 Class 1 cycle: 67 seats not up (28 D / 39 R; or 28 D / 38 R if NE special included)
demTotal = 28;
repTotal = 39;
} else {
// 2022 Class 3 cycle: 66 seats not up (36 D / 30 R)
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
if (score) {
if (activeTab === 'senate') {
var currentDemSenate = Number(q.dem_senate_seats) || 50;
var currentRepSenate = 100 - currentDemSenate;
var demDiff = formatDiff(demTotal - currentDemSenate);
var repDiff = formatDiff(repTotal - currentRepSenate);
score.innerHTML =
'Democrat: ' + demTotal + ' Seats ' + demDiff + '' +
' · ' +
'Republican: ' + repTotal + ' Seats ' + repDiff + '';
} else {
var unit = activeTab === 'pres' ? 'EV' : 'Races';
score.innerHTML =
'Democrat: ' + demTotal + ' ' + unit + '' +
' · ' +
'Republican: ' + repTotal + ' ' + unit + '';
}
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