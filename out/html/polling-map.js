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
  var renderTimer = null;

  function getPolling() {
    var ui = window.dendryUI;
    var q = ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.qualities;
    if (!q) return null;
    if (typeof window.simulate_polling === 'function') window.simulate_polling();
    return q.polling || null;
  }

  function colorForMargin(margin) {
    var abs = Math.abs(margin);
    var band = abs >= 15 ? 3 : abs >= 5 ? 2 : abs >= 1 ? 1 : 0;
    return (margin >= 0 ? colors.dem : colors.rep)[band];
  }

  function tooltipText(code, res) {
    var m = Number(res.margin);
    var lead = m > 0 ? 'Democrat lead' : m < 0 ? 'Republican lead' : 'Tie';
    var pre = m > 0 ? 'D+' : m < 0 ? 'R+' : 'Even ';
    return res.name + ' (' + code + ') — ' + lead + '<br>' +
        '<span style="color:#5c9eff;"><strong>Democrat</strong></span>: ' + Number(res.dem).toFixed(2) + '%<br>' +
        '<span style="color:#ff5865;"><strong>Republican</strong></span>: ' + Number(res.rep).toFixed(2) + '%<br>' +
        'Margin: ' + pre + Math.abs(m).toFixed(2) + ' points<br>' +
        res.ev + ' electoral votes';
}

function addStyles() {
    if (document.getElementById('polling-map-styles')) return;
    var s = document.createElement('style');
    s.id = 'polling-map-styles';
    s.textContent =
      '#polling-map-drawer,.polling-map-drawer{width:min(1100px,94vw);height:min(86vh,900px);top:7vh;right:3vw;overflow:auto;z-index:40;padding:1.2em;background:#000000 !important;background-color:#000000 !important;color:#ffffff !important;border:1px solid #444 !important}' +
      '.polling-map-drawer *,.polling-map-content,.polling-map-score,.polling-map-legend{color:#ffffff !important}' +
      '.polling-map-svg-wrap{width:100%;min-height:300px;background:#000000 !important;border:1px solid #444;overflow:auto}' +
      '.polling-map-svg-wrap svg{display:block;width:100%;max-width:960px;height:auto;margin:0 auto;background:#000000 !important}' +
      '.polling-map-svg-wrap svg rect{fill:#000000 !important}' +
      '.polling-map-state{cursor:pointer;stroke:#555555 !important;stroke-width:0.75px}.polling-map-state:hover{opacity:.85;stroke:#ffffff !important}' +
      '.polling-map-legend{display:flex;flex-wrap:wrap;gap:.4em 1em;margin:.6em 0;font-size:.9em}' +
      '.polling-map-swatch{display:inline-block;width:1em;height:1em;vertical-align:-.15em;margin-right:.25em;border:1px solid #888}' +
      '.polling-map-tooltip{display:none;position:absolute;z-index:5;white-space:pre-line;padding:.55em .7em;max-width:230px;background:#171717 !important;color:#fff !important;border:1px solid #fff;font:14px/1.4 sans-serif;pointer-events:none}' +
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

  function updateMap() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    var polling = getPolling();
    var svg = drawer.querySelector('.polling-map-svg-wrap svg');
    if (!polling || !svg || !mapReady) return;

    var demEV = 0, repEV = 0;
    Object.keys(polling).forEach(function(c) {
      if (Number(polling[c].margin) >= 0) demEV += Number(polling[c].ev);
      else repEV += Number(polling[c].ev);
    });
    var score = drawer.querySelector('.polling-map-score');
    if (score) score.textContent = 'Projected Electoral Votes: Democrat ' + demEV + ' · Republican ' + repEV;

    var tip = drawer.querySelector('.polling-map-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'polling-map-tooltip';
      drawer.appendChild(tip);
    }

    states.forEach(function(pair) {
      var code = pair[0];
      var name = pair[1];
      var res = polling[code];
      var shape = findStateShape(svg, code, name);
      if (!res || !shape) return;

      var col = colorForMargin(Number(res.margin));
      shape.style.setProperty('fill', col, 'important');
      shape.setAttribute('fill', col);
      shape.querySelectorAll('path, circle, polygon').forEach(function(el) {
        el.style.setProperty('fill', col, 'important');
        el.setAttribute('fill', col);
      });

      shape.classList.add('polling-map-state');
      shape.onpointerenter = function(e) {
        tip.textContent = tooltipText(code, res);
        tip.classList.add('visible');
        var r = drawer.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 245) + 'px';
        tip.style.top = Math.min(e.clientY - r.top + 12, r.height - 145) + 'px';
      };
      shape.onpointermove = shape.onpointerenter;
      shape.onpointerleave = function() { tip.classList.remove('visible'); };
    });
  }

  function tryLoadSvg(urls, idx, wrap) {
    if (idx >= urls.length) {
      wrap.innerHTML = '<p style="padding:1em;color:#a51c30;">Failed to load U.S. SVG map.</p>';
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
        wrap.textContent = '';
        wrap.appendChild(svg);
        mapReady = true;
        updateMap();
      })
      .catch(function() { tryLoadSvg(urls, idx + 1, wrap); });
  }

  function init() {
    var drawer = document.getElementById('polling-map-drawer');
    if (!drawer) return;
    if (!drawer.querySelector('.polling-map-svg-wrap')) {
      addStyles();
      drawer.innerHTML =
        '<button type="button" class="polling-map-close" onclick="window.closePollingMaps();">Close ×</button>' +
        '<h2>U.S. Electoral Map</h2><div class="polling-map-content">' +
        '<p class="polling-map-score">Loading current state polling…</p>' +
        '<div class="polling-map-legend">' +
        '<span><i class="polling-map-swatch" style="background:#8b080d"></i>Republican 15+ points</span>' +
        '<span><i class="polling-map-swatch" style="background:#bf1d29"></i>Republican 5–15</span>' +
        '<span><i class="polling-map-swatch" style="background:#ff5865"></i>Republican 1–5</span>' +
        '<span><i class="polling-map-swatch" style="background:#ff8b98"></i>Republican under 1</span>' +
        '<span><i class="polling-map-swatch" style="background:#8aafff"></i>Democrat under 1</span>' +
        '<span><i class="polling-map-swatch" style="background:#577ccc"></i>Democrat 1–5</span>' +
        '<span><i class="polling-map-swatch" style="background:#1c408c"></i>Democrat 5–15</span>' +
        '<span><i class="polling-map-swatch" style="background:#052163"></i>Democrat 15+ points</span></div>' +
        '<div class="polling-map-svg-wrap"><p style="padding:1em;">Loading U.S. SVG map…</p></div>' +
        '<p style="font-size:.75em;margin:.4em 0 0;">Hover or focus a state for exact polling results.</p></div>';
      tryLoadSvg(svgUrls, 0, drawer.querySelector('.polling-map-svg-wrap'));
    }
    if (!renderTimer) renderTimer = window.setInterval(updateMap, 1500);
    new MutationObserver(function() {
      if (drawer.classList.contains('open')) updateMap();
    }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    window.renderPollingMap = updateMap;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
