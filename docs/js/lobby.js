$(function() {
	var externallyFramed;
	var knownSkins = [];
	var knownSkinsSet = {};
	var $nick = $('#lobby-nick');
	var $skin = $('#lobby-skin');
	var storageKeys = {
		ident: 'blobzident',
		nick: 'blobznick',
		skin: 'blobzskin'
	};
	var legacyKeys = {
		nick: 'agarv1nick',
		skin: 'agarv1skin'
	};
	var launchStorageKey = 'blobzLaunch';

	try {
		externallyFramed = window.top.location.host !== window.location.host;
	} catch (e) {
		externallyFramed = true;
	}

	if (externallyFramed) {
		try {
			window.top.location = window.location;
		} catch (e) {}
	}

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

	function clearStoredSkin() {
		try {
			localStorage.setItem(storageKeys.skin, '');
			localStorage.setItem(legacyKeys.skin, '');
		} catch (e) {}
	}

	function storeLaunchState(payload) {
		try {
			sessionStorage.setItem(launchStorageKey, JSON.stringify({
				mode: payload.mode,
				nick: payload.nick || '',
				skin: payload.skin || '',
				timestamp: Date.now()
			}));
		} catch (e) {}
	}

	function sanitizeSkin(str) {
		return str.replace(/[^a-zA-Z0-9_\- ]/gim, '').trim();
	}

	function sanitizeNick(str) {
		return str.replace(/[<>|]/gim, '').trim();
	}

	function normalizeSkinList(data) {
		return data
			.split(',')
			.map(function(skin) { return sanitizeSkin(skin); })
			.filter(function(skin, index, arr) {
				return skin !== '' && arr.indexOf(skin) === index;
			});
	}

	function rebuildKnownSkinsSet() {
		knownSkinsSet = {};
		knownSkins.forEach(function(skin) {
			knownSkinsSet[skin] = true;
		});
	}

	function isKnownSkin(skin) {
		return !!knownSkinsSet[sanitizeSkin(skin)];
	}

	function syncSkinInputWithAvailableSkins() {
		var currentSkin = sanitizeSkin($skin.val());
		if (!currentSkin) return;
		if (!isKnownSkin(currentSkin)) {
			$skin.val('');
			clearStoredSkin();
		}
	}

	function getPlayableSkin() {
		var currentSkin = sanitizeSkin($skin.val());
		if (!currentSkin || !isKnownSkin(currentSkin)) return '';
		return currentSkin;
	}

	$.get('/skinList.txt', function(data, status) {
		if (status === 'success') {
			var skins = normalizeSkinList(data);
			if (skins.length === 0) return;
			knownSkins = skins;
			rebuildKnownSkinsSet();
			syncSkinInputWithAvailableSkins();
			$('#lobby-gallery-btn').css('display', 'inline-block');
		}
	}).error(function() {
		// No skins available, that's fine
	});

	$('#lobby-page input').keypress(function(e) {
		if (e.which === 13) {
			$('#lobby-play-btn').click();
		}
	});

	$('#lobby-play-btn').off('click').on('click', function(e) {
		e.preventDefault();
		var nick = sanitizeNick($nick.val());
		var skin = getPlayableSkin();
		if (!nick) {
			alert('Please enter a nickname');
			return;
		}
		setStoredValue(storageKeys.nick, nick);
		setStoredValue(storageKeys.skin, skin);
		storeLaunchState({
			mode: 'play',
			nick: nick,
			skin: skin
		});
		window.location.href = '/game.html';
	});

	$('#lobby-spectate-btn').off('click').on('click', function(e) {
		e.preventDefault();
		storeLaunchState({
			mode: 'spectate'
		});
		window.location.href = '/game.html';
	});

	$('#lobby-settings-btn').off('click').on('click', function(e) {
		e.preventDefault();
		alert('Settings panel coming soon!');
	});

	$('#lobby-gallery-btn').off('click').on('click', function(e) {
		e.preventDefault();
		if (knownSkins.length > 0) {
			var skin = prompt('Enter a skin name or choose from the list below:\n' + knownSkins.slice(0, 25).join(', '), $skin.val());
			if (skin === null) {
				return;
			}
			var sanitizedSkin = sanitizeSkin(skin);
			if (sanitizedSkin && isKnownSkin(sanitizedSkin)) {
				$skin.val(sanitizedSkin);
				setStoredValue(storageKeys.skin, sanitizedSkin);
				return;
			}
			alert('That skin is not available. Type exactly as shown in the list.');
			return;
		}
		alert('Skin data is not available yet. Try again later.');
	});

	$nick.off('input change blur').on('input change blur', function(e) {
		setStoredValue(storageKeys.nick, e.target.value);
	});

	$skin.off('input change blur').on('input change blur', function(e) {
		var sanitizedSkin = sanitizeSkin(e.target.value);
		if (sanitizedSkin !== e.target.value) {
			$skin.val(sanitizedSkin);
		}
		if (sanitizedSkin && !isKnownSkin(sanitizedSkin)) {
			clearStoredSkin();
			return;
		}
		setStoredValue(storageKeys.skin, sanitizedSkin);
	});

	// Load stored values
	$nick.val(getStoredValue(storageKeys.nick, legacyKeys.nick));
	$skin.val(getStoredValue(storageKeys.skin, legacyKeys.skin));
	syncSkinInputWithAvailableSkins();
});
