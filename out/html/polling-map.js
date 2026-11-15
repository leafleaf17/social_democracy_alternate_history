(function() {
  'use strict';

  // The SVG is stored at repository root; raw.githubusercontent.com serves its actual XML.
  var MAP_URL = 'https://raw.githubusercontent.com/leafleaf17/social_democracy_alternate_history/main/Blank_US_Map_%28states_only%29.svg';
  var stateNames = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
    IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  };
  var colors = {
    dem: ['#d6e5f4', '#91b9df', '#4b8ac6', '#174a7e'],
    rep: ['#f2d5d5', '#e59b9b', '#d65757', '#a51c30']
  };
  var mapReady = false;
  var renderTimer;

  function currentQualities() {
    var ui = window.dendryUI;
    return ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities;
  }

  // Four requested margin bands: under 1, 1–5, 5–15, and 15+ points.
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

  function stateShapes(svg, code) {
    // The local SVG marks each state with its lowercase postal abbreviation class.
    return svg.querySelectorAll('path.' + code.toLowerCase() + ', circle.' + code.toLowerCase());
  }

  function tooltipText(code, result) {
    var margin = Number(result.margin);
    var leader = margin > 0 ? 'Democrat lead' : margin < 0 ? 'Republican lead' : 'Tie';
    var marginLabel = margin > 0 ? 'D+' : margin < 0 ? 'R+' : 'Even ';
    return result.name + ' (' + code + ') — ' + leader + '\n' +
      'Democrat: ' + formatPercent(result.dem) + '\n' +
      'Republican: ' + formatPercent(result.rep) + '\n' +
      'Margin: ' + marginLabel + Math.abs(margin).toFixed(2) +
      (Math.abs(margin) < 0.01 ? '' : ' points') + '\n' + result.ev + ' electoral votes';
  }

  function positionTooltip(tooltip, event, drawer) {
    var rect = drawer.getBoundingClientRect();
    var x = event.clientX ? event.clientX - rect.left + 12 : 12;
    var y = event.clientY ? event.clientY - rect.top + 12 : 12;
    tooltip.style.left = Math.min(x, Math.max(12, rect.width - 230)) + 'px';
    tooltip.style.top = Math.min(y, Math.max(12, rect.height - 135)) + 'px';
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

    var tooltip = drawer.querySelector('.polling-map-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'polling-map-tooltip';
      tooltip.setAttribute('role', 'status');
      drawer.appendChild(tooltip);
    }

    Object.keys(stateNames).forEach(function(code) {
      var result = polling[code];
      if (!result) return;
      Array.prototype.forEach.call(stateShapes(svg, code), function(shape) {
        shape.style.fill = colorForMargin(Number(result.margin));
        shape.setAttribute('aria-label', tooltipText(code, result).replace(/\n/g, ', '));
        var title = shape.querySelector('title');
        if (!title) {
          title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          shape.appendChild(title);
        }
        title.textContent = tooltipText(code, result);
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
        shape.setAttribute('tabindex', '0');
      });
    });
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
      '.polling-map-svg-wrap { width:100%; min-height:300px; background:#f7f8fa; border:1px solid #bbb; }',
      '.polling-map-svg-wrap svg { display:block; width:100%; height:auto; max-height:68vh; }',
      '.polling-map-svg-wrap .state path, .polling-map-svg-wrap .state circle { stroke:#fff; stroke-width:1; stroke-linejoin:round; transition:fill .15s ease; cursor:pointer; }',
      '.polling-map-svg-wrap .state path:focus, .polling-map-svg-wrap .state circle:focus { outline:none; stroke:#111; stroke-width:2.5; }',
      '.polling-map-legend { display:flex; flex-wrap:wrap; gap:.4em 1em; margin:.6em 0; font-size:.9em; }',
      '.polling-map-legend span { white-space:nowrap; }',
      '.polling-map-swatch { display:inline-block; width:1em; height:1em; vertical-align:-.15em; margin-right:.25em; border:1px solid #555; }',
      '.polling-map-tooltip { display:none; position:absolute; z-index:5; white-space:pre-line; padding:.55em .7em; max-width:220px; background:#171717; color:#fff; border:1px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,.35); font-size:.75em; line-height:1.4; pointer-events:none; }',
      '.polling-map-tooltip.visible { display:block; }',
      '.polling-map-credit { font-size:.75em; margin:.4em 0 0; }',
      '.polling-map-error { color:#8b1a1a; }',
      '@media(max-width:600px) { .polling-map-drawer { width:96vw; height:88vh; top:5vh; right:2vw; padding:.8em; } .polling-map-svg-wrap svg { max-height:58vh; } }'
    ].join('\n');
    document.head.appendChild(style);
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

  function loadMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || drawer.querySelector('.polling-map-content')) return;
    addStyles();
    drawer.innerHTML = '<button type="button" class="polling-map-close" onclick="window.closePollingMaps();">Close ×</button>' +
      '<h2>U.S. Electoral Map</h2><div class="polling-map-content"><p class="polling-map-score">Loading current state polling…</p>' +
      legendHtml() +
      '<div class="polling-map-svg-wrap"><p class="polling-map-error">Loading local state map…</p></div>' +
      '<p class="polling-map-credit">State outline: <a href="https://github.com/leafleaf17/social_democracy_alternate_history/blob/main/Blank_US_Map_(states_only).svg" target="_blank" rel="noopener">Uploaded state SVG</a>. Hover or focus a state for exact polling results.</p></div>';

    var request = new XMLHttpRequest();
    request.open('GET', MAP_URL, true);
    request.onreadystatechange = function() {
      if (request.readyState !== 4) return;
      var wrap = drawer.querySelector('.polling-map-svg-wrap');
      if (request.status < 200 || request.status >= 300) {
        if (wrap) wrap.innerHTML = '<p class="polling-map-error">Could not load the uploaded SVG from raw.githubusercontent.com (HTTP ' + request.status + ').</p>';
        return;
      }
      try {
        var parsed = new DOMParser().parseFromString(request.responseText, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('Invalid SVG XML');
        var svg = parsed.documentElement;
        svg.classList.add('polling-us-map');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'United States electoral polling map');
        var stateCount = 0;
        Object.keys(stateNames).forEach(function(code) {
          if (stateShapes(svg, code).length) stateCount += 1;
        });
        if (stateCount < 45) throw new Error('Expected state class paths were not found in the SVG (' + stateCount + ' states found).');
        if (wrap) {
          wrap.textContent = '';
          wrap.appendChild(document.importNode(svg, true));
        }
        mapReady = true;
        updateMap();
      } catch (error) {
        if (wrap) wrap.innerHTML = '<p class="polling-map-error">The uploaded file could not be used as an SVG: ' + error.message + '.</p>';
        if (window.console) console.warn('Polling map SVG parse:', error);
      }
    };
    request.send();
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
