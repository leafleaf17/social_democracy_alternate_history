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

  var palettes = {
    yapms: {
      name: 'YAPms',
      dem: ['#949bb3', '#8aafff', '#577ccc', '#1c408c'],
      rep: ['#cf8980', '#ff8b98', '#ff5865', '#bf1d29']
    },
    nyt: {
      name: 'NYT',
      dem: ['#b6c6d6', '#7fa6c9', '#4678a8', '#184b7a'],
      rep: ['#dfb5ad', '#d98477', '#c24d3e', '#8f1f14']
    },
    wiki: {
      name: 'Wikipedia',
      dem: ['#b0d0ff', '#7cb0ff', '#4586e8', '#1552b8'],
      rep: ['#ffb8b8', '#ff7d7d', '#e04141', '#a61414']
    },
    twoseventy: {
      name: '270toWin',
      dem: ['#a6c8e0', '#6baed6', '#3182bd', '#08519c'],
      rep: ['#fcae91', '#fb6a4a', '#de2d26', '#a50f15']
    },
    colorblind: {
      name: 'Colorblind Safe',
      dem: ['#a6cee3', '#6baed6', '#2171b5', '#08306b'],
      rep: ['#fdd0a2', '#fd8d3c', '#d94801', '#7f2704']
    }
  };

  var mapReady = false;
  var svgLoading = false;
  var activeTab = 'pres';
  var activePalette = 'yapms';
  var isDarkMode = false;
  var pinnedCode = null;

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
    var pal = palettes[activePalette] || palettes.yapms;
    var abs = Math.abs(margin);
    var band = abs >= 15 ? 3 : abs >= 5 ? 2 : abs >= 1 ? 1 : 0;
    return (margin >= 0 ? pal.dem : pal.rep).at(band);
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

  function tooltipText(code, res, tab, isActive, isPinned) {
    var pinNote = isPinned
      ? '<div style="font-size:11px;opacity:0.75;margin-top:4px;border-top:1px solid #888;padding-top:2px;">Pinned (click state again to unpin)</div>'
      : '';

    if (!isActive) {
      var label = tab === 'senate' ? 'Senate' : 'Gubernatorial';
      return '<strong>' + res.name + ' (' + code + ')</strong><br>' +
        '<span style="opacity:0.75;">No ' + label + ' election this cycle</span>' + pinNote;
    }

    var m = Number(res.margin);
    var pre = m > 0 ? 'D+' : m < 0 ? 'R+' : 'Even ';
    var demCol = isDarkMode ? '#5c9eff' : '#1c408c';
    var repCol = isDarkMode ? '#ff5865' : '#b91c1c';
    var marginColor = m > 0 ? demCol : m < 0 ? repCol : (isDarkMode ? '#ffffff' : '#1c1b18');
    var extra = tab === 'pres' ? ' · ' + res.ev + ' EV' : '';

    var showCandDem = (res.demCand && res.demCand !== 'Generic Democrat') ? ' <span style="opacity:0.8;">(' + res.demCand + ')</span>' : '';
    var showCandRep = (res.repCand && res.repCand !== 'Generic Republican') ? ' <span style="opacity:0.8;">(' + res.repCand + ')</span>' : '';

    return '<strong>' + res.name + ' (' + code + ')</strong>' + extra + '<br>' +
      '<span style="color:' + demCol + ';font-weight:bold;">Democrats:</span> ' + res.dem.toFixed(2) + '%' + showCandDem + '<br>' +
      '<span style="color:' + repCol + ';font-weight:bold;">Republicans:</span> ' + res.rep.toFixed(2) + '%' + showCandRep + '<br>' +
      'Margin: <span style="color:' + marginColor + ';font-weight:bold;">' + pre + Math.abs(m).toFixed(2) + '</span>' +
      pinNote;
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
      '#polling-map-drawer,.polling-map-drawer{width:min(1080px,94vw) !important;height:min(88vh,900px) !important;top:6vh !important;right:3vw !important;overflow:auto !important;z-index:45 !important;padding:1.1em 1.4em !important;font-family:"Times New Roman",Times,Georgia,serif !important;box-shadow:0 10px 30px rgba(0,0,0,0.45) !important;transition:background-color 0.15s,color 0.15s}' +
      '#polling-map-drawer.theme-light{background:#f4f1ea !important;color:#1c1b18 !important;border:2px solid #2c2a26 !important}' +
      '#polling-map-drawer.theme-light h2,#polling-map-drawer.theme-light p{color:#1c1b18 !important}' +
      '#polling-map-drawer.theme-light button,#polling-map-drawer.theme-light select{background:#eae6dc !important;color:#1c1b18 !important;border:1px solid #555555 !important;font-family:"Times New Roman",Times,Georgia,serif !important;padding:4px 10px;cursor:pointer;font-size:0.95em}' +
      '#polling-map-drawer.theme-light button:hover,#polling-map-drawer.theme-light select:hover{background:#dcd6c8 !important;border-color:#1c1b18 !important}' +
      '#polling-map-drawer.theme-light .polling-map-tab.active{background:#2c2a26 !important;color:#f4f1ea !important;border-color:#2c2a26 !important;font-weight:bold}' +
      '#polling-map-drawer.theme-light .polling-map-svg-wrap{background:#faf8f3 !important;border:1px solid #8c8577 !important}' +
      '#polling-map-drawer.theme-light .polling-map-svg-wrap svg{background:#faf8f3 !important}' +
      '#polling-map-drawer.theme-light .polling-map-svg-wrap svg rect{fill:#faf8f3 !important}' +
      '#polling-map-drawer.theme-light .polling-map-state{stroke:#ffffff !important;stroke-width:0.8px}' +
      '#polling-map-drawer.theme-light .polling-map-tooltip{background:#faf8f3 !important;color:#1c1b18 !important;border:1.5px solid #2c2a26 !important;box-shadow:0 4px 12px rgba(0,0,0,0.2)}' +
      '#polling-map-drawer.theme-light .polling-map-meta{background:#eae6dc !important;border:1px solid #bfb8a8 !important;color:#2c2a26 !important}' +
      '#polling-map-drawer.theme-dark{background:#111111 !important;color:#f0f0f0 !important;border:1.5px solid #555555 !important}' +
      '#polling-map-drawer.theme-dark h2,#polling-map-drawer.theme-dark p{color:#f0f0f0 !important}' +
      '#polling-map-drawer.theme-dark button,#polling-map-drawer.theme-dark select{background:#222222 !important;color:#f0f0f0 !important;border:1px solid #666666 !important;font-family:"Times New Roman",Times,Georgia,serif !important;padding:4px 10px;cursor:pointer;font-size:0.95em}' +
      '#polling-map-drawer.theme-dark button:hover,#polling-map-drawer.theme-dark select:hover{background:#333333 !important;border-color:#ffffff !important}' +
'#polling-map-drawer.theme-dark .polling-map-tab.active{background:#1c408c !important;color:#ffffff !important;border-color:#5c9eff !important;font-weight:bold}' +
'#polling-map-drawer.theme-dark .polling-map-svg-wrap{background:#0a0a0a !important;border:1px solid #444444 !important}' +
'#polling-map-drawer.theme-dark .polling-map-svg-wrap svg{background:#0a0a0a !important}' +
'#polling-map-drawer.theme-dark .polling-map-svg-wrap svg rect{fill:#0a0a0a !important}' +
'#polling-map-drawer.theme-dark .polling-map-state{stroke:#333333 !important;stroke-width:0.8px}' +
'#polling-map-drawer.theme-dark .polling-map-tooltip{background:#1a1a1a !important;color:#f0f0f0 !important;border:1px solid #888888 !important;box-shadow:0 4px 14px rgba(0,0,0,0.6)}' +
'#polling-map-drawer.theme-dark .polling-map-meta{background:#1b1b1b !important;border:1px solid #3a3a3a !important;color:#cccccc !important}' +
'.polling-map-controls{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin:0.4em 0 0.6em;padding-bottom:0.5em;border-bottom:1px solid rgba(128,128,128,0.35)}' +
'.polling-map-tabs{display:flex;gap:6px;flex-wrap:wrap}' +
'.polling-map-right-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
'.polling-map-score{margin:0.25em 0 0.45em;font-size:1.35em;font-weight:bold;letter-spacing:0.01em}' +
'.polling-map-meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:5px 10px;margin-bottom:0.6em;font-size:0.88em}' +
'.polling-map-key{display:flex;align-items:center;gap:4px;flex-wrap:wrap}' +
'.polling-map-swatch{display:inline-block;width:13px;height:13px;border:1px solid rgba(0,0,0,0.35);vertical-align:middle}' +
'.polling-map-svg-wrap{width:100%;min-height:300px;overflow:auto}' +
'.polling-map-svg-wrap svg{display:block;width:100%;max-width:950px;height:auto;margin:0 auto}' +
'.polling-map-state{cursor:pointer;transition:opacity 0.1s}.polling-map-state:hover{opacity:0.84;stroke:#d97706 !important;stroke-width:1.6px !important}' +
'.polling-map-state.pinned{stroke:#d97706 !important;stroke-width:2px !important}' +
'.polling-map-tooltip{display:none;position:absolute;z-index:10;white-space:normal;padding:0.5em 0.75em;max-width:270px;font:14px/1.4 "Times New Roman",Times,Georgia,serif;pointer-events:none}' +
'.polling-map-tooltip.visible{display:block}';
document.head.appendChild(s);
}
function applyDrawerTheme(drawer) {
if (!drawer) return;
drawer.classList.remove('theme-light', 'theme-dark');
drawer.classList.add(isDarkMode ? 'theme-dark' : 'theme-light');
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
if (id === targetCode || id === targetName || label === targetCode || label === targetName) {
return el;
}
}
return null;
}
function makeDraggable(drawer) {
if (!drawer || drawer.dataset.draggableReady) return;
drawer.dataset.draggableReady = '1';
var handle = drawer.querySelector('h2') ? drawer.querySelector('h2').parentElement : drawer;
handle.style.cursor = 'move';
handle.style.userSelect = 'none';
var dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
handle.addEventListener('pointerdown', function(e) {
if (e.target.closest('button') || e.target.closest('select')) return;
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
var newLeft = Math.max(0, Math.min(window.innerWidth - 140, startLeft + dx));
var newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
drawer.style.setProperty('left', newLeft + 'px', 'important');
drawer.style.setProperty('top', newTop + 'px', 'important');
});
window.addEventListener('pointerup', function() {
dragging = false;
});
}
function ensureDrawerContent(drawer) {
addStyles();
applyDrawerTheme(drawer);
makeDraggable(drawer);
var content = drawer.querySelector('.polling-map-content');
if (!content) {
content = document.createElement('div');
content.className = 'polling-map-content';
drawer.appendChild(content);
}
var controls = content.querySelector('.polling-map-controls');
if (!controls) {
controls = document.createElement('div');
controls.className = 'polling-map-controls';
var tabBar = document.createElement('div');
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
pinnedCode = null;
updateMap();
};
tabBar.appendChild(btn);
});
var rightTools = document.createElement('div');
rightTools.className = 'polling-map-right-tools';
var palSelect = document.createElement('select');
palSelect.className = 'polling-map-palette-select';
palSelect.title = 'Select Map Color Palette';
Object.keys(palettes).forEach(function(k) {
var opt = document.createElement('option');
opt.value = k;
opt.textContent = 'Colors: ' + palettes[k].name;
palSelect.appendChild(opt);
});
palSelect.onchange = function() {
activePalette = palSelect.value;
updateMap();
};
var themeBtn = document.createElement('button');
themeBtn.type = 'button';
themeBtn.className = 'polling-map-theme-btn';
themeBtn.onclick = function() {
isDarkMode = !isDarkMode;
applyDrawerTheme(drawer);
updateMap();
};
rightTools.appendChild(palSelect);
rightTools.appendChild(themeBtn);
controls.appendChild(tabBar);
controls.appendChild(rightTools);
content.appendChild(controls);
}
controls.querySelectorAll('.polling-map-tab').forEach(function(b) {
if (b.dataset.tab === activeTab) b.classList.add('active');
else b.classList.remove('active');
});
var palSel = controls.querySelector('.polling-map-palette-select');
if (palSel) palSel.value = activePalette;
var tBtn = controls.querySelector('.polling-map-theme-btn');
if (tBtn) tBtn.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
var score = content.querySelector('.polling-map-score');
if (!score) {
score = document.createElement('div');
score.className = 'polling-map-score';
content.appendChild(score);
}
var meta = content.querySelector('.polling-map-meta');
if (!meta) {
meta = document.createElement('div');
meta.className = 'polling-map-meta';
content.appendChild(meta);
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
var tossupCount = 0;
var activeResults = [];
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
if (!pinnedCode) tip.classList.remove('visible');
states.forEach(function(pair) {
var code = pair.at(0);
var name = pair.at(1);
var shape = findStateShape(svg, code, name);
if (!shape) return;
var isActive = (activeList === null) || (activeList.indexOf(code) !== -1);
var res = calcRaceResult(q, polling, code, activeTab);
if (!res) return;
if (isActive) {
activeResults.push({ code: code, name: res.name, margin: res.margin, ev: Number(res.ev) || 1 });
if (Math.abs(res.margin) < 2.0) tossupCount += 1;
if (activeTab === 'pres') {
if (res.margin >= 0) demTotal += Number(res.ev);
else repTotal += Number(res.ev);
} else {
if (res.margin >= 0) demTotal += 1;
else repTotal += 1;
}
}
var inactiveFill = isDarkMode ? '#222222' : '#ded9ce';
var col = isActive ? colorForMargin(res.margin) : inactiveFill;
shape.style.setProperty('fill', col, 'important');
shape.setAttribute('fill', col);
shape.querySelectorAll('path, circle, polygon').forEach(function(el) {
el.style.setProperty('fill', col, 'important');
el.setAttribute('fill', col);
});
shape.classList.add('polling-map-state');
if (pinnedCode === code) {
shape.classList.add('pinned');
tip.innerHTML = tooltipText(code, res, activeTab, isActive, true);
tip.classList.add('visible');
} else {
shape.classList.remove('pinned');
}
shape.onclick = function(e) {
e.stopPropagation();
pinnedCode = (pinnedCode === code) ? null : code;
if (pinnedCode) {
tip.innerHTML = tooltipText(code, res, activeTab, isActive, true);
tip.classList.add('visible');
var r = drawer.getBoundingClientRect();
tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 280) + 'px';
tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 155) + 'px';
} else {
tip.classList.remove('visible');
}
updateMap();
};
shape.onpointerenter = function(e) {
if (pinnedCode && pinnedCode !== code) return;
tip.innerHTML = tooltipText(code, res, activeTab, isActive, pinnedCode === code);
tip.classList.add('visible');
var r = drawer.getBoundingClientRect();
tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 280) + 'px';
tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 155) + 'px';
};
shape.onpointermove = function(e) {
if (pinnedCode) return;
shape.onpointerenter(e);
};
shape.onpointerleave = function() {
if (!pinnedCode) tip.classList.remove('visible');
};
});
var tippingText = '';
if (activeTab === 'pres' || activeTab === 'senate') {
var sorted = activeResults.slice().sort(function(a, b) { return b.margin - a.margin; });
var cum = (activeTab === 'senate') ? (yr >= 2023 ? 28 : 36) : 0;
var target = (activeTab === 'pres') ? 270 : 51;
for (var i = 0; i < sorted.length; i++) {
cum += (activeTab === 'pres') ? sorted[i].ev : 1;
if (cum >= target) {
var tm = sorted[i].margin;
var tPre = tm > 0 ? 'D+' : tm < 0 ? 'R+' : 'Even ';
tippingText = 'Tipping Point: ' + sorted[i].name + ' (' + tPre + Math.abs(tm).toFixed(1) + ') · ';
break;
}
}
}
var meta = drawer.querySelector('.polling-map-meta');
if (meta) {
var pal = palettes[activePalette] || palettes.yapms;
var d3 = pal.dem.at(3), d2 = pal.dem.at(2), d1 = pal.dem.at(1), d0 = pal.dem.at(0);
var r0 = pal.rep.at(0), r1 = pal.rep.at(1), r2 = pal.rep.at(2), r3 = pal.rep.at(3);
var keyHtml =
'' +
'D:' +
'' +
'' +
'' +
'' +
'|' +
'' +
'' +
'' +
'' +
':R' +
'(15+ / 5–15 / 1–5 / <1)' +
'';
var statsHtml =
'' + tippingText + 'Tossups (<2%): ' + tossupCount + '';
meta.innerHTML = keyHtml + statsHtml;
}
var score = drawer.querySelector('.polling-map-score');
if (score) {
var demScoreCol = isDarkMode ? '#5c9eff' : '#1c408c';
var repScoreCol = isDarkMode ? '#ff5865' : '#b91c1c';
if (activeTab === 'senate') {
var currentDemSenate = Number(q.dem_senate_seats) || 50;
var currentRepSenate = 100 - currentDemSenate;
var demDiff = formatDiff(demTotal - currentDemSenate);
var repDiff = formatDiff(repTotal - currentRepSenate);
score.innerHTML =
'Democrat: ' + demTotal + ' Seats ' + demDiff + '' +
'·' +
'Republican: ' + repTotal + ' Seats ' + repDiff + '';
} else {
var unit = activeTab === 'pres' ? 'EV' : 'Races';
score.innerHTML =
'Democrat: ' + demTotal + ' ' + unit + '' +
'·' +
'Republican: ' + repTotal + ' ' + unit + '';
}
var demSpan = score.querySelector('.score-dem');
var sepSpan = score.querySelector('.score-sep');
var repSpan = score.querySelector('.score-rep');
if (demSpan) demSpan.style.setProperty('color', demScoreCol, 'important');
if (sepSpan) sepSpan.style.setProperty('color', isDarkMode ? '#777777' : '#666666', 'important');
if (repSpan) repSpan.style.setProperty('color', repScoreCol, 'important');
var gainCol = isDarkMode ? '#22c55e' : '#15803d';
var lossCol = isDarkMode ? '#b91c1c' : '#7f1d1d';
var evenCol = isDarkMode ? '#999999' : '#666666';
score.querySelectorAll('.seat-diff').forEach(function(el) {
var dir = el.getAttribute('data-dir');
var col = dir === 'gain' ? gainCol : dir === 'loss' ? lossCol : evenCol;
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
svg.querySelectorAll('title').forEach(function(t) { t.remove(); });
var dc = findStateShape(svg, 'DC', 'District of Columbia');
if (dc && dc.tagName.toLowerCase() === 'circle') {
dc.setAttribute('r', '6');
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
// ============================================================================
// U.S. ECONOMIC HISTORY DASHBOARD MODAL
// ============================================================================
var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ensureHistory(q) {
var curInf = Number(q.inflation !== undefined ? q.inflation : 1.4);
if (isNaN(curInf)) curInf = 1.4;
var curUnemp = Number(q.unemployment !== undefined ? q.unemployment : (q.unemployed !== undefined ? q.unemployed : 6.3));
if (isNaN(curUnemp)) curUnemp = 6.3;
var curGdp = Number(q.us_gdp !== undefined ? q.us_gdp : (q.gdp !== undefined ? q.gdp : 21.8));
if (isNaN(curGdp) || curGdp <= 0) curGdp = 21.8;
var curBudget = Number(q.budget !== undefined ? q.budget : -29);
if (isNaN(curBudget)) curBudget = -29;
var curSp = Number(q.sp500 !== undefined ? q.sp500 : (q.sp_500 !== undefined ? q.sp_500 : 3714));
if (isNaN(curSp) || curSp <= 0) curSp = 3714;
if (!q.econ_history) {
q.econ_history = {
labels: ['Feb 20','Mar 20','Apr 20','May 20','Jun 20','Jul 20','Aug 20','Sep 20','Oct 20','Nov 20','Dec 20','Jan 21'],
inflation:    [2.3, 1.5, 0.3, 0.1, 0.6, 1.0, 1.3, 1.4, 1.2, 1.2, 1.4, curInf],
unemployment: [3.5, 4.4, 14.8, 13.3, 11.1, 10.2, 8.4, 7.9, 6.9, 6.7, 6.7, curUnemp],
gdp:          [21.5, 21.1, 19.6, 19.8, 20.4, 21.0, 21.4, 21.6, 21.7, 21.8, 21.8, curGdp],
budget:       [-18, -22, -31, -34, -33, -32, -31, -31, -30, -30, -29, curBudget],
sp500:        [2954, 2585, 2912, 3044, 3100, 3271, 3500, 3363, 3270, 3622, 3756, curSp]
};
}
var h = q.econ_history;
if (!h.gdp) h.gdp = [21.5, 21.1, 19.6, 19.8, 20.4, 21.0, 21.4, 21.6, 21.7, 21.8, 21.8, curGdp];
if (!h.unemployment || isNaN(h.unemployment.at(-1))) {
h.unemployment = [3.5, 4.4, 14.8, 13.3, 11.1, 10.2, 8.4, 7.9, 6.9, 6.7, 6.7, curUnemp];
}
if (!h.sp500 || isNaN(h.sp500.at(-1))) {
h.sp500 = [2954, 2585, 2912, 3044, 3100, 3271, 3500, 3363, 3270, 3622, 3756, curSp];
}
var yr = Number(q.year) || 2021;
var mo = Math.max(1, Math.min(12, Number(q.month) || 1));
var currentLabel = monthNames.at(mo - 1) + ' ' + String(yr).slice(-2);
var lastIdx = h.labels.length - 1;
if (h.labels[lastIdx] !== currentLabel) {
h.labels.push(currentLabel);
h.inflation.push(curInf);
h.unemployment.push(curUnemp);
h.gdp.push(curGdp);
h.budget.push(curBudget);
h.sp500.push(curSp);
} else {
h.inflation[lastIdx] = curInf;
h.unemployment[lastIdx] = curUnemp;
h.gdp[lastIdx] = curGdp;
h.budget[lastIdx] = curBudget;
h.sp500[lastIdx] = curSp;
}
return h;
}
function buildClassicChartSVG(data, labels, strokeColor, zeroLine) {
data = data.slice(-15);
labels = labels.slice(-15);
var w = 270, h = 115, padL = 38, padR = 12, padT = 10, padB = 26;
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
var yTicks = '';
var tickCount = 4;
for (var t = 0; t <= tickCount; t++) {
var val = min + (t / tickCount) * (max - min);
var ty = toY(val).toFixed(1);
var lbl = Math.abs(val) >= 100 ? Math.round(val) : (Math.abs(val) >= 10 ? val.toFixed(1) : val.toFixed(1));
yTicks +=
'' +
'' + lbl + '';
}
var xTicks = '';
var idxs = [0, Math.floor((data.length - 1) / 2), data.length - 1];
idxs.forEach(function(idx) {
if (idx < 0 || idx >= data.length) return;
var tx = toX(idx).toFixed(1);
var xLbl = labels[idx] || '';
xTicks +=
'' +
'' + xLbl + '';
});
var zeroSvg = '';
if (zeroLine && min < 0 && max > 0) {
var zy = toY(0).toFixed(1);
zeroSvg = '';
}
return (
'' +
'' +
'' +
zeroSvg +
yTicks +
xTicks +
'' +
''
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
'#open-us-econ-btn{display:block;width:100%;margin-top:8px;padding:5px 8px;background:#eae6dc;color:#1c1b18;border:1px solid #555;font-family:"Times New Roman",Times,Georgia,serif;font-size:0.95em;cursor:pointer;text-align:center}' +
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
var cur = arr.at(-1);
var prev = arr.at(-2);
var diff = +(cur - prev).toFixed(decimals);
if (diff === 0) return ' —';
var up = diff > 0;
var good = invertGood ? !up : up;
var col = good ? '#15803d' : '#7f1d1d';
var arrow = up ? '▲' : '▼';
return ' ' + arrow + ' ' + Math.abs(diff).toFixed(decimals) + '';
};
var inf = h.inflation.at(-1);
var unemp = h.unemployment.at(-1);
var gdp = h.gdp.at(-1);
var bud = h.budget.at(-1);
var sp = h.sp500.at(-1);
var growthRate = Number(q.economic_growth !== undefined ? q.economic_growth : 4.0);
var budBillions = Math.round(bud * 100);
var budSeriesBillions = h.budget.map(function(v) { return Math.round(v * 100); });
var budStatus = budBillions < 0
? 'Deficit $' + Math.abs(budBillions).toLocaleString() + 'B'
: 'Surplus +$' + budBillions.toLocaleString() + 'B';
var card1 =
'' +
'Inflation (CPI YoY)' +
'' + inf.toFixed(1) + '%' + deltaBadge(h.inflation, true, 1) + '' +
'Fed Target: 2.0%' +
buildClassicChartSVG(h.inflation, h.labels, '#1a237e', false) +
'';
var card2 =
'' +
'Unemployment Rate' +
'' + unemp.toFixed(1) + '%' + deltaBadge(h.unemployment, true, 1) + '' +
'Civilian Labor Force' +
buildClassicChartSVG(h.unemployment, h.labels, '#b71c1c', false) +
'';
var card3 =
'' +
'U.S. Nominal GDP' +
'$' + gdp.toFixed(2) + 'T' + deltaBadge(h.gdp, false, 2) + '' +
'Annualized Growth: ' + (growthRate >= 0 ? '+' : '') + growthRate.toFixed(1) + '%' +
buildClassicChartSVG(h.gdp, h.labels, '#1b5e20', false) +
'';
var card4 =
'' +
'Federal Budget' +
'' + budStatus + deltaBadge(budSeriesBillions, false, 0) + '' +
'Annualized Balance ($ Billions)' +
buildClassicChartSVG(budSeriesBillions, h.labels, '#0d47a1', true) +
'';
var card5 =
'' +
'S&P 500 Index' +
'' + Math.round(sp).toLocaleString() + deltaBadge(h.sp500, false, 0) + '' +
'Wall Street Benchmark' +
buildClassicChartSVG(h.sp500, h.labels, '#2e7d32', false) +
'';
modal.innerHTML =
'' +
'' + h.labels.at(-1) + '' +
'U.S. Economic History' +
'Close ×' +
'' +
'' +
card1 + card2 + card3 + card4 + card5 +
'';
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