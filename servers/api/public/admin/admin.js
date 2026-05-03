(function () {
  var tokenKey = 'blobzAdminToken';
  var tokenInput = document.getElementById('adminToken');
  var saveToken = document.getElementById('saveToken');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusPill = document.getElementById('statusPill');
  var createWorldForm = document.getElementById('createWorldForm');
  var testAssignBtn = document.getElementById('testAssignBtn');
  var playerSearch = document.getElementById('playerSearch');
  var emptyTemplate = document.getElementById('emptyRowTemplate');
  var searchTimer = null;
  var adminConfig = {
    clientPublicBase: window.location.protocol + '//' + window.location.hostname + ':8082'
  };

  function readToken() {
    try {
      return localStorage.getItem(tokenKey) || '';
    } catch (error) {
      return '';
    }
  }

  function writeToken(value) {
    try {
      localStorage.setItem(tokenKey, value || '');
    } catch (error) {}
  }

  function setStatus(text, mode) {
    statusPill.textContent = text;
    statusPill.className = 'status-pill ' + (mode || 'muted');
  }

  function formatNumber(value) {
    var number = Math.max(0, Math.floor(Number(value) || 0));
    return number.toLocaleString ? number.toLocaleString('en-US') : String(number);
  }

  function formatDate(value) {
    if (!value) return 'Never';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes ? minutes + 'm ' + rest + 's' : rest + 's';
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeBaseUrl(value) {
    var base = String(value || '').trim().replace(/\/+$/, '');
    return base || (window.location.protocol + '//' + window.location.hostname + ':8082');
  }

  function synthesizeWorldWsUrl(port, host) {
    var cleanPort = Number(port);
    if (!cleanPort) return '';
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + (host || window.location.hostname || '127.0.0.1') + ':' + cleanPort + '/ws1/';
  }

  function buildSpectateUrl(button) {
    var base = normalizeBaseUrl(adminConfig.clientPublicBase);
    var url;
    try {
      url = new URL('/game.html', base + '/');
    } catch (error) {
      url = new URL('/game.html', window.location.origin);
    }

    url.searchParams.set('spectate', '1');
    if (button.getAttribute('data-world-id')) url.searchParams.set('worldId', button.getAttribute('data-world-id'));
    if (button.getAttribute('data-world-slug')) url.searchParams.set('worldSlug', button.getAttribute('data-world-slug'));
    if (button.getAttribute('data-world-name')) url.searchParams.set('worldName', button.getAttribute('data-world-name'));
    if (button.getAttribute('data-world-region')) url.searchParams.set('region', button.getAttribute('data-world-region'));
    url.searchParams.set('wsUrl', button.getAttribute('data-ws-url') || synthesizeWorldWsUrl(
      button.getAttribute('data-port'),
      button.getAttribute('data-host')
    ));
    return url.toString();
  }

  function api(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers.Accept = 'application/json';
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (readToken()) headers['X-Admin-Token'] = readToken();

    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var payload = text ? JSON.parse(text) : {};
        if (!response.ok) {
          var message = payload && payload.error && payload.error.message
            ? payload.error.message
            : 'Request failed.';
          var error = new Error(message);
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    });
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function emptyRow(colspan) {
    var clone = emptyTemplate.content.firstElementChild.cloneNode(true);
    clone.firstElementChild.colSpan = colspan || 6;
    return clone;
  }

  function renderSummary(summary) {
    summary = summary || {};
    setText('metricPlayers', formatNumber(summary.players && summary.players.total));
    setText('metricWorlds', formatNumber(summary.worlds && summary.worlds.active));
    setText('metricOnline', formatNumber(summary.worlds && summary.worlds.currentPlayers));
    setText('metricMatches', formatNumber(summary.matchesToday && summary.matchesToday.total));
    setText('metricSupervisor', summary.supervisor && summary.supervisor.enabled
      ? formatNumber(summary.supervisor.childCount) + ' live'
      : 'Off');
    renderEvents(summary.events || []);
  }

  function renderEvents(events) {
    var list = document.getElementById('eventList');
    list.innerHTML = '';
    if (!events.length) {
      var empty = document.createElement('li');
      empty.innerHTML = '<span class="muted">No world events yet.</span>';
      list.appendChild(empty);
      return;
    }

    events.forEach(function (event) {
      var item = document.createElement('li');
      item.innerHTML = '' +
        '<strong>' + escapeHtml(event.worldName || event.worldSlug || 'World') + ' - ' + escapeHtml(event.type) + '</strong>' +
        '<span>' + escapeHtml(event.message || 'Event recorded.') + '</span>' +
        '<small>' + formatDate(event.createdAt) + '</small>';
      list.appendChild(item);
    });
  }

  function renderWorlds(worlds) {
    var body = document.getElementById('worldRows');
    body.innerHTML = '';
    if (!worlds.length) {
      body.appendChild(emptyRow(6));
      return;
    }

    worlds.forEach(function (world) {
      var percent = Math.max(0, Math.min(100, Number(world.capacityPercent) || 0));
      var barClass = percent >= 95 ? 'danger' : percent >= 70 ? 'warning' : '';
      var row = document.createElement('tr');
      var spectateButton = '<button class="spectate" type="button" data-action="spectate" ' +
        'data-world-id="' + escapeHtml(world.id || '') + '" ' +
        'data-world-slug="' + escapeHtml(world.slug || '') + '" ' +
        'data-world-name="' + escapeHtml(world.name || '') + '" ' +
        'data-world-region="' + escapeHtml(world.region || '') + '" ' +
        'data-host="' + escapeHtml(world.host || '') + '" ' +
        'data-port="' + escapeHtml(world.port || '') + '" ' +
        'data-ws-url="' + escapeHtml(world.wsUrl || '') + '">Spectate</button>';
      var actions = world.id
        ? spectateButton +
          '<button type="button" data-action="provisioning" data-id="' + escapeHtml(world.id) + '">Start</button>' +
          '<button type="button" data-action="active" data-id="' + escapeHtml(world.id) + '">Activate</button>' +
          '<button type="button" data-action="draining" data-id="' + escapeHtml(world.id) + '">Drain</button>' +
          '<button type="button" data-action="paused" data-id="' + escapeHtml(world.id) + '">Stop</button>' +
          '<button type="button" data-action="copy" data-slug="' + escapeHtml(world.slug) + '" data-port="' + escapeHtml(world.port || '') + '">Command</button>' +
          (world.slug === 'main' ? '' : '<button type="button" data-action="delete" data-id="' + escapeHtml(world.id) + '">Delete</button>')
        : spectateButton +
          '<button type="button" data-action="copy" data-slug="' + escapeHtml(world.slug) + '" data-port="' + escapeHtml(world.port || '') + '">Command</button>';
      row.innerHTML = '' +
        '<td><div class="world-name"><strong>' + escapeHtml(world.name) + '</strong><small>' + escapeHtml(world.slug) + ' / ' + escapeHtml(world.region) + '</small></div></td>' +
        '<td><span class="tag ' + escapeHtml(world.status) + '">' + escapeHtml(world.status) + '</span></td>' +
        '<td><div class="capacity"><span>' + formatNumber(world.currentPlayers) + ' / ' + formatNumber(world.hardCap) + ' players, ' + formatNumber(world.currentBots) + ' bots, ' + formatNumber(world.currentSpectators) + ' spectating</span><div class="bar ' + barClass + '"><i style="width:' + percent + '%"></i></div></div></td>' +
        '<td>' + escapeHtml(world.port || '-') + '<br><small class="muted">' + escapeHtml(world.wsUrl || 'No websocket URL') + '</small></td>' +
        '<td>' + escapeHtml(formatDate(world.lastHeartbeatAt)) + '<br><small class="muted">' + formatNumber(world.tickRate) + ' tick target</small></td>' +
        '<td><div class="actions">' + actions + '</div></td>';
      body.appendChild(row);
    });
  }

  function renderPlayers(players) {
    var body = document.getElementById('playerRows');
    body.innerHTML = '';
    if (!players.length) {
      body.appendChild(emptyRow(6));
      return;
    }

    players.forEach(function (player) {
      var skin = player.selectedSkin ? player.selectedSkin.name + ' #' + player.selectedSkin.serialNumber : 'Base';
      var row = document.createElement('tr');
      row.innerHTML = '' +
        '<td><div class="player-name"><strong>' + escapeHtml(player.displayName) + '</strong><small>' + escapeHtml(player.username ? '@' + player.username : player.id) + '</small></div></td>' +
        '<td>' + formatNumber(player.level) + '</td>' +
        '<td>' + formatNumber(player.xp) + '</td>' +
        '<td>' + formatNumber(player.gems) + '</td>' +
        '<td>' + formatNumber(player.cups) + '</td>' +
        '<td>' + escapeHtml(skin) + '</td>';
      body.appendChild(row);
    });
  }

  function renderMatches(matches) {
    var body = document.getElementById('matchRows');
    body.innerHTML = '';
    if (!matches.length) {
      body.appendChild(emptyRow(5));
      return;
    }

    matches.forEach(function (match) {
      var rewards = '+' + formatNumber(match.rewards.xp) + ' XP, +' +
        formatNumber(match.rewards.gems) + ' gems, +' +
        formatNumber(match.rewards.cups) + ' cups';
      var row = document.createElement('tr');
      row.innerHTML = '' +
        '<td><div class="player-name"><strong>' + escapeHtml(match.player.displayName) + '</strong><small>' + escapeHtml(match.exitReason || 'ended') + '</small></div></td>' +
        '<td>' + escapeHtml(match.world ? match.world.name : 'Unknown') + '</td>' +
        '<td>' + formatDuration(match.survivalSeconds) + '</td>' +
        '<td>' + formatNumber(match.kills) + '</td>' +
        '<td>' + escapeHtml(rewards) + '</td>';
      body.appendChild(row);
    });
  }

  function loadAll() {
    if (!readToken()) {
      renderSummary({});
      renderWorlds([]);
      renderPlayers([]);
      renderMatches([]);
      renderEvents([]);
      setStatus('Token needed', 'muted');
      return Promise.resolve();
    }

    setStatus('Loading', 'muted');
    return Promise.all([
      api('/admin/config'),
      api('/admin/summary'),
      api('/admin/worlds'),
      api('/admin/players?limit=60&search=' + encodeURIComponent(playerSearch.value || '')),
      api('/admin/matches?limit=40')
    ]).then(function (results) {
      adminConfig = results[0].config || adminConfig;
      renderSummary(results[1].summary);
      renderWorlds(results[2].worlds || []);
      renderPlayers(results[3].players || []);
      renderMatches(results[4].matches || []);
      setStatus('Connected', 'good');
    }).catch(function (error) {
      setStatus(error.status === 403 ? 'Bad token' : 'Offline', 'bad');
      console.error(error);
    });
  }

  function patchWorld(id, body) {
    return api('/admin/worlds/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: body
    }).then(loadAll);
  }

  function deleteWorld(id) {
    if (!window.confirm('Delete this world from active rotation?')) return Promise.resolve();
    return api('/admin/worlds/' + encodeURIComponent(id), {
      method: 'DELETE'
    }).then(loadAll);
  }

  function copyWorldCommand(slug, port) {
    var command = 'cd servers/agarv1/src && node index.js --noconsole --world=' + slug + ' --port=' + port;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(command).then(function () {
        setStatus('Command copied', 'good');
      }).catch(function () {
        window.prompt('Start command', command);
      });
    } else {
      window.prompt('Start command', command);
    }
  }

  function bindEvents() {
    tokenInput.value = readToken();

    saveToken.addEventListener('click', function () {
      writeToken(tokenInput.value.trim());
      loadAll();
    });

    refreshBtn.addEventListener('click', loadAll);

    createWorldForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(createWorldForm);
      var body = {
        name: data.get('name'),
        slug: data.get('slug'),
        port: data.get('port') ? Number(data.get('port')) : undefined,
        region: data.get('region') || 'eu',
        softCap: Number(data.get('softCap') || 70),
        hardCap: Number(data.get('hardCap') || 100),
        status: 'provisioning',
        metadata: { supervisorRequested: true }
      };
      api('/admin/worlds', {
        method: 'POST',
        body: body
      }).then(function () {
        createWorldForm.reset();
        createWorldForm.elements.region.value = 'eu';
        createWorldForm.elements.softCap.value = 70;
        createWorldForm.elements.hardCap.value = 100;
        return loadAll();
      }).catch(function (error) {
        setStatus(error.message, 'bad');
      });
    });

    document.getElementById('worldRows').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-action]');
      if (!button) return;
      var action = button.getAttribute('data-action');
      if (action === 'spectate') {
        window.open(buildSpectateUrl(button), '_blank', 'noopener');
        setStatus('Spectate opened', 'good');
        return;
      }
      if (action === 'copy') {
        copyWorldCommand(button.getAttribute('data-slug'), button.getAttribute('data-port'));
        return;
      }
      if (action === 'delete') {
        deleteWorld(button.getAttribute('data-id'));
        return;
      }
      patchWorld(button.getAttribute('data-id'), { status: action });
    });

    testAssignBtn.addEventListener('click', function () {
      api('/worlds/assign', {
        method: 'POST',
        body: { mode: 'classic', region: 'eu' }
      }).then(function (payload) {
        setStatus('Assigned ' + (payload.world && payload.world.slug ? payload.world.slug : 'world'), 'good');
        return loadAll();
      }).catch(function (error) {
        setStatus(error.message, 'bad');
      });
    });

    playerSearch.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadAll, 250);
    });
  }

  bindEvents();
  loadAll();
  setInterval(loadAll, 15000);
})();
