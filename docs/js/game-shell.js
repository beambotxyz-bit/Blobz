$(function() {
	var socketHost = window.location.hostname || '127.0.0.1';
	var socketUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + socketHost + ':9999/ws1/';
	var FP = window.FingerprintJS ? FingerprintJS.load() : null;
	var launchStorageKey = 'blobzLaunch';
	var storageKeys = {
		ident: 'blobzident',
		nick: 'blobznick',
		skin: 'blobzskin',
		economy: 'blobzEconomy'
	};
	var legacyKeys = {
		ident: 'agarv1ident',
		nick: 'agarv1nick',
		skin: 'agarv1skin'
	};
	var redirectScheduled = false;
	var launchPoll = null;
	var settingsSyncPoll = null;
	var urlParams = new URLSearchParams(window.location.search);
	var launchState = readLaunchState();
	var preserveLaunchOnUnload = false;
	var resultShown = false;
	var reopenLeaderboardAfterCancel = false;
	var defaultLobbySettings = {
		playSounds: true,
		soundsVolume: .45,
		playMusic: false,
		musicVolume: .28,
		jellyPhysics: false,
		splitMacro: true,
		feedMacro: true,
		showMass: false,
		hideGrid: false,
		hideChat: false,
		showSkins: true,
		joystickSide: 'left',
		keyBindings: {
			split: 'Space',
			eject: 'KeyW',
			maxSplit: 'KeyC',
			freeze: 'KeyQ',
			shield: 'KeyE',
			spike: 'KeyR',
			special: 'KeyT'
		}
	};
	var defaultEconomy = {
		gems: 0,
		cups: 0,
		level: 0,
		xp: 0,
		boosts: {
			shield: 0,
			spike: 0,
			freeze: 0
		}
	};

	function getStoredValue(key, legacyKey) {
		try {
			return localStorage.getItem(key) || localStorage.getItem(legacyKey) || '';
		} catch (e) {
			return '';
		}
	}

	function setStoredValue(key, value) {
		try {
			localStorage.setItem(key, value);
		} catch (e) {}
	}

	function sanitizeSkin(str) {
		return String(str || '').replace(/[^a-zA-Z0-9_\- ]/gim, '').trim();
	}

	function sanitizeNick(str) {
		return String(str || '').replace(/[<>|]/gim, '').trim();
	}

	function sanitizeWorldText(str, maxLength) {
		return String(str || '').replace(/[<>|]/gim, '').trim().slice(0, maxLength || 80);
	}

	function normalizeSpectateWsUrl(value) {
		if (!value) return '';
		try {
			var parsed = new URL(String(value));
			if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return '';
			return parsed.toString();
		} catch (e) {
			return '';
		}
	}

	function buildQueryWorld() {
		var wsUrl = normalizeSpectateWsUrl(urlParams.get('wsUrl') || urlParams.get('worldWsUrl') || '');
		if (!wsUrl) return null;
		return {
			id: sanitizeWorldText(urlParams.get('worldId') || '', 80),
			slug: sanitizeWorldText(urlParams.get('worldSlug') || '', 64),
			name: sanitizeWorldText(urlParams.get('worldName') || '', 80),
			region: sanitizeWorldText(urlParams.get('region') || '', 24),
			wsUrl: wsUrl
		};
	}

	function parseToggle(value, fallback) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') {
			if (value === 'true') return true;
			if (value === 'false') return false;
		}
		return fallback;
	}

	function clampVolume(value, fallback) {
		var parsed = parseFloat(value);
		if (isNaN(parsed)) parsed = fallback;
		if (isNaN(parsed)) parsed = 0;
		if (parsed < 0) return 0;
		if (parsed > 1) return 1;
		return parsed;
	}

	function normalizeKeyBindings(bindings) {
		var normalized = {};
		bindings = bindings || {};
		Object.keys(defaultLobbySettings.keyBindings).forEach(function(action) {
			normalized[action] = typeof bindings[action] === 'string' && bindings[action] ? bindings[action] : defaultLobbySettings.keyBindings[action];
		});
		return normalized;
	}

	function normalizeJoystickSide(value) {
		return value === 'right' ? 'right' : 'left';
	}

	function normalizeEconomy(value) {
		var economy = value || {};
		var boosts = economy.boosts || {};
		var gems = Number(economy.gems);
		var cups = Number(economy.cups);
		var level = Number(economy.level);
		var xp = Number(economy.xp);
		return {
			gems: Math.max(0, Math.floor(isNaN(gems) ? defaultEconomy.gems : gems)),
			cups: Math.max(0, Math.floor(isNaN(cups) ? defaultEconomy.cups : cups)),
			level: Math.max(0, Math.min(50, Math.floor(isNaN(level) ? defaultEconomy.level : level))),
			xp: Math.max(0, Math.floor(isNaN(xp) ? defaultEconomy.xp : xp)),
			boosts: {
				shield: Math.max(0, Math.floor(Number(boosts.shield) || 0)),
				spike: Math.max(0, Math.floor(Number(boosts.spike) || 0)),
				freeze: Math.max(0, Math.floor(Number(boosts.freeze) || 0))
			}
		};
	}

	function readEconomy() {
		try {
			return normalizeEconomy(JSON.parse(localStorage.getItem(storageKeys.economy) || 'null'));
		} catch (e) {
			return normalizeEconomy(null);
		}
	}

	function writeEconomy(economy) {
		try {
			localStorage.setItem(storageKeys.economy, JSON.stringify(normalizeEconomy(economy)));
		} catch (e) {}
	}

	function xpForLevel(level) {
		level = Math.max(0, Math.min(49, Math.floor(Number(level) || 0)));
		return 700 + level * 120;
	}

	function addXp(economy, amount) {
		var next;
		economy = normalizeEconomy(economy);
		economy.xp += Math.max(0, Math.floor(Number(amount) || 0));
		while (economy.level < 50) {
			next = xpForLevel(economy.level);
			if (economy.xp < next) break;
			economy.xp -= next;
			economy.level++;
		}
		if (economy.level >= 50) {
			economy.level = 50;
			economy.xp = 0;
		}
		return economy;
	}

	function readStoredSettings() {
		var rawSettings;
		var parsed = {};
		try {
			rawSettings = localStorage.settings;
			if (rawSettings) parsed = JSON.parse(rawSettings) || {};
		} catch (e) {
			parsed = {};
		}

		return {
			playSounds: parseToggle(parsed.playSounds, defaultLobbySettings.playSounds),
			soundsVolume: clampVolume(parsed.soundsVolume, defaultLobbySettings.soundsVolume),
			playMusic: parseToggle(parsed.playMusic, defaultLobbySettings.playMusic),
			musicVolume: clampVolume(parsed.musicVolume, defaultLobbySettings.musicVolume),
			jellyPhysics: parseToggle(parsed.jellyPhysics, defaultLobbySettings.jellyPhysics),
			splitMacro: parseToggle(parsed.splitMacro, defaultLobbySettings.splitMacro),
			feedMacro: parseToggle(parsed.feedMacro, defaultLobbySettings.feedMacro),
			showMass: parseToggle(parsed.showMass, defaultLobbySettings.showMass),
			hideGrid: parseToggle(parsed.hideGrid, defaultLobbySettings.hideGrid),
			hideChat: parseToggle(parsed.hideChat, defaultLobbySettings.hideChat),
			showSkins: parseToggle(parsed.showSkins, defaultLobbySettings.showSkins),
			joystickSide: normalizeJoystickSide(parsed.joystickSide),
			keyBindings: normalizeKeyBindings(parsed.keyBindings)
		};
	}

	function applyStoredLobbySettings() {
		var settings = readStoredSettings();
		if (typeof window.setPlaySounds === 'function') window.setPlaySounds(settings.playSounds);
		if (typeof window.setSoundsVolume === 'function') window.setSoundsVolume(settings.soundsVolume);
		if (typeof window.setPlayMusic === 'function') window.setPlayMusic(settings.playMusic);
		if (typeof window.setMusicVolume === 'function') window.setMusicVolume(settings.musicVolume);
		if (typeof window.setJellyPhysics === 'function') window.setJellyPhysics(settings.jellyPhysics);
		if (typeof window.setSplitMacro === 'function') window.setSplitMacro(settings.splitMacro);
		if (typeof window.setFeedMacro === 'function') window.setFeedMacro(settings.feedMacro);
		if (typeof window.setShowMass === 'function') window.setShowMass(settings.showMass);
		if (typeof window.setHideGrid === 'function') window.setHideGrid(settings.hideGrid);
		if (typeof window.setHideChat === 'function') window.setHideChat(settings.hideChat);
		if (typeof window.setSkins === 'function') window.setSkins(settings.showSkins);
		if (typeof window.setJoystickSide === 'function') window.setJoystickSide(settings.joystickSide);
		if (typeof window.setKeyBindings === 'function') window.setKeyBindings(settings.keyBindings);
	}

	function stopSettingsSync() {
		if (!settingsSyncPoll) return;
		clearInterval(settingsSyncPoll);
		settingsSyncPoll = null;
	}

	function getWorldSocketUrl() {
		if (launchState && launchState.world && launchState.world.wsUrl) {
			return String(launchState.world.wsUrl);
		}
		return socketUrl;
	}

	function appendQueryParam(url, key, value) {
		var separator = url.indexOf('?') === -1 ? '?' : '&';
		return url + separator + encodeURIComponent(key) + '=' + encodeURIComponent(value);
	}

	function getSocketUrl() {
		var worldSocketUrl = getWorldSocketUrl();
		if (!launchState || !launchState.online || !window.blobzApi || typeof window.blobzApi.getToken !== 'function') {
			return worldSocketUrl;
		}
		var token = window.blobzApi.getToken();
		if (!token) return worldSocketUrl;
		return appendQueryParam(worldSocketUrl, 'session', token);
	}

	function scheduleStoredSettingsSync() {
		var attempts = 0;
		stopSettingsSync();
		applyStoredLobbySettings();
		settingsSyncPoll = setInterval(function() {
			attempts++;
			applyStoredLobbySettings();
			if (attempts >= 18) {
				stopSettingsSync();
			}
		}, 180);
	}

	function readLaunchState() {
		var stored = null;
		var payload = null;
		var hasSpectateQuery = urlParams.get('spectate') === '1';
		var queryMode = hasSpectateQuery ? 'spectate' : 'play';
		var queryNick = sanitizeNick(urlParams.get('nick') || '');
		var querySkin = sanitizeSkin(urlParams.get('skin') || '');
		var queryWorld = buildQueryWorld();

		if (!hasSpectateQuery) {
			try {
				stored = sessionStorage.getItem(launchStorageKey);
			} catch (e) {}
		}

		if (stored) {
			try {
				payload = JSON.parse(stored);
			} catch (e) {
				payload = null;
			}
		}

		if (payload && payload.mode === 'play' && !payload.nick) payload = null;

		if (!payload && (queryNick || urlParams.get('spectate') === '1')) {
			payload = {
				mode: queryMode,
				nick: queryNick,
				skin: querySkin,
				world: queryWorld
			};
		}

		if (!payload || !payload.mode) return null;

		payload.mode = payload.mode === 'spectate' ? 'spectate' : 'play';
		payload.nick = sanitizeNick(payload.nick || '');
		payload.skin = sanitizeSkin(payload.skin || '');
		payload.online = !!payload.online;
		payload.playerId = payload.playerId || null;
		payload.playerSkinId = payload.playerSkinId || null;
		payload.world = queryWorld || (payload.world && typeof payload.world === 'object' ? payload.world : null);
		if (payload.mode === 'play' && !payload.nick) {
			payload.nick = sanitizeNick(getStoredValue(storageKeys.nick, legacyKeys.nick));
		}
		return payload;
	}

	function showConnectingMessage(html) {
		var panel = document.getElementById('connecting-panel');
		if (panel && html) panel.innerHTML = html;
		$('#connecting').show();
	}

	function stopLaunchPolling() {
		if (!launchPoll) return;
		clearInterval(launchPoll);
		launchPoll = null;
	}

	function clearLaunchState() {
		try {
			sessionStorage.removeItem(launchStorageKey);
		} catch (e) {}
	}

	function formatNumber(value) {
		var number = Math.max(0, Math.floor(Number(value) || 0));
		return number.toLocaleString ? number.toLocaleString('en-US') : String(number);
	}

	function formatTime(ms) {
		var seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
		var minutes = Math.floor(seconds / 60);
		var rest = seconds % 60;
		if (minutes <= 0) return rest + 's';
		return minutes + ':' + (rest < 10 ? '0' : '') + rest;
	}

	function formatCompact(value) {
		value = Math.max(0, Math.floor(Number(value) || 0));
		if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
		if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
		return String(value);
	}

	function skinUrl(name) {
		return '/skins/' + encodeURIComponent(sanitizeSkin(name) || 'Base') + '.png';
	}

	function buildRunRewards(stats) {
		var bestMass = Math.max(0, Math.floor(Number(stats.bestMass || stats.mass) || 0));
		var kills = Math.max(0, Math.floor(Number(stats.kills) || 0));
		var minutes = Math.max(0, Math.floor((Number(stats.aliveForMs) || 0) / 60000));
		return {
			xp: Math.max(12, Math.floor(bestMass / 16) + kills * 35 + minutes * 10),
			gems: Math.max(1, Math.floor(bestMass / 260) + kills * 2 + Math.floor(minutes / 2)),
			cups: Math.max(0, Math.floor(bestMass / 130) + kills * 4)
		};
	}

	function hasBackendSession() {
		return !!(launchState && launchState.online && window.blobzApi && typeof window.blobzApi.hasSession === 'function' && window.blobzApi.hasSession());
	}

	function buildProgressPayload(economy, rewards, pendingSync) {
		return {
			rewards: rewards,
			economy: economy,
			pendingSync: !!pendingSync,
			nextXp: xpForLevel(economy.level),
			xpPercent: economy.level >= 50 ? 100 : Math.max(0, Math.min(100, Math.round(economy.xp / xpForLevel(economy.level) * 100)))
		};
	}

	function queuePendingMatch(stats, rewards) {
		try {
			localStorage.setItem('blobzPendingMatch', JSON.stringify({
				playerId: launchState.playerId,
				playerSkinId: launchState.playerSkinId,
				worldId: launchState.world && launchState.world.id ? launchState.world.id : null,
				worldSlug: launchState.world && launchState.world.slug ? launchState.world.slug : null,
				stats: {
					survivalSeconds: Math.max(0, Math.floor((Number(stats.aliveForMs) || 0) / 1000)),
					kills: Math.max(0, Math.floor(Number(stats.kills) || 0)),
					maxMass: Math.max(0, Math.floor(Number(stats.bestMass || stats.mass) || 0)),
					finalMass: Math.max(0, Math.floor(Number(stats.mass) || 0))
				},
				estimatedRewards: rewards,
				createdAt: Date.now()
			}));
		} catch (e) {}
	}

	function applyRunRewards(stats) {
		var rewards = buildRunRewards(stats);
		var economy = readEconomy();
		if (hasBackendSession()) {
			queuePendingMatch(stats, rewards);
			return buildProgressPayload(economy, rewards, true);
		}
		economy.gems += rewards.gems;
		economy.cups += rewards.cups;
		economy = addXp(economy, rewards.xp);
		writeEconomy(economy);
		return buildProgressPayload(economy, rewards, false);
	}

	function getPlayerStats() {
		if (window.blobzGame && typeof window.blobzGame.getPlayerStats === 'function') {
			return window.blobzGame.getPlayerStats() || {};
		}
		return {};
	}

	function stopGameConnection() {
		if (window.blobzGame && typeof window.blobzGame.disconnect === 'function') {
			window.blobzGame.disconnect();
		}
	}

	function setFlowOverlay(html, mode) {
		var overlay = document.getElementById('game-flow-overlay');
		var card = document.getElementById('game-flow-card');
		if (!overlay || !card) return false;
		card.innerHTML = html;
		overlay.classList.add('is-open');
		overlay.setAttribute('aria-hidden', 'false');
		overlay.setAttribute('data-flow-mode', mode || '');
		return true;
	}

	function closeFlowOverlay() {
		var overlay = document.getElementById('game-flow-overlay');
		var card = document.getElementById('game-flow-card');
		if (!overlay || !card) return;
		overlay.classList.remove('is-open');
		overlay.setAttribute('aria-hidden', 'true');
		overlay.removeAttribute('data-flow-mode');
		card.innerHTML = '';
	}

	function isFlowOverlayOpen() {
		var overlay = document.getElementById('game-flow-overlay');
		return !!(overlay && overlay.classList.contains('is-open'));
	}

	function hasPlayerCells() {
		return !!(window.blobzGame && typeof window.blobzGame.hasPlayerCells === 'function' && window.blobzGame.hasPlayerCells());
	}

	function leaveToLobby() {
		if (redirectScheduled) return;
		redirectScheduled = true;
		stopLaunchPolling();
		stopSettingsSync();
		clearLaunchState();
		stopGameConnection();
		window.location.href = '/';
	}

	function playAgain() {
		preserveLaunchOnUnload = true;
		try {
			sessionStorage.setItem(launchStorageKey, JSON.stringify({
				mode: launchState.mode,
				nick: launchState.nick,
				skin: launchState.skin,
				online: launchState.online,
				playerId: launchState.playerId,
				playerSkinId: launchState.playerSkinId,
				world: launchState.world || null,
				timestamp: Date.now()
			}));
		} catch (e) {}
		window.location.href = '/game.html?again=' + Date.now();
	}

	function bindFlowButtons() {
		var leave = document.getElementById('game-flow-leave');
		var cancel = document.getElementById('game-flow-cancel');
		var replay = document.getElementById('game-flow-replay');
		if (leave) leave.onclick = leaveToLobby;
		if (cancel) cancel.onclick = function() {
			closeFlowOverlay();
			if (reopenLeaderboardAfterCancel && window.blobzGame && typeof window.blobzGame.openLeaderboard === 'function') {
				window.blobzGame.openLeaderboard();
			}
			reopenLeaderboardAfterCancel = false;
		};
		if (replay) replay.onclick = playAgain;
	}

	function showLeaveConfirm() {
		if (resultShown) return;
		reopenLeaderboardAfterCancel = reopenLeaderboardAfterCancel ||
			!!window.blobzReopenLeaderboardAfterCancel ||
			!!(window.blobzGame && typeof window.blobzGame.isLeaderboardOpen === 'function' && window.blobzGame.isLeaderboardOpen());
		window.blobzReopenLeaderboardAfterCancel = false;
		if (!setFlowOverlay(
			'<div class="game-flow-kicker">Leave arena</div>' +
			'<h2>Exit Game?</h2>' +
			'<p>Your current run will end and you will return to the Blobz lobby.</p>' +
			'<div class="game-flow-actions">' +
				'<button id="game-flow-cancel" class="game-flow-btn" type="button">Cancel</button>' +
				'<button id="game-flow-leave" class="game-flow-btn danger" type="button">Yes, Exit</button>' +
			'</div>',
			'leave'
		)) {
			leaveToLobby();
			return;
		}
		bindFlowButtons();
	}

	function showResultScreen() {
		if (resultShown) return;
		resultShown = true;
		stopLaunchPolling();
		stopSettingsSync();
		clearLaunchState();
		$('#connecting').hide();
		$('#chat_textbox').hide();
		if (window.blobzGame && typeof window.blobzGame.closeLeaderboard === 'function') {
			window.blobzGame.closeLeaderboard();
		}
		var stats = getPlayerStats();
		var progress = applyRunRewards(stats);
		var rank = stats.rank ? '#' + stats.rank : '--';
		var skin = sanitizeSkin(launchState.skin) || 'Base';
		if (!setFlowOverlay(
			'<div class="game-flow-result-layout">' +
				'<div class="game-flow-result-profile">' +
					'<div class="game-flow-kicker">Run Complete</div>' +
					'<div class="game-flow-skin-ring"><img src="' + skinUrl(skin) + '" alt=""></div>' +
					'<h2>You Were Eaten</h2>' +
					'<div class="game-flow-level-line"><span>LVL ' + progress.economy.level + '</span><span>' + progress.economy.xp + ' / ' + progress.nextXp + ' XP</span></div>' +
					'<div class="game-flow-xp-bar"><div style="width:' + progress.xpPercent + '%;"></div></div>' +
				'</div>' +
				'<div class="game-flow-result-summary">' +
					'<div class="game-flow-result-title">Rewards</div>' +
					'<div class="game-flow-rewards">' +
						'<div><span>XP</span><strong>+' + formatCompact(progress.rewards.xp) + '</strong></div>' +
						'<div><span>Gems</span><strong>+' + formatCompact(progress.rewards.gems) + '</strong></div>' +
						'<div><span>Cups</span><strong>+' + formatCompact(progress.rewards.cups) + '</strong></div>' +
					'</div>' +
					(progress.pendingSync ? '<div style="font-size:0.7rem; color:rgba(255,255,255,0.52); text-align:center; margin:-0.35rem 0 0.8rem;">Estimated locally. Real rewards are finalized by the server.</div>' : '') +
					'<div class="game-flow-result-title">Stats</div>' +
					'<div class="game-flow-stats">' +
						'<div class="game-flow-stat"><span>Time</span><strong>' + formatTime(stats.aliveForMs) + '</strong></div>' +
						'<div class="game-flow-stat"><span>Kills</span><strong>' + formatNumber(stats.kills) + '</strong></div>' +
						'<div class="game-flow-stat"><span>Max Mass</span><strong>' + formatCompact(stats.bestMass) + '</strong></div>' +
						'<div class="game-flow-stat"><span>Rank</span><strong>' + rank + '</strong></div>' +
					'</div>' +
				'</div>' +
			'</div>' +
			'<div class="game-flow-actions">' +
				'<button id="game-flow-leave" class="game-flow-btn" type="button">Lobby</button>' +
				'<button id="game-flow-replay" class="game-flow-btn primary" type="button">Play Again</button>' +
			'</div>',
			'result'
		)) {
			leaveToLobby();
			return;
		}
		bindFlowButtons();
		stopGameConnection();
	}

	function beginLaunch(playerIdent) {
		var finalNick = null;

		if (launchState.mode === 'play') {
			finalNick = '<' + launchState.skin + '|' + (playerIdent || '') + '>' + launchState.nick;
		}

		$('#connecting').show();
		applyStoredLobbySettings();
		connect(getSocketUrl());
		scheduleStoredSettingsSync();

		if (launchState.mode === 'play' && finalNick) {
			window.setNick(finalNick);
		}

		stopLaunchPolling();
		launchPoll = setInterval(function() {
			if (!window.blobzGame || typeof window.blobzGame.getSocketState !== 'function') return;
			if (window.blobzGame.getSocketState() !== 1) return;
			stopLaunchPolling();
			if (launchState.mode === 'spectate') {
				window.spectate();
			}
		}, 120);
	}

	function loadBanListAndLaunch() {
		$.get('/fpBanList.txt').done(function(data) {
			var bannedIdent = String(data || '').split(',');
			var handleIdent = function(playerIdent) {
				var isBanned = false;
				for (var i = 0; i < bannedIdent.length; i++) {
					if (playerIdent && playerIdent === bannedIdent[i]) {
						isBanned = true;
						break;
					}
				}

				if (isBanned) {
					showConnectingMessage(
						'<h3 style="text-align:center">You are banned</h3><hr class="top" />' +
						'<p style="text-align:center">You are banned from Blobz because of repeated rule violations.</p>' +
						'<h1 style="text-align:center">Your unban code is<br /><br />' +
						btoa(playerIdent).replace(/(.{10})/g, "$1<br />") +
						'</h1>'
					);
					$('#chat_textbox').hide();
					return;
				}

				beginLaunch(playerIdent);
			};

			if (!FP) {
				handleIdent(getStoredValue(storageKeys.ident, legacyKeys.ident));
				return;
			}

			FP.then(function(fp) {
				return fp.get();
			}).then(function(result) {
				var ident = result && result.visitorId ? result.visitorId : getStoredValue(storageKeys.ident, legacyKeys.ident);
				setStoredValue(storageKeys.ident, ident);
				handleIdent(ident);
			}).catch(function() {
				handleIdent(getStoredValue(storageKeys.ident, legacyKeys.ident));
			});
		}).fail(function() {
			beginLaunch(getStoredValue(storageKeys.ident, legacyKeys.ident));
		});
	}

	if (!launchState || (launchState.mode === 'play' && !launchState.nick)) {
		window.location.href = '/';
		return;
	}

	applyStoredLobbySettings();

	if (launchState.mode === 'play') {
		setStoredValue(storageKeys.nick, launchState.nick);
		setStoredValue(storageKeys.skin, launchState.skin);
	}

	window.addEventListener('pagehide', function() {
		if (!preserveLaunchOnUnload) clearLaunchState();
	});

	window.addEventListener('keydown', function(e) {
		var isEscape = e.key === 'Escape' || e.keyCode === 27;
		if (!isEscape || launchState.mode !== 'play') return;
		if (isFlowOverlayOpen()) {
			var overlay = document.getElementById('game-flow-overlay');
			if (overlay && overlay.getAttribute('data-flow-mode') === 'leave') {
				closeFlowOverlay();
				reopenLeaderboardAfterCancel = false;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
		if (window.blobzGame && typeof window.blobzGame.isLeaderboardOpen === 'function' && window.blobzGame.isLeaderboardOpen()) {
			if (typeof window.blobzGame.closeLeaderboard === 'function') window.blobzGame.closeLeaderboard();
		} else if (hasPlayerCells()) {
			showLeaveConfirm();
		} else {
			var stats = getPlayerStats();
			if (stats.mass || stats.bestMass) showResultScreen(); else showLeaveConfirm();
		}
		e.preventDefault();
		e.stopImmediatePropagation();
	}, true);

	$('#lb-exit-btn').off('click').on('click', function(e) {
		e.preventDefault();
		e.stopPropagation();
		showLeaveConfirm();
		return false;
	});

	if (typeof window.showOverlays === 'function') {
		var originalShowOverlays = window.showOverlays;
		window.showOverlays = function(arg) {
			if (launchState.mode === 'play') {
				var hasCells = hasPlayerCells();
				if (!hasCells) {
					var stats = getPlayerStats();
					if (stats.mass || stats.bestMass || !arg) {
						showResultScreen();
					} else {
						showLeaveConfirm();
					}
					return;
				}
				if (arg) {
					showLeaveConfirm();
					return;
				}
			}
			return originalShowOverlays.apply(this, arguments);
		};
	}

	window.blobzShell = {
		showLeaveConfirm: showLeaveConfirm,
		showResultScreen: showResultScreen,
		leaveToLobby: leaveToLobby
	};

	loadBanListAndLaunch();
});
