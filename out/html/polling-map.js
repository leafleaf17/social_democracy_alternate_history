(function() {
  'use strict';

  var stateCodes = [
    'AK','WA','OR','CA','ID','NV','AZ','HI','MT','WY','UT','CO','NM',
    'ND','SD','NE','KS','OK','TX','MN','IA','MO','AR','LA','WI','IL',
    'KY','TN','MS','MI','IN','OH','WV','AL','NY','PA','VA','NC','GA',
    'FL','VT','NJ','MD','SC','NH','DE','ME','MA','CT','RI','DC'
  ];

  var svgSources = [
    'img/Blank_US_Map_(states_only).svg',
    'Blank_US_Map_(states_only).svg',
    'https://wikimedia.org'
  ];

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
      '.polling-map-svg-wrap svg { display:block; width:100%; max-width:960px; height:auto; margin:0 auto; }',
      '.polling-map-state { cursor:pointer; transition:opacity .12s ease; }',
      '.polling-map-state:hover, .polling-map-state:focus { opacity:.85; outline:none; }',
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

  function applyStateFill(shape, color) {
    shape.style.setProperty('fill', color, 'important');
    shape.setAttribute('fill', color);
    var children = shape.querySelectorAll('path, circle, polygon');
    children.forEach(function(child) {
      child.style.setProperty('fill', color, 'important');
      child.setAttribute('fill', color);
    });
  }

  function findStateShape(svg, code) {
    return svg.querySelector('#' + code) ||
           svg.querySelector('#' + code.toLowerCase()) ||
           svg.querySelector('[data-id="' + code + '"]');
  }

  function updateMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    var polling = pollingResults();
    var svg = drawer.querySelector('.polling-map-svg-wrap svg');
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
    stateCodes.forEach(function(code) {
      var result = polling[code];
      var shape = findStateShape(svg, code);
      if (!result || !shape) return;

      applyStateFill(shape, colorForMargin(Number(result.margin)));
      shape.setAttribute('class', (shape.getAttribute('class') || '') + ' polling-map-state');
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

  function fetchFirstAvailableSvg(urls, index) {
    if (index >= urls.length) {
      return Promise.reject(new Error('Could not load U.S. SVG map from any source.'));
    }
    return fetch(urls[index])
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .catch(function() {
        return fetchFirstAvailableSvg(urls, index + 1);
      });
  }

  function buildWikiMap(drawer) {
    var wrap = drawer.querySelector('.polling-map-svg-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p style="padding:1em;">Loading U.S. SVG map…</p>';

    fetchFirstAvailableSvg(svgSources, 0)
      .then(function(svgText) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(svgText, 'image/svg+xml');
        var parsedSvg = doc.querySelector('svg');
        if (!parsedSvg) throw new Error('Invalid SVG document');

        var svg = document.importNode(parsedSvg, true);
        svg.setAttribute('class', 'polling-us-map');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        if (!svg.getAttribute('viewBox')) {
          svg.setAttribute('viewBox', '0 0 959 593');
        }

        var dc = findStateShape(svg, 'DC');
        if (dc && dc.tagName.toLowerCase() === 'circle') {
          dc.setAttribute('r', '6');
          dc.style.stroke = '#ffffff';
          dc.style.strokeWidth = '1.5';
        }

        wrap.textContent = '';
        wrap.appendChild(svg);
        mapReady = true;
        updateMap();
      })
      .catch(function(err) {
        wrap.innerHTML = '<p style="padding:1em;color:#a51c30;">Unable to load U.S. map SVG (' + err.message + ').</p>';
      });
  }

  function loadMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || drawer.querySelector('.polling-map-content')) return;
    addStyles();
    drawer.innerHTML = '<button type="button" class="polling-map-close" onclick="window.closePollingMaps();">Close ×</button>' +
      '<h2>U.S. Electoral Map</h2><div class="polling-map-content"><p class="polling-map-score">Loading current state polling…</p>' +
legendHtml() +
'' +
'Hover or focus a state for exact polling results.';
buildWikiMap(drawer);
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