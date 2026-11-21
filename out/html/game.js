(function() {
  var game;
  var ui;

  var DateOptions = {hour: 'numeric', minute: 'numeric', second: 'numeric', year: 'numeric', month: 'short', day: 'numeric' };

  var main = function(dendryUI) { ui = dendryUI; game = ui.game; };
  var TITLE = "Social Democracy: An Alternate History" + '_' + "Autumn Chen";
  window.loadMod = function(url) { ui.loadGame(url); };

  window.loadGerman = function() {
      ui.loadGame('game-de.json');
      dendryUI.language = "de";
      localStorage[game.title + '_language'] = "de";
      var text_label_map_ids = {'main_tab':"Haupt",'politics_tab':"Politik",'paramilitary_tab':"Militär",'poll_tab':"Wahl",'stats-link':"Bibliothek",'save-link':"Speichern/Laden",'options-link':"Einstellungen","currently_playing_text":"Momentan spielt:","music_header_text":"Musik","next_song_text":"Nächstes Lied","settings_text":"Einstellung","backgrounds_text":"Hintergründe:","event_images_text":"Ereignisbilder:","animations_text":"Animationen:","music_text":"Musik:","color_scheme_text":"Farbschema:","light_mode_label":"Hell","dark_mode_label":"Dunkel","font_size_text":"Schriftgröße:","decrease_font_button":"- verkleinern","increase_font_button":"+ vergrößern","import_save_label":"Importiere Speicherstand:"};
      var text_label_map_classes = {"delete_button":"Löschen","export_button":"Exportieren","load_button":"Laden","label_on":"An","label_off":"Aus","close_button":"Schließen"};
      for (var elementId in text_label_map_ids) document.getElementById(elementId).textContent = text_label_map_ids[elementId];
      for (var className in text_label_map_classes) for (var element of document.getElementsByClassName(className)) element.textContent = text_label_map_classes[className];
  };
  window.toggleNews = function toggleNews() {
      const elements = document.querySelectorAll('.dnvp'), elements2 = document.querySelectorAll('.other');
      const button = document.getElementById('news_tab');
      if (!button) { console.error('Button with id "news_tab" not found.'); return; }
      elements.forEach(function(element) { if (element.style.display !== 'block') { element.style.display = 'block'; button.innerHTML = "View Other News"; } else { element.style.display = 'none'; button.innerHTML = "View Right-Wing News"; } });
      elements2.forEach(function(element) { element.style.display = element.style.display !== 'none' ? 'none' : 'block'; });
      button.style.backgroundColor = '#dddddd';
      
  };
  window.loadEnglish = function() {
      ui.loadGame('game.json'); dendryUI.language = "en"; localStorage[game.title + '_language'] = "en";
      var text_label_map_ids = {'main_tab':"Main",'politics_tab':"Politics",'paramilitary_tab':"Wins",'poll_tab':"Polls",'stats-link':"Library",'save-link':"Save/Load",'options-link':"Options","currently_playing_text":"Currently playing:","music_header_text":"Music","next_song_text":"Next song","settings_text":"Settings","backgrounds_text":"Backgrounds:","event_images_text":"Event images:","animations_text":"Animations:","music_text":"Music:","color_scheme_text":"Color scheme:","light_mode_label":"Light mode","dark_mode_label":"Dark mode","font_size_text":"Font size:","decrease_font_button":"- decrease","increase_font_button":"+ increase","import_save_label":"Import save file:"};
      var text_label_map_classes = {"delete_button":"Delete","export_button":"Export","load_button":"Load","label_on":"On","label_off":"Off","close_button":"Close"};
      for (var elementId in text_label_map_ids) document.getElementById(elementId).textContent = text_label_map_ids[elementId];
      for (var className in text_label_map_classes) for (var element of document.getElementsByClassName(className)) element.textContent = text_label_map_classes[className];
  };
  window.updateSaveButtons = function() {
      if (window.dendryUI.language && window.dendryUI.language == "de") {
          for (var element of document.getElementsByClassName("save_button")) { if (element.textContent == "Save") element.textContent = "Speichern"; else if (element.textContent == "Load") element.textContent = "Laden"; }
      } else {
          for (var element of document.getElementsByClassName("save_button")) { if (element.textContent == "Speichern") element.textContent = "Save"; else if (element.textContent == "Laden") element.textContent = "Load"; }
      }
  };
  window.onSave = function() { window.updateSaveButtons(); };
  window.onPopulateSaveSlots = function() { window.updateSaveButtons(); };
  window.showStats = function() { if (window.dendryUI.dendryEngine.state.sceneId.startsWith('library')) window.dendryUI.dendryEngine.goToScene('backSpecialScene'); else window.dendryUI.dendryEngine.goToScene('library'); };
  window.showMods = function() { window.hideOptions(); if (window.dendryUI.dendryEngine.state.sceneId.startsWith('mod_loader')) window.dendryUI.dendryEngine.goToScene('backSpecialScene'); else window.dendryUI.dendryEngine.goToScene('mod_loader'); };
  window.updateAudio = function(song) { var now_playing = document.getElementById('currently_playing'); var s = song || window.dendryUI.currentAudioURL; var a = s.split('/'); now_playing.textContent = a[a.length-1]; };
  window.setVolume = function(volume) { if (window.dendryUI.currentAudio) { window.dendryUI.volume = volume/100; window.dendryUI.currentAudio.volume = volume/100; } };
  window.shuffle = function() { if (window.dendryUI.currentAudio) window.dendryUI.currentAudio.currentTime = 9999; };
  window.togglePausePlay = function() {
      if (!window.dendryUI.currentAudio) return;
      if (window.dendryUI.currentAudio.paused) { window.dendryUI.currentAudio.play(); document.getElementById('pause-button-image').style.display = "inline"; document.getElementById('play-button-image').style.display = "none"; document.getElementById('pause-button-text').textContent = "Pause"; }
      else { window.dendryUI.currentAudio.pause(); document.getElementById('play-button-image').style.display = "inline"; document.getElementById('pause-button-image').style.display = "none"; document.getElementById('pause-button-text').textContent = "Play"; }
  };
  window.showOptions = function() { var save_element = document.getElementById('options'); window.populateOptions(); save_element.style.display = "block"; if (!save_element.onclick) save_element.onclick = function(evt) { if (evt.target == save_element) window.hideOptions(); }; };
  window.hideOptions = function() { document.getElementById('options').style.display = "none"; };
  window.disableBg = function() { window.dendryUI.disable_bg = true; document.body.style.backgroundImage = 'none'; window.dendryUI.saveSettings(); };
  window.enableBg = function() { window.dendryUI.disable_bg = false; window.dendryUI.setBg(window.dendryUI.dendryEngine.state.bg); window.dendryUI.saveSettings(); };
  window.disableAnimate = function() { window.dendryUI.animate = false; window.dendryUI.saveSettings(); };
  window.enableAnimate = function() { window.dendryUI.animate = true; window.dendryUI.saveSettings(); };
  window.disableAnimateBg = function() { window.dendryUI.animate_bg = false; window.dendryUI.saveSettings(); };
  window.enableAnimateBg = function() { window.dendryUI.animate_bg = true; window.dendryUI.saveSettings(); };
  window.disableAudio = function() { window.dendryUI.toggle_audio(false); window.dendryUI.saveSettings(); };
  window.enableAudio = function() { window.dendryUI.toggle_audio(true); window.dendryUI.saveSettings(); };
  window.enableImages = function() { window.dendryUI.show_portraits = true; window.dendryUI.saveSettings(); };
  window.disableImages = function() { window.dendryUI.show_portraits = false; window.dendryUI.saveSettings(); };
  window.enableLightMode = function() { window.dendryUI.dark_mode = false; document.body.classList.remove('dark-mode'); window.dendryUI.saveSettings(); };
  window.enableDarkMode = function() { window.dendryUI.dark_mode = true; document.body.classList.add('dark-mode'); window.dendryUI.saveSettings(); };
  window.populateOptions = function() {
    var disable_bg = window.dendryUI.disable_bg, animate = window.dendryUI.animate, disable_audio = window.dendryUI.disable_audio, show_portraits = window.dendryUI.show_portraits;
    $('#backgrounds_no')[0].checked = disable_bg; $('#backgrounds_yes')[0].checked = !disable_bg;
    $('#animate_yes')[0].checked = animate; $('#animate_no')[0].checked = !animate;
    $('#audio_no')[0].checked = disable_audio; $('#audio_yes')[0].checked = !disable_audio;
    $('#images_yes')[0].checked = show_portraits; $('#images_no')[0].checked = !show_portraits;
    $('#dark_mode')[0].checked = window.dendryUI.dark_mode; $('#light_mode')[0].checked = !window.dendryUI.dark_mode;
    if (window.dendryUI.language) { $('#german')[0].checked = window.dendryUI.language == "de"; $('#english')[0].checked = window.dendryUI.language != "de"; } else $('#english')[0].checked = true;
  };
  window.displayText = function(text) { return text; };
  window.handleSignal = function(signal, event, scene_id) {};
  window.onNewPage = function() { var scene = window.dendryUI.dendryEngine.state.sceneId; if (scene != 'root' && !window.justLoaded) window.dendryUI.autosave(); if (window.justLoaded) window.justLoaded = false; };
  window.updateSidebar = function() { $('#qualities').empty(); var scene = dendryUI.game.scenes[window.statusTab]; dendryUI.dendryEngine._runActions(scene.onArrival); var displayContent = dendryUI.dendryEngine._makeDisplayContent(scene.content, true); $('#qualities').append(dendryUI.contentToHTML.convert(displayContent)); };
  window.changeTab = function(newTab, tabId) {
      if (tabId == 'poll_tab' && dendryUI.dendryEngine.state.qualities.historical_mode) { window.alert('Polls are not available in historical mode.'); return; }
      var tabButton = document.getElementById(tabId), tabButtons = document.getElementsByClassName('tab_button');
      for (i = 0; i < tabButtons.length; i++) tabButtons[i].className = tabButtons[i].className.replace(' active', '');
      tabButton.className += ' active'; window.statusTab = newTab; window.updateSidebar();
  };

  window.openPollingMaps = function() {
      var drawer = document.getElementById('polling-map-drawer'), button = document.getElementById('polling-map-toggle');
      if (!drawer || !button) return;
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); button.textContent = 'Close polling maps';
  };
  window.closePollingMaps = function() {
      var drawer = document.getElementById('polling-map-drawer'), button = document.getElementById('polling-map-toggle');
      if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
      if (button) button.textContent = 'Open polling maps';
  };
  window.togglePollingMaps = function() {
      var drawer = document.getElementById('polling-map-drawer');
      if (drawer && drawer.classList.contains('open')) window.closePollingMaps(); else window.openPollingMaps();
  };
  window.onDisplayContent = function() {
      window.updateSidebar();
      var content = document.getElementById('content');
      if (!content) return;
      var sceneId = window.dendryUI.dendryEngine.state.sceneId;
      // Only show the map control on the two active turn/gameplay scenes.
      // Menus, advisor pages, events, election simulation, and other special scenes stay clear.
      var isGameplayScene = sceneId === 'main' || sceneId === 'main.main_easy';
      var button = document.getElementById('polling-map-toggle');
      var drawer = document.getElementById('polling-map-drawer');
      if (!isGameplayScene) {
          if (button && button.parentNode) button.parentNode.removeChild(button);
          window.closePollingMaps();
          if (drawer) drawer.setAttribute('aria-hidden', 'true');
          return;
      }
      if (!button) {
          button = document.createElement('button'); button.id = 'polling-map-toggle'; button.type = 'button'; button.className = 'polling-map-trigger';
          button.textContent = 'Open polling maps'; button.onclick = window.togglePollingMaps; content.appendChild(button);
      }
      if (drawer && drawer.classList.contains('open')) { button.textContent = 'Close polling maps'; drawer.setAttribute('aria-hidden', 'false'); }
      else { button.textContent = 'Open polling maps'; if (drawer) drawer.setAttribute('aria-hidden', 'true'); }
  };

  window.generateBar = function(quality, qualityName, max, min, colors) {
      var bar = document.createElement('div'), value = document.createElement('div'); bar.className = 'bar'; value.className = 'barValue';
      var width = (quality - min)/(max - min); if (width > 1) width = 1; else if (width < 0) width = 0;
      value.style.width = Math.round(width*100) + '%'; if (colors) value.style.backgroundColor = window.probToColor(width*100);
      bar.textContent = qualityName + ': ' + quality; if (colors) bar.textContent += '/' + max; bar.appendChild(value); return bar;
  };
  window.justLoaded = true; window.statusTab = "status"; window.dendryModifyUI = main;
  console.log("Modifying stats: see dendryUI.dendryEngine.state.qualities");
  window.increaseFontSize = function() { window.dendryUI.font_size += 0.1; var fs = window.dendryUI.font_size, sidebar_fs = fs - 0.1; document.getElementById("content").setAttribute("style", "font-size: " + fs + "em;"); document.getElementById("stats_sidebar").setAttribute("style", "font-size: " + sidebar_fs + "em;"); document.getElementById('font_size_value').textContent = window.dendryUI.font_size.toFixed(1) + "em"; window.dendryUI.saveSettings(); };
  window.decreaseFontSize = function() { window.dendryUI.font_size -= 0.1; var fs = window.dendryUI.font_size, sidebar_fs = fs - 0.1; document.getElementById("content").setAttribute("style", "font-size: " + fs + "em;"); document.getElementById("stats_sidebar").setAttribute("style", "font-size: " + sidebar_fs + "em;"); document.getElementById('font_size_value').textContent = window.dendryUI.font_size.toFixed(1) + "em"; window.dendryUI.saveSettings(); };
  window.onload = function() {
    window.dendryUI.loadSettings({show_portraits: false});
    if (localStorage[game.title + '_language'] && localStorage[game.title + '_language'] == "de") window.loadGerman();
    if (window.dendryUI.dark_mode) document.body.classList.add('dark-mode');
    if (window.dendryUI.font_size != 1.1) { var fs = window.dendryUI.font_size, sidebar_fs = fs - 0.1; document.getElementById("content").setAttribute("style", "font-size: " + fs + "em;"); document.getElementById("stats_sidebar").setAttribute("style", "font-size: " + sidebar_fs + "em;"); }
    document.getElementById('font_size_value').textContent = window.dendryUI.font_size.toFixed(1) + "em";
    window.pinnedCardsDescription = "Advisor cards - actions are only usable once per 6 months.";
  };
}());
