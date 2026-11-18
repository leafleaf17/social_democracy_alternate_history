(function() {
  'use strict';

  // Offline electoral cartogram: each state is drawn as an SVG tile, so no map asset or
  // network request is needed. Coordinates are a simplified US tile-grid layout.
  var stateTiles = [
    ['AK','Alaska',0,5], ['WA','Washington',1,0], ['OR','Oregon',1,1], ['CA','California',1,2],
    ['ID','Idaho',2,1], ['NV','Nevada',2,2], ['AZ','Arizona',2,3], ['HI','Hawaii',2,5],
    ['MT','Montana',3,0], ['WY','Wyoming',3,1], ['UT','Utah',3,2], ['CO','Colorado',3,3],
    ['NM','New Mexico',3,4], ['ND','North Dakota',4,0], ['SD','South Dakota',4,1], ['NE','Nebraska',4,2],
    ['KS','Kansas',4,3], ['OK','Oklahoma',4,4], ['TX','Texas',4,5], ['MN','Minnesota',5,0],
    ['IA','Iowa',5,1], ['MO','Missouri',5,2], ['AR','Arkansas',5,3], ['LA','Louisiana',5,4],
    ['WI','Wisconsin',6,0], ['IL','Illinois',6,1], ['KY','Kentucky',6,2], ['TN','Tennessee',6,3],
    ['MS','Mississippi',6,4], ['MI','Michigan',7,0], ['IN','Indiana',7,1], ['OH','Ohio',7,2],
    ['WV','West Virginia',7,3], ['AL','Alabama',7,4], ['NY','New York',8,0], ['PA','Pennsylvania',8,1],
    ['VA','Virginia',8,2], ['NC','North Carolina',8,3], ['GA','Georgia',8,4], ['FL','Florida',8,5],
    ['VT','Vermont',9,0], ['NJ','New Jersey',9,1], ['MD','Maryland',9,2], ['SC','South Carolina',9,3],
    ['NH','New Hampshire',10,0], ['DE','Delaware',10,2], ['ME','Maine',11,0], ['MA','Massachusetts',11,1],
    ['CT','Connecticut',11,2], ['RI','Rhode Island',11,3], ['DC','District of Columbia',10,3]
  ];
  var colors = {
    dem: ['#d6e5f4', '#91b9df', '#4b8ac6', '#174a7e'],
    rep: ['#f2d5d5', '#e59b9b', '#d65757', '#a51c30']
  };
  var tileWidth = 58;
  var tileHeight = 42;
  var gap = 4;
  var mapReady = false;
  var renderTimer;

  function currentQualities() {
    var ui = window.dendryUI;
    return ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities;
  }

  // Under 1, 1–5, 5–15, and 15+ percentage points.
  function marginBand(margin) {
    var absolute = Math.abs(margin);
    if (absolute >= 15) return 3;
    if (absolute >= 5) return 2;
    if (absolute >= 1) return 1;
    return 0;
  }

  function colorForMargin(margin) {
    return (margin >= 0 ? colors.dem : colors.rep)[marginBand(margin)];
  }

  function formatPercent(value) {
    return Number(value).toFixed(2) + '%';
  }

  function pollingResults() {
    var qualities = currentQualities();
    if (!qualities) return null;
    if (typeof window.simulate_polling === 'function') window.simulate_polling();
    return qualities.polling || null;
  }

  function tooltipText(code, result) {
    var margin = Number(result.margin);
    var leader = margin > 0 ? 'Democrat lead' : margin < 0 ? 'Republican lead' : 'Tie';
    var prefix = margin > 0 ? 'D+' : margin < 0 ? 'R+' : 'Even ';
    return result.name + ' (' + code + ') — ' + leader + '\n' +
      'Democrat: ' + formatPercent(result.dem) + '\n' +
      'Republican: ' + formatPercent(result.rep) + '\n' +
      'Margin: ' + prefix + Math.abs(margin).toFixed(2) +
      (Math.abs(margin) < 0.01 ? '' : ' points') + '\n' + result.ev + ' electoral votes';
  }

  function addStyles() {
    if (document.getElementById('polling-map-styles')) return;
    var style = document.createElement('style');
    style.id = 'polling-map-styles';
    style.textContent = [
      '.polling-map-drawer { width:min(1100px,94vw); height:min(86vh,900px); top:7vh; right:3vw; overflow:auto; z-index:40; padding:1.2em; }',
      '.polling-map-drawer h2 { margin:0 0 .4em; }',
      '.polling-map-content { position:relative; }',
      '.polling-map-score { margin:.3em 0 .75em; font-weight:bold; }',
      '.polling-map-svg-wrap { width:100%; min-height:300px; background:#f7f8fa; border:1px solid #bbb; overflow:auto; }',
      '.polling-map-svg-wrap svg { display:block; width:100%; min-width:660px; height:auto; }',
      '.polling-map-tile { stroke:#fff; stroke-width:2; cursor:pointer; }',
      '.polling-map-tile:focus { outline:none; stroke:#111; stroke-width:3; }',
      '.polling-map-state-label { font: bold 13px sans-serif; fill:#222; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }',
      '.polling-map-legend { display:flex; flex-wrap:wrap; gap:.4em 1em; margin:.6em 0; font-size:.9em; }',
      '.polling-map-legend span { white-space:nowrap; }',
      '.polling-map-swatch { display:inline-block; width:1em; height:1em; vertical-align:-.15em; margin-right:.25em; border:1px solid #555; }',
      '.polling-map-tooltip { display:none; position:absolute; z-index:5; white-space:pre-line; padding:.55em .7em; max-width:230px; background:#171717; color:#fff; border:1px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,.35); font:14px/1.4 sans-serif; pointer-events:none; }',
      '.polling-map-tooltip.visible { display:block; }',
      '.polling-map-credit { font-size:.75em; margin:.4em 0 0; }',
      '@media(max-width:600px) { .polling-map-drawer { width:96vw; height:88vh; top:5vh; right:2vw; padding:.8em; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function makeTooltip(drawer) {
    var tooltip = document.createElement('div');
    tooltip.className = 'polling-map-tooltip';
    tooltip.setAttribute('role', 'status');
    drawer.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(tooltip, event, drawer) {
    var rect = drawer.getBoundingClientRect();
    var x = event.clientX ? event.clientX - rect.left + 12 : 12;
    var y = event.clientY ? event.clientY - rect.top + 12 : 12;
    tooltip.style.left = Math.min(x, Math.max(12, rect.width - 245)) + 'px';
    tooltip.style.top = Math.min(y, Math.max(12, rect.height - 145)) + 'px';
  }

  function updateMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    var polling = pollingResults();
    var svg = drawer.querySelector('svg.polling-us-map');
    if (!polling || !svg || !mapReady) return;

    var demEV = 0;
    var repEV = 0;
    Object.keys(polling).forEach(function(code) {
      var result = polling[code];
      if (Number(result.margin) >= 0) demEV += Number(result.ev);
      else repEV += Number(result.ev);
    });
    var score = drawer.querySelector('.polling-map-score');
    if (score) score.textContent = 'Projected Electoral Votes: Democrat ' + demEV + ' · Republican ' + repEV;

    var tooltip = drawer.querySelector('.polling-map-tooltip') || makeTooltip(drawer);
    stateTiles.forEach(function(tile) {
      var code = tile[0];
      var result = polling[code];
     // Change this line in updateMap():
var shape = svg.querySelector('[data-state-code="' + code + '"] rect');
      if (!result || !shape) return;
      shape.setAttribute('fill', colorForMargin(Number(result.margin)));
      shape.setAttribute('aria-label', tooltipText(code, result).replace(/\n/g, ', '));
      shape.setAttribute('tabindex', '0');
      shape.onpointerenter = function(event) {
        tooltip.textContent = tooltipText(code, result);
        tooltip.classList.add('visible');
        positionTooltip(tooltip, event, drawer);
      };
      shape.onpointermove = function(event) { positionTooltip(tooltip, event, drawer); };
      shape.onpointerleave = function() { tooltip.classList.remove('visible'); };
      shape.onfocus = function() {
        tooltip.textContent = tooltipText(code, result);
        tooltip.classList.add('visible');
      };
      shape.onblur = function() { tooltip.classList.remove('visible'); };
    });
  }

  function legendHtml() {
    return '<div class="polling-map-legend" aria-label="Map legend">' +
      '<span><i class="polling-map-swatch" style="background:#a51c30"></i>Republican 15+ points</span>' +
      '<span><i class="polling-map-swatch" style="background:#d65757"></i>Republican 5–15</span>' +
      '<span><i class="polling-map-swatch" style="background:#e59b9b"></i>Republican 1–5</span>' +
      '<span><i class="polling-map-swatch" style="background:#f2d5d5"></i>Republican under 1</span>' +
      '<span><i class="polling-map-swatch" style="background:#d6e5f4"></i>Democrat under 1</span>' +
      '<span><i class="polling-map-swatch" style="background:#91b9df"></i>Democrat 1–5</span>' +
      '<span><i class="polling-map-swatch" style="background:#4b8ac6"></i>Democrat 5–15</span>' +
      '<span><i class="polling-map-swatch" style="background:#174a7e"></i>Democrat 15+ points</span></div>';
  }

  function buildOfflineMap(drawer) {
    var wrap = drawer.querySelector('.polling-map-svg-wrap');
    if (!wrap) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'polling-us-map');
    svg.setAttribute('viewBox', '0 0 744 404');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Offline United States electoral polling tile map');

    stateTiles.forEach(function(tile) {
      var code = tile[0];
      var name = tile[1];
      var x = tile[2] * (tileWidth + gap);
      var y = tile[3] * (tileHeight + gap);
      var group = document.createElementNS(ns, 'g');
      group.setAttribute('data-state-code', code);
      group.setAttribute('aria-label', name);
      group.setAttribute('tabindex', '0');

      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('class', 'polling-map-tile');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', tileWidth);
      rect.setAttribute('height', tileHeight);
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#d0d0d0');
      group.appendChild(rect);

      var label = document.createElementNS(ns, 'text');
      label.setAttribute('class', 'polling-map-state-label');
      label.setAttribute('x', x + tileWidth / 2);
      label.setAttribute('y', y + tileHeight / 2);
      label.textContent = code;
      group.appendChild(label);

      var title = document.createElementNS(ns, 'title');
      title.textContent = name;
      group.appendChild(title);
      svg.appendChild(group);
    });

    wrap.textContent = '';
    wrap.appendChild(svg);
    mapReady = true;
    updateMap();
  }

  function loadMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || drawer.querySelector('.polling-map-content')) return;
    addStyles();
    drawer.innerHTML = '<button type="button" class="polling-map-close" onclick="window.closePollingMaps();">Close ×</button>' +
      '<h2>U.S. Electoral Map</h2><div class="polling-map-content"><p class="polling-map-score">Loading current state polling…</p>' +
      legendHtml() +
      '<div class="polling-map-svg-wrap"></div>' +
      '<p class="polling-map-credit">Offline state tile map; no external file or network request is needed. Hover or focus a state for exact polling results.</p></div>';
    buildOfflineMap(drawer);
  }

  function initialize() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer) return;
    loadMap();
    if (!renderTimer) renderTimer = window.setInterval(updateMap, 1500);
    var observer = new MutationObserver(function() {
      if (drawer.classList.contains('open')) updateMap();
    });
    observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    window.renderPollingMap = updateMap;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
}());
