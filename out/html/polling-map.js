(function() {
  'use strict';

  var MAP_QUERY_URL = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=File:Blank_US_Map_%28states_only%29.svg&origin=*';
  var stateNames = {
    AL: ['Alabama'], AK: ['Alaska'], AZ: ['Arizona'], AR: ['Arkansas'], CA: ['California'],
    CO: ['Colorado'], CT: ['Connecticut'], DE: ['Delaware'], DC: ['District of Columbia', 'D.C.'],
    FL: ['Florida'], GA: ['Georgia'], HI: ['Hawaii'], ID: ['Idaho'], IL: ['Illinois'], IN: ['Indiana'],
    IA: ['Iowa'], KS: ['Kansas'], KY: ['Kentucky'], LA: ['Louisiana'], ME: ['Maine'], MD: ['Maryland'],
    MA: ['Massachusetts'], MI: ['Michigan'], MN: ['Minnesota'], MS: ['Mississippi'], MO: ['Missouri'],
    MT: ['Montana'], NE: ['Nebraska'], NV: ['Nevada'], NH: ['New Hampshire'], NJ: ['New Jersey'],
    NM: ['New Mexico'], NY: ['New York'], NC: ['North Carolina'], ND: ['North Dakota'], OH: ['Ohio'],
    OK: ['Oklahoma'], OR: ['Oregon'], PA: ['Pennsylvania'], RI: ['Rhode Island'], SC: ['South Carolina'],
    SD: ['South Dakota'], TN: ['Tennessee'], TX: ['Texas'], UT: ['Utah'], VT: ['Vermont'], VA: ['Virginia'],
    WA: ['Washington'], WV: ['West Virginia'], WI: ['Wisconsin'], WY: ['Wyoming']
  };
  var colors = {
    dem: ['#d6e5f4', '#91b9df', '#4b8ac6', '#174a7e'],
    rep: ['#f2d5d5', '#e59b9b', '#d65757', '#a51c30'],
    tie: '#d8d8d8'
  };
  var mapReady = false;
  var renderTimer;

  function currentQualities() {
    var ui = window.dendryUI;
    return ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities;
  }

  function marginBand(margin) {
    var absolute = Math.abs(margin);
    if (absolute > 15) return 3;
    if (absolute > 10) return 2;
    if (absolute > 5) return 1;
    return 0;
  }

  function colorForMargin(margin) {
    if (Math.abs(margin) < 0.01) return colors.tie;
    var palette = margin > 0 ? colors.dem : colors.rep;
    return palette[marginBand(margin)];
  }

  function pct(value) {
    return Number(value).toFixed(2) + '%';
  }

  function results() {
    var q = currentQualities();
    if (!q) return null;
    if (typeof window.simulate_polling === 'function') window.simulate_polling();
    return q.polling || null;
  }

  function findStateShapes(svg) {
    var aliases = {};
    Object.keys(stateNames).forEach(function(code) {
      stateNames[code].forEach(function(name) {
        aliases[name.toLowerCase().replace(/[^a-z]/g, '')] = code;
      });
      aliases[code.toLowerCase()] = code;
    });

    var shapeMap = {};
    Array.prototype.forEach.call(svg.querySelectorAll('path, polygon'), function(shape) {
      var node = shape;
      var code = null;
      while (node && node !== svg && !code) {
        var attrs = ['id', 'class', 'aria-label', 'title', 'name'];
        var text = '';
        attrs.forEach(function(attr) { text += ' ' + (node.getAttribute(attr) || ''); });
        var title = node.querySelector && node.querySelector('title');
        if (title) text += ' ' + title.textContent;
        var normalized = text.toLowerCase().replace(/[^a-z]/g, '');
        Object.keys(aliases).some(function(alias) {
          if (normalized === alias || normalized.indexOf(alias) !== -1) {
            code = aliases[alias];
            return true;
          }
          return false;
        });
        node = node.parentNode;
      }
      if (code) {
        if (!shapeMap[code]) shapeMap[code] = [];
        shapeMap[code].push(shape);
      }
    });
    return shapeMap;
  }

  function tooltipText(code, result) {
    var margin = Number(result.margin);
    var leader = margin > 0 ? 'Democrat' : margin < 0 ? 'Republican' : 'Tie';
    return result.name + ' (' + code + ') — ' + leader + ' lead\n' +
      'Democrat: ' + pct(result.dem) + '\n' +
      'Republican: ' + pct(result.rep) + '\n' +
      'Margin: ' + (margin > 0 ? 'D+' : margin < 0 ? 'R+' : 'Even ') + Math.abs(margin).toFixed(2) +
      (Math.abs(margin) < 0.01 ? '' : ' points') + '\n' + result.ev + ' electoral votes';
  }

  function makeTooltip(drawer) {
    var tooltip = document.createElement('div');
    tooltip.className = 'polling-map-tooltip';
    tooltip.setAttribute('role', 'status');
    drawer.appendChild(tooltip);
    return tooltip;
  }

  function updateMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    var polling = results();
    if (!polling) return;

    var svg = drawer.querySelector('svg.polling-us-map');
    if (!svg || !mapReady) return;
    var demEV = 0;
    var repEV = 0;
    var undecided = 0;
    Object.keys(polling).forEach(function(code) {
      var result = polling[code];
      var margin = Number(result.margin);
      if (margin > 0) demEV += Number(result.ev);
      else if (margin < 0) repEV += Number(result.ev);
      else undecided += Number(result.ev);
    });
    var score = drawer.querySelector('.polling-map-score');
    if (score) score.textContent = 'Projected Electoral Votes: Democrat ' + demEV + ' · Republican ' + repEV + (undecided ? ' · Toss-up ' + undecided : '');

    var tooltip = drawer.querySelector('.polling-map-tooltip') || makeTooltip(drawer);
    Object.keys(stateNames).forEach(function(code) {
      var result = polling[code];
      var shapes = svg.querySelectorAll('[data-state-code="' + code + '"]');
      if (!result) return;
      Array.prototype.forEach.call(shapes, function(shape) {
        shape.style.fill = colorForMargin(Number(result.margin));
        shape.setAttribute('aria-label', tooltipText(code, result).replace(/\n/g, ', '));
        var title = shape.querySelector('title');
        if (!title) { title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); shape.appendChild(title); }
        title.textContent = tooltipText(code, result);
        shape.onpointerenter = function(event) {
          tooltip.textContent = tooltipText(code, result);
          tooltip.classList.add('visible');
          positionTooltip(tooltip, event, drawer);
        };
        shape.onpointermove = function(event) { positionTooltip(tooltip, event, drawer); };
        shape.onpointerleave = function() { tooltip.classList.remove('visible'); };
        shape.onfocus = function() { tooltip.textContent = tooltipText(code, result); tooltip.classList.add('visible'); };
        shape.onblur = function() { tooltip.classList.remove('visible'); };
        shape.setAttribute('tabindex', '0');
      });
    });
  }

  function positionTooltip(tooltip, event, drawer) {
    var rect = drawer.getBoundingClientRect();
    var x = event.clientX ? event.clientX - rect.left + 12 : 12;
    var y = event.clientY ? event.clientY - rect.top + 12 : 12;
    tooltip.style.left = Math.min(x, Math.max(12, rect.width - 230)) + 'px';
    tooltip.style.top = Math.min(y, Math.max(12, rect.height - 135)) + 'px';
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
      '.polling-map-svg-wrap svg { display:block; width:100%; max-height:68vh; }',
      '.polling-map-svg-wrap path, .polling-map-svg-wrap polygon { stroke:#fff; stroke-width:1.2; stroke-linejoin:round; transition:fill .15s ease; cursor:pointer; }',
      '.polling-map-svg-wrap path:focus, .polling-map-svg-wrap polygon:focus { outline:none; stroke:#111; stroke-width:2.5; }',
      '.polling-map-legend { display:flex; flex-wrap:wrap; gap:.4em 1em; margin:.6em 0; font-size:.9em; }',
      '.polling-map-legend span { white-space:nowrap; }',
      '.polling-map-swatch { display:inline-block; width:1em; height:1em; vertical-align:-.15em; margin-right:.25em; border:1px solid #555; }',
      '.polling-map-tooltip { display:none; position:absolute; z-index:5; white-space:pre-line; padding:.55em .7em; max-width:220px; background:#171717; color:#fff; border:1px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,.35); font-size:.75em; line-height:1.4; }',
      '.polling-map-tooltip.visible { display:block; }',
      '.polling-map-credit { font-size:.75em; margin:.4em 0 0; }',
      '.polling-map-error { color:#8b1a1a; }',
      '@media(max-width:600px) { .polling-map-drawer { width:96vw; height:88vh; top:5vh; right:2vw; padding:.8em; } .polling-map-svg-wrap svg { max-height:58vh; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function loadMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || drawer.querySelector('.polling-map-content')) return;
    addStyles();
    drawer.innerHTML = '<button type="button" class="polling-map-close" onclick="window.closePollingMaps();">Close ×</button>' +
      '<h2>U.S. Electoral Map</h2><div class="polling-map-content"><p class="polling-map-score">Loading current state polling…</p>' +
      '<div class="polling-map-legend" aria-label="Map legend">' +
      '<span><i class="polling-map-swatch" style="background:#a51c30"></i>Republican 15+ points</span>' +
      '<span><i class="polling-map-swatch" style="background:#d65757"></i>Republican 10–15</span>' +
      '<span><i class="polling-map-swatch" style="background:#e59b9b"></i>Republican 5–10</span>' +
      '<span><i class="polling-map-swatch" style="background:#f2d5d5"></i>Republican under 5</span>' +
      '<span><i class="polling-map-swatch" style="background:#d8d8d8"></i>Tie</span>' +
      '<span><i class="polling-map-swatch" style="background:#d6e5f4"></i>Democrat under 5</span>' +
      '<span><i class="polling-map-swatch" style="background:#91b9df"></i>Democrat 5–10</span>' +
      '<span><i class="polling-map-swatch" style="background:#4b8ac6"></i>Democrat 10–15</span>' +
      '<span><i class="polling-map-swatch" style="background:#174a7e"></i>Democrat 15+ points</span></div>' +
      '<div class="polling-map-svg-wrap"><p class="polling-map-error">Loading state map from Wikimedia Commons…</p></div>' +
      '<p class="polling-map-credit">State outline: <a href="https://commons.wikimedia.org/wiki/File:Blank_US_Map_(states_only).svg" target="_blank" rel="noopener">Wikimedia Commons</a>. Hover or focus a state to see exact polling results.</p></div>';

    fetch(MAP_QUERY_URL)
      .then(function(response) {
        if (!response.ok) throw new Error('Wikimedia API returned ' + response.status);
        return response.json();
      })
      .then(function(data) {
        var page = data && data.query && data.query.pages ? Object.values(data.query.pages)[0] : null;
        var imageInfo = page && page.imageinfo && page.imageinfo[0];
        var fileUrl = imageInfo && imageInfo.url;
        if (!fileUrl) throw new Error('Missing Wikimedia SVG URL.');
        return fetch(fileUrl);
      })
      .then(function(response) {
        if (!response.ok) throw new Error('Map download returned ' + response.status);
        return response.text();
      })
      .then(function(text) {
        var parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('The Wikimedia map could not be parsed.');
        var svg = parsed.documentElement;
        svg.classList.add('polling-us-map');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'United States electoral polling map');
        var shapeMap = findStateShapes(svg);
        Object.keys(shapeMap).forEach(function(code) {
          shapeMap[code].forEach(function(shape) { shape.setAttribute('data-state-code', code); });
        });
        if (Object.keys(shapeMap).length < 45) throw new Error('State shapes were not recognized in the Wikimedia SVG.');
        var wrap = drawer.querySelector('.polling-map-svg-wrap');
        wrap.textContent = '';
        wrap.appendChild(document.importNode(svg, true));
        mapReady = true;
        updateMap();
      })
      .catch(function(error) {
        var wrap = drawer.querySelector('.polling-map-svg-wrap');
        if (wrap) wrap.innerHTML = '<p class="polling-map-error">Could not load the Wikimedia state map. Check your connection or open the map source directly: <a href="https://commons.wikimedia.org/wiki/File:Blank_US_Map_(states_only).svg" target="_blank" rel="noopener">Wikimedia Commons</a>.</p>';
        if (window.console) console.warn('Polling map:', error);
      });
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
