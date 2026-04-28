$(function() {
	var socketHost = window.location.hostname || '127.0.0.1';
	var socketUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + socketHost + ':9999/ws1/';
	var FP = window.FingerprintJS ? FingerprintJS.load() : null;
	var launchStorageKey = 'blobzLaunch';
	var storageKeys = {
		ident: 'blobzident',
		nick: 'blobznick',
		skin: 'blobzskin'
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
	var defaultLobbySettings = {
		playSounds: true,
		soundsVolume: .45,
		playMusic: false,
		musicVolume: .28,
		jellyPhysics: true,
		splitMacro: true,
		feedMacro: true,
		showMass: false,
		hideGrid: false,
		hideChat: false,
		showSkins: true
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
			showSkins: parseToggle(parsed.showSkins, defaultLobbySettings.showSkins)
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
	}

	function stopSettingsSync() {
		if (!settingsSyncPoll) return;
		clearInterval(settingsSyncPoll);
		settingsSyncPoll = null;
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
		var queryMode = urlParams.get('spectate') === '1' ? 'spectate' : 'play';
		var queryNick = sanitizeNick(urlParams.get('nick') || '');
		var querySkin = sanitizeSkin(urlParams.get('skin') || '');

		try {
			stored = sessionStorage.getItem(launchStorageKey);
		} catch (e) {}

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
				skin: querySkin
			};
		}

		if (!payload || !payload.mode) return null;

		payload.mode = payload.mode === 'spectate' ? 'spectate' : 'play';
		payload.nick = sanitizeNick(payload.nick || '');
		payload.skin = sanitizeSkin(payload.skin || '');
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

	function leaveToLobby() {
		if (redirectScheduled) return;
		redirectScheduled = true;
		stopLaunchPolling();
		stopSettingsSync();
		try {
			sessionStorage.removeItem(launchStorageKey);
		} catch (e) {}
		if (window.blobzGame && typeof window.blobzGame.disconnect === 'function') {
			window.blobzGame.disconnect();
		}
		window.location.href = '/';
	}

	function beginLaunch(playerIdent) {
		var finalNick = null;

		if (launchState.mode === 'play') {
			finalNick = '<' + launchState.skin + '|' + (playerIdent || '') + '>' + launchState.nick;
		}

		$('#connecting').show();
		applyStoredLobbySettings();
		connect(socketUrl);
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

	$('#lb-exit-btn').off('click').on('click', function(e) {
		e.preventDefault();
		e.stopPropagation();
		leaveToLobby();
		return false;
	});

	if (typeof window.showOverlays === 'function') {
		var originalShowOverlays = window.showOverlays;
		window.showOverlays = function(arg) {
			if (!arg && launchState.mode === 'play' && window.blobzGame && typeof window.blobzGame.hasPlayerCells === 'function' && !window.blobzGame.hasPlayerCells()) {
				leaveToLobby();
				return;
			}
			return originalShowOverlays.apply(this, arguments);
		};
	}

	loadBanListAndLaunch();
});
