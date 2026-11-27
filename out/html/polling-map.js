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
    'https://wikimedia.org' + '/wikipedia/commons/1/1a/Blank_US_Map_%28states_only%29.svg'
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
  var zoomedState = null;

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

    var cands = { dem: 'Democrat', rep: 'Republican' };
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

  function renderTooltipDOM(tip, code, res, tab, isActive, isPinned) {
    tip.textContent = '';

    var title = document.createElement('strong');
    title.textContent = res.name + (isActive && tab === 'pres' ? ' · ' + res.ev + ' EV' : '');
    tip.appendChild(title);
    tip.appendChild(document.createElement('br'));

    if (!isActive) {
      var inactiveSpan = document.createElement('span');
      inactiveSpan.style.opacity = '0.75';
      inactiveSpan.textContent = 'No ' + (tab === 'senate' ? 'Senate' : 'Gubernatorial') + ' election this cycle';
      tip.appendChild(inactiveSpan);
    } else {
      var m = Number(res.margin);
      var pre = m > 0 ? 'D+' : m < 0 ? 'R+' : 'Even ';
      var demCol = isDarkMode ? '#5c9eff' : '#1c408c';
      var repCol = isDarkMode ? '#ff5865' : '#b91c1c';
      var marginColor = m > 0 ? demCol : m < 0 ? repCol : (isDarkMode ? '#ffffff' : '#1c1b18');

      var demName = (res.demCand && res.demCand !== 'Generic Democrat' && res.demCand !== 'Democrats') ? res.demCand : 'Democrat';
      var repName = (res.repCand && res.repCand !== 'Generic Republican' && res.repCand !== 'Republicans') ? res.repCand : 'Republican';

      var dRow = document.createElement('div');
      var dLbl = document.createElement('span');
      dLbl.style.color = demCol;
      dLbl.style.fontWeight = 'bold';
      dLbl.textContent = demName + ': ';
      dRow.appendChild(dLbl);
      dRow.appendChild(document.createTextNode(res.dem.toFixed(2) + '%'));
      tip.appendChild(dRow);

      var rRow = document.createElement('div');
      var rLbl = document.createElement('span');
      rLbl.style.color = repCol;
      rLbl.style.fontWeight = 'bold';
      rLbl.textContent = repName + ': ';
      rRow.appendChild(rLbl);
      rRow.appendChild(document.createTextNode(res.rep.toFixed(2) + '%'));
      tip.appendChild(rRow);

      var mRow = document.createElement('div');
      mRow.appendChild(document.createTextNode('Margin: '));
      var mVal = document.createElement('span');
      mVal.style.color = marginColor;
      mVal.style.fontWeight = 'bold';
      mVal.textContent = pre + Math.abs(m).toFixed(2);
      mRow.appendChild(mVal);
      tip.appendChild(mRow);
    }

    if (isPinned) {
      var pinDiv = document.createElement('div');
      pinDiv.style.fontSize = '11px';
      pinDiv.style.opacity = '0.75';
      pinDiv.style.marginTop = '4px';
      pinDiv.style.borderTop = '1px solid #888';
      pinDiv.style.paddingTop = '2px';
      pinDiv.textContent = 'Pinned (click state again to unpin)';
      tip.appendChild(pinDiv);
    }
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
var targetClass = isDarkMode ? 'theme-dark' : 'theme-light';
var otherClass = isDarkMode ? 'theme-light' : 'theme-dark';
if (drawer.classList.contains(otherClass)) drawer.classList.remove(otherClass);
if (!drawer.classList.contains(targetClass)) drawer.classList.add(targetClass);
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
var cls = (el.getAttribute('class') || '').toLowerCase().split(/\s+/);
if (id === targetCode || id === targetName || label === targetCode || label === targetName || cls.indexOf(targetCode) !== -1) {
return el;
}
}
return null;
}
function makeDraggable(drawer) {
if (!drawer || drawer.dataset.draggableReady) return;
drawer.dataset.draggableReady = '1';
var h2 = drawer.querySelector('h2');
var handle = (h2 && h2.parentElement && h2.parentElement !== drawer) ? h2.parentElement : (h2 || drawer);
handle.style.cursor = 'move';
handle.style.userSelect = 'none';
var dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
handle.addEventListener('pointerdown', function(e) {
if (e.target.closest('button, select, svg, .polling-map-svg-wrap')) return;
var rect = drawer.getBoundingClientRect();
if (e.clientY - rect.top > 55) return;
dragging = true;
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
var existingTabBar = controls.querySelector('.polling-map-tabs');
var backBtn = controls.querySelector('.polling-map-back-btn');
if (!backBtn && existingTabBar) {
backBtn = document.createElement('button');
backBtn.type = 'button';
backBtn.className = 'polling-map-back-btn';
backBtn.textContent = '← Back to U.S. Map';
backBtn.onclick = function() {
zoomedState = null;
mapReady = false;
svgLoading = false;
var w = drawer.querySelector('.polling-map-svg-wrap');
if (w) w.textContent = 'Loading map...';
updateMap();
};
existingTabBar.insertBefore(backBtn, existingTabBar.firstChild);
}
if (backBtn) backBtn.style.display = zoomedState ? 'inline-block' : 'none';
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
wrap.textContent = 'Loading map...';
content.appendChild(wrap);
}
if (!zoomedState && !mapReady && !svgLoading) {
svgLoading = true;
tryLoadSvg(svgUrls, 0, wrap);
}
}
function updateMap() {
var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
if (!drawer) return;
if (zoomedState) {
window.openStateCountyView(zoomedState);
return;
}
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
var res = calcRaceResult(q, polling, code, activeTab);
if (!res) return;
var isActive = (activeList === null) || (activeList.indexOf(code) !== -1);
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
var shape = findStateShape(svg, code, name);
if (!shape) return;
var inactiveFill = isDarkMode ? '#222222' : '#ded9ce';
var col = isActive ? colorForMargin(res.margin) : inactiveFill;
shape.style.setProperty('fill', col, 'important');
shape.setAttribute('fill', col);
shape.querySelectorAll('path, circle, polygon').forEach(function(el) {
el.style.setProperty('fill', col, 'important');
el.setAttribute('fill', col);
});
shape.classList.add('polling-map-state');
shape.onclick = function(e) {
e.stopPropagation();
window.openStateCountyView(code);
};
shape.onpointerenter = function(e) {
renderTooltipDOM(tip, code, res, activeTab, isActive, false);
tip.classList.add('visible');
var r = drawer.getBoundingClientRect();
tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 280) + 'px';
tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 155) + 'px';
};
shape.onpointermove = shape.onpointerenter;
shape.onpointerleave = function() {
tip.classList.remove('visible');
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
meta.textContent = '';
var pal = palettes[activePalette] || palettes.yapms;
var keyDiv = document.createElement('div');
keyDiv.className = 'polling-map-key';
var dLbl = document.createElement('strong');
dLbl.textContent = 'D: ';
keyDiv.appendChild(dLbl);
[
{ col: pal.dem.at(3), title: 'D 15+' },
{ col: pal.dem.at(2), title: 'D 5-15' },
{ col: pal.dem.at(1), title: 'D 1-5' },
{ col: pal.dem.at(0), title: 'D <1' }
].forEach(function(item) {
var sw = document.createElement('span');
sw.className = 'polling-map-swatch';
sw.style.backgroundColor = item.col;
sw.title = item.title;
keyDiv.appendChild(sw);
});
var sep = document.createElement('span');
sep.textContent = ' | ';
sep.style.opacity = '0.6';
sep.style.margin = '0 6px';
keyDiv.appendChild(sep);
var rLbl = document.createElement('strong');
rLbl.textContent = 'R: ';
keyDiv.appendChild(rLbl);
[
{ col: pal.rep.at(3), title: 'R 15+' },
{ col: pal.rep.at(2), title: 'R 5-15' },
{ col: pal.rep.at(1), title: 'R 1-5' },
{ col: pal.rep.at(0), title: 'R <1' }
].forEach(function(item) {
var sw = document.createElement('span');
sw.className = 'polling-map-swatch';
sw.style.backgroundColor = item.col;
sw.title = item.title;
keyDiv.appendChild(sw);
});
var rangeNote = document.createElement('span');
rangeNote.textContent = ' (15+ / 5-15 / 1-5 / <1)';
rangeNote.style.opacity = '0.75';
rangeNote.style.marginLeft = '6px';
keyDiv.appendChild(rangeNote);
var statsDiv = document.createElement('div');
statsDiv.textContent = tippingText + 'Tossups (<2%): ' + tossupCount;
meta.appendChild(keyDiv);
meta.appendChild(statsDiv);
}
var score = drawer.querySelector('.polling-map-score');
if (score) {
score.textContent = '';
var demScoreCol = isDarkMode ? '#5c9eff' : '#1c408c';
var repScoreCol = isDarkMode ? '#ff5865' : '#b91c1c';
var gainCol = isDarkMode ? '#22c55e' : '#15803d';
var lossCol = isDarkMode ? '#b91c1c' : '#7f1d1d';
var evenCol = isDarkMode ? '#999999' : '#666666';
var makeDiffSpan = function(diff) {
var sp = document.createElement('span');
sp.style.marginLeft = '5px';
if (diff > 0) {
sp.textContent = '(+' + diff + ')';
sp.style.color = gainCol;
} else if (diff < 0) {
sp.textContent = '(' + diff + ')';
sp.style.color = lossCol;
} else {
sp.textContent = '(±0)';
sp.style.color = evenCol;
}
return sp;
};
var demSpan = document.createElement('span');
demSpan.style.color = demScoreCol;
var repSpan = document.createElement('span');
repSpan.style.color = repScoreCol;
var sepSpan = document.createElement('span');
sepSpan.textContent = ' · ';
sepSpan.style.color = isDarkMode ? '#777777' : '#666666';
if (activeTab === 'senate') {
var currentDemSenate = Number(q.dem_senate_seats) || 50;
var currentRepSenate = 100 - currentDemSenate;
demSpan.textContent = 'Democrat: ' + demTotal + ' Seats';
demSpan.appendChild(makeDiffSpan(demTotal - currentDemSenate));
repSpan.textContent = 'Republican: ' + repTotal + ' Seats';
repSpan.appendChild(makeDiffSpan(repTotal - currentRepSenate));
} else {
var unit = activeTab === 'pres' ? 'EV' : 'Races';
demSpan.textContent = 'Democrat: ' + demTotal + ' ' + unit;
repSpan.textContent = 'Republican: ' + repTotal + ' ' + unit;
}
score.appendChild(demSpan);
score.appendChild(sepSpan);
score.appendChild(repSpan);
}
}
function tryLoadSvg(urls, idx, wrap) {
if (idx >= urls.length) {
svgLoading = false;
wrap.textContent = 'Failed to load U.S. SVG map.';
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
wrap.textContent = '';
wrap.appendChild(svg);
mapReady = true;
svgLoading = false;
updateMap();
})
.catch(function() { tryLoadSvg(urls, idx + 1, wrap); });
}
// ============================================================================
// TPP-STYLE STATE -> COUNTY ZOOM & DEMOGRAPHIC SIMULATOR
// ============================================================================
var stateFips = {
AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',
FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',
LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',
NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',
OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',
VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'
};
var countyData = null;
var countySvgDoc = null;
function loadCountyAssets(callback) {
if (countyData && countySvgDoc) {
callback();
return;
}
var p1 = countyData
? Promise.resolve(countyData)
: fetch('counties.json').then(function(r) { return r.json(); }).then(function(d) { countyData = d; });
var svgUrl = 'wikimedia.org' + '/wikipedia/commons/5/5f/Usa_counties_large.svg';
var p2 = countySvgDoc
? Promise.resolve(countySvgDoc)
: fetch(svgUrl)
.then(function(r) { return r.text(); })
.then(function(txt) {
countySvgDoc = new DOMParser().parseFromString(txt, 'image/svg+xml');
});
Promise.all([p1, p2]).then(function() {
callback();
}).catch(function(err) {
console.warn('County map assets not loaded yet:', err);
});
}
function simulateStateCounties(q, polling, stCode, tab) {
var stRes = calcRaceResult(q, polling, stCode, tab);
if (!stRes || !countyData) return [];
var prefix = stateFips[stCode];
if (!prefix) return [];
var nat = q.nat_support || {};
var urbanShift = ((nat.geo && nat.geo.urban) || 0) - ((nat.geo && nat.geo.rural) || 0);
var collegeShift = ((nat.edu && nat.edu.college) || 0) - ((nat.edu && nat.edu.noncollege) || 0);
var demoTilt = (urbanShift * 0.35) + (collegeShift * 0.30);
var list = [];
var weightedSum = 0;
var totalWeight = 0;
Object.keys(countyData).forEach(function(fips) {
if (fips.slice(0, 2) !== prefix) return;
var entry = countyData[fips];
var cName = entry.at(0);
var baseDem = Number(entry.at(1));
var weight = Number(entry.at(2)) || 1;
var urbanFactor = (baseDem - 50) / 25;
var rawDem = baseDem + (urbanFactor * demoTilt);
list.push({ fips: fips, name: cName, dem: rawDem, weight: weight });
weightedSum += rawDem * weight;
totalWeight += weight;
});
if (list.length === 0 || totalWeight === 0) return [];
var currentAvg = weightedSum / totalWeight;
var adjust = stRes.dem - currentAvg;
list.forEach(function(c) {
c.dem = +(Math.max(1, Math.min(99, c.dem + adjust))).toFixed(2);
c.rep = +(100 - c.dem).toFixed(2);
c.margin = +(c.dem - c.rep).toFixed(2);
});
return list;
}
window.openStateCountyView = function(stCode) {
var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
if (!drawer) return;
zoomedState = stCode;
pinnedCode = null;
ensureDrawerContent(drawer);
var wrap = drawer.querySelector('.polling-map-svg-wrap');
if (!wrap) return;
wrap.textContent = 'Loading ' + stCode + ' county map...';
loadCountyAssets(function() {
var q = getQ();
var polling = getPolling();
if (!q || !polling || !countySvgDoc) return;
var counties = simulateStateCounties(q, polling, stCode, activeTab);
var ns = 'w3.org' + '/2000/svg';
var stSvg = document.createElementNS(ns, 'svg');
stSvg.style.width = '100%';
stSvg.style.maxHeight = '62vh';
stSvg.style.display = 'block';
stSvg.style.margin = '0 auto';
var g = document.createElementNS(ns, 'g');
var demCounties = 0, repCounties = 0;
var tip = drawer.querySelector('.polling-map-tooltip');
if (tip) tip.classList.remove('visible');
counties.forEach(function(c) {
if (c.margin >= 0) demCounties += 1;
else repCounties += 1;
var origPath = countySvgDoc.getElementById('c' + c.fips) || countySvgDoc.getElementById(c.fips);
if (!origPath) return;
var clone = document.importNode(origPath, true);
clone.querySelectorAll('title').forEach(function(t) { t.remove(); });
var col = colorForMargin(c.margin);
clone.style.setProperty('fill', col, 'important');
clone.style.setProperty('stroke', isDarkMode ? '#222222' : '#ffffff', 'important');
clone.style.setProperty('stroke-width', '0.6px', 'important');
clone.style.cursor = 'pointer';
clone.onpointerenter = function(e) {
if (!tip) return;
renderTooltipDOM(tip, c.fips, {
name: c.name,
ev: 0,
dem: c.dem,
rep: c.rep,
margin: c.margin,
demCand: 'Democrat',
repCand: 'Republican'
}, 'county', true, false);
tip.classList.add('visible');
var r = drawer.getBoundingClientRect();
tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 280) + 'px';
tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 155) + 'px';
};
clone.onpointermove = clone.onpointerenter;
clone.onpointerleave = function() {
if (tip) tip.classList.remove('visible');
};
g.appendChild(clone);
});
stSvg.appendChild(g);
wrap.textContent = '';
wrap.appendChild(stSvg);
var bbox = g.getBBox();
if (bbox && bbox.width > 0 && bbox.height > 0) {
var pad = Math.max(bbox.width, bbox.height) * 0.06;
stSvg.setAttribute('viewBox', (bbox.x - pad) + ' ' + (bbox.y - pad) + ' ' + (bbox.width + pad * 2) + ' ' + (bbox.height + pad * 2));
}
var score = drawer.querySelector('.polling-map-score');
var stRes = calcRaceResult(q, polling, stCode, activeTab);
if (score && stRes) {
score.textContent = '';
var m = stRes.margin;
var pre = m > 0 ? 'D+' : m < 0 ? 'R+' : 'Even ';
var titleSpan = document.createElement('span');
titleSpan.textContent = stRes.name + ' (' + pre + Math.abs(m).toFixed(2) + ') — Counties: ' + demCounties + ' D · ' + repCounties + ' R';
score.appendChild(titleSpan);
}
});
};
function initObserver() {
addStyles();
var drawer = document.getElementById('polling-map-drawer') || document.querySelector('.polling-map-drawer');
if (drawer) {
var isUpdating = false;
var safeUpdate = function() {
if (isUpdating) return;
isUpdating = true;
try {
updateMap();
} finally {
isUpdating = false;
}
};
var obs = new MutationObserver(function() {
if (drawer.classList.contains('open')) {
safeUpdate();
}
});
obs.observe(drawer, { attributes: true, attributeFilter: ['class', 'style'] });
if (drawer.classList.contains('open')) safeUpdate();
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
// U.S. ECONOMIC HISTORY DASHBOARD MODAL (100% DOM / SVG SAFE)
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
function buildClassicChartNode(data, labels, strokeColor, zeroLine) {
data = data.slice(-15);
labels = labels.slice(-15);
var ns = 'w3.org' + '/2000/svg';
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
var svg = document.createElementNS(ns, 'svg');
svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
svg.style.width = '100%';
svg.style.height = 'auto';
svg.style.display = 'block';
svg.style.marginTop = '4px';
var makeLine = function(x1, y1, x2, y2, stroke, width, dash) {
var l = document.createElementNS(ns, 'line');
l.setAttribute('x1', x1);
l.setAttribute('y1', y1);
l.setAttribute('x2', x2);
l.setAttribute('y2', y2);
l.setAttribute('stroke', stroke);
l.setAttribute('stroke-width', width);
if (dash) l.setAttribute('stroke-dasharray', dash);
return l;
};
var makeText = function(x, y, text, anchor) {
var tx = document.createElementNS(ns, 'text');
tx.setAttribute('x', x);
tx.setAttribute('y', y);
tx.setAttribute('font-size', '9');
tx.setAttribute('font-family', 'Times New Roman, serif');
tx.setAttribute('fill', '#222');
tx.setAttribute('text-anchor', anchor);
tx.textContent = text;
return tx;
};
svg.appendChild(makeLine(padL, padT, padL, padT + plotH, '#222', '1'));
svg.appendChild(makeLine(padL, padT + plotH, w - padR, padT + plotH, '#222', '1'));
if (zeroLine && min < 0 && max > 0) {
var zy = toY(0).toFixed(1);
svg.appendChild(makeLine(padL, zy, w - padR, zy, '#888', '1', '2,2'));
}
var tickCount = 4;
for (var t = 0; t <= tickCount; t++) {
var val = min + (t / tickCount) * (max - min);
var ty = toY(val).toFixed(1);
var lbl = Math.abs(val) >= 100 ? String(Math.round(val)) : val.toFixed(1);
svg.appendChild(makeLine(padL - 4, ty, padL, ty, '#222', '1'));
svg.appendChild(makeText(padL - 6, Number(ty) + 3, lbl, 'end'));
}
var idxs = [0, Math.floor((data.length - 1) / 2), data.length - 1];
idxs.forEach(function(idx) {
if (idx < 0 || idx >= data.length) return;
var tx = toX(idx).toFixed(1);
var xLbl = labels[idx] || '';
svg.appendChild(makeLine(tx, padT + plotH, tx, padT + plotH + 4, '#222', '1'));
svg.appendChild(makeText(tx, padT + plotH + 14, xLbl, 'middle'));
});
var pts = data.map(function(v, i) {
return toX(i).toFixed(1) + ',' + toY(v).toFixed(1);
}).join(' ');
var poly = document.createElementNS(ns, 'polyline');
poly.setAttribute('fill', 'none');
poly.setAttribute('stroke', strokeColor);
poly.setAttribute('stroke-width', '1.8');
poly.setAttribute('points', pts);
svg.appendChild(poly);
return svg;
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
function buildCardDOM(titleText, valText, deltaArr, invertGood, decimals, subText, chartData, labels, strokeColor, zeroLine, isBudget) {
var card = document.createElement('div');
card.className = 'us-econ-card';
var title = document.createElement('div');
title.className = 'us-econ-card-title';
title.textContent = titleText;
card.appendChild(title);
var valDiv = document.createElement('div');
valDiv.className = 'us-econ-val';
var mainSpan = document.createElement('span');
mainSpan.textContent = valText;
if (isBudget) {
mainSpan.style.color = chartData.at(-1) < 0 ? '#7f1d1d' : '#15803d';
}
valDiv.appendChild(mainSpan);
if (deltaArr && deltaArr.length >= 2) {
var cur = deltaArr.at(-1);
var prev = deltaArr.at(-2);
var diff = +(cur - prev).toFixed(decimals);
var badge = document.createElement('span');
badge.style.fontSize = '0.7em';
badge.style.marginLeft = '5px';
if (diff === 0) {
badge.style.color = '#666';
badge.textContent = '—';
} else {
var up = diff > 0;
var good = invertGood ? !up : up;
badge.style.color = good ? '#15803d' : '#7f1d1d';
badge.textContent = (up ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(decimals);
}
valDiv.appendChild(
badge);
}
card.appendChild(valDiv);
var sub = document.createElement('div');
sub.className = 'us-econ-sub';
sub.textContent = subText;
card.appendChild(sub);
card.appendChild(buildClassicChartNode(chartData, labels, strokeColor, zeroLine));
return card;
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
modal.textContent = '';
var header = document.createElement('div');
header.className = 'us-econ-header';
var dateSpan = document.createElement('span');
dateSpan.style.fontSize = '0.9em';
dateSpan.style.color = '#444';
dateSpan.textContent = h.labels.at(-1);
var h2 = document.createElement('h2');
h2.textContent = 'U.S. Economic History';
var closeBtn = document.createElement('button');
closeBtn.type = 'button';
closeBtn.className = 'us-econ-close';
closeBtn.textContent = 'Close ×';
closeBtn.onclick = function() {
modal.classList.remove('open');
};
header.appendChild(dateSpan);
header.appendChild(h2);
header.appendChild(closeBtn);
modal.appendChild(header);
var grid = document.createElement('div');
grid.className = 'us-econ-grid';
var inf = h.inflation.at(-1);
var unemp = h.unemployment.at(-1);
var gdp = h.gdp.at(-1);
var bud = h.budget.at(-1);
var sp = h.sp500.at(-1);
var growthRate = Number(q.economic_growth !== undefined ? q.economic_growth : 4.0);
var budBillions = Math.round(bud * 100);
var budSeriesBillions = h.budget.map(function(v) { return Math.round(v * 100); });
var budText = budBillions < 0
? 'Deficit $' + Math.abs(budBillions).toLocaleString() + 'B'
: 'Surplus +$' + budBillions.toLocaleString() + 'B';
grid.appendChild(buildCardDOM('Inflation (CPI YoY)', inf.toFixed(1) + '%', h.inflation, true, 1, 'Fed Target: 2.0%', h.inflation, h.labels, '#1a237e', false, false));
grid.appendChild(buildCardDOM('Unemployment Rate', unemp.toFixed(1) + '%', h.unemployment, true, 1, 'Civilian Labor Force', h.unemployment, h.labels, '#b71c1c', false, false));
grid.appendChild(buildCardDOM('U.S. Nominal GDP', '$' + gdp.toFixed(2) + 'T', h.gdp, false, 2, 'Annualized Growth: ' + (growthRate >= 0 ? '+' : '') + growthRate.toFixed(1) + '%', h.gdp, h.labels, '#1b5e20', false, false));
grid.appendChild(buildCardDOM('Federal Budget', budText, budSeriesBillions, false, 0, 'Annualized Balance ($ Billions)', budSeriesBillions, h.labels, '#0d47a1', true, true));
grid.appendChild(buildCardDOM('S&P 500 Index', Math.round(sp).toLocaleString(), h.sp500, false, 0, 'Wall Street Benchmark', h.sp500, h.labels, '#2e7d32', false, false));
modal.appendChild(grid);
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