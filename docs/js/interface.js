$(function() {
	var socketHost = window.location.hostname || '127.0.0.1';
	var socketUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + socketHost + ':3000/ws1/';
	var FP = FingerprintJS.load();
	var externallyFramed;
	var playerIdent;
	var bannedIdent = [];
	var knownSkins = [];
	var knownSkinsSet = {};
	var interval;
	var $nick = $('#nick');
	var $skin = $('#skin');
	var $gallery = $('#gallery');
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

	function getSupportMessage() {
		return '<div class="text-center" style="display: block; color: #3b6ea8;">Blobz support info is coming soon.</div>';
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

	$.get('skinList.txt', function(data, status) {
		if (status === 'success') {
			var skins = normalizeSkinList(data);
			if (skins.length === 0) return;
			knownSkins = skins;
			rebuildKnownSkinsSet();
			syncSkinInputWithAvailableSkins();

			$('#gallery-btn').css('display', 'inline-block');

			$.get('fpBanList.txt').success(function(data) {
				var fp = data.split(',');

				for (var p of fp) bannedIdent.push(p);

				playerIdent = getStoredValue(storageKeys.ident, legacyKeys.ident);

				FP.then(function(fp) { return fp.get(); }).then(function(result) {
					setStoredValue(storageKeys.ident, result.visitorId);

					var ban = false;

					bannedIdent.forEach(function(val) {
						if (playerIdent === val) {
							ban = true;
						}
					});

					if (ban) {
						$('#chat_textbox').hide();
						$('#overlays').hide();
						$('#connecting div').html('<h3 style="text-align: center">You are banned</h3><hr class="top" /><p style="text-align: center">You are banned from Blobz because of repeated rule violations.</p>' + getSupportMessage() + '<h1 style="text-align: center;">Your unban code is<br /><br />' + btoa(playerIdent).replace(/(.{10})/g, "$1<br />") + '</h1>');
						$('#connecting').show();
					} else {
						$('#overlays').show();
						connect(socketUrl);

						clearInterval(interval);
						interval = setInterval(function() {
							FP.then(function(fp) { return fp.get(); }).then(function(result) {
								setStoredValue(storageKeys.ident, result.visitorId);

								var liveIdent = getStoredValue(storageKeys.ident, legacyKeys.ident);
								var liveBan = false;

								bannedIdent.forEach(function(val) {
									if (liveIdent === val) {
										liveBan = true;
									}
								});

								if (liveBan) {
									$('#chat_textbox').hide();
									$('#overlays').hide();
									$('#connecting div').html('<h3 style="text-align: center">You are banned</h3><hr class="top" /><p style="text-align: center">You are banned from Blobz because of repeated rule violations.</p>' + getSupportMessage() + '<h1 style="text-align: center;">Your unban code is<br /><br />' + btoa(liveIdent).replace(/(.{10})/g, "$1<br />") + '</h1>');
									$('#connecting').show();
								}
							});
						}, 10000);
					}
				});
			}).error(function() {
				$('#overlays').show();
				connect(socketUrl);
			});
		}
	}).error(function() {
		$('#overlays').show();
		connect(socketUrl);
	});

	$('input').keypress(function(e) {
		if (e.which === 13) {
			if (!isSpectating) {
				setNick('<' + getPlayableSkin() + '|' + (playerIdent ? playerIdent : '') + '>' + sanitizeNick($nick.val()));
			}
		}
	});

	$('#gallery-btn').on('click', function(e) {
		e.preventDefault();

		var $gallerybody = $('#gallery-body');

		if ($gallerybody.html() === '') {
			var sortedSkins = knownSkins.sort();
			var c = '';

			for (var skin in sortedSkins) {
				if (sortedSkins[skin] !== '') {
					c += '<li class="skin" data-skin="' + sortedSkins[skin] + '">';
					c += '<img class="circular" loading="lazy" src="./skins/' + sortedSkins[skin] + '.png">';
					c += '<h4 class="skinName">' + sortedSkins[skin] + '</h4>';
					c += '</li>';
				}
			}

			$gallerybody.html('<ul id="skinsUL">' + c + '</ul>');

			$('li.skin').off('click').on('click', function() {
				var skin = $(this).data('skin');
				$skin.val(sanitizeSkin(skin));
				setStoredValue(storageKeys.skin, skin);
				$gallery.hide();
			});
		}

		$gallery.css('display', 'flex');

		return false;
	});

	$gallery.off('click').on('click', function(e) {
		if (e.target === $(this).get(0)) {
			$(this).hide();
		}
	});

	$('#settings-btn').off('click').on('click', function(e) {
		e.preventDefault();
		$('#settings').toggle();
		return false;
	});

	$('#play-btn').off('click').on('click', function(e) {
		e.preventDefault();

		var form = $('#form').get(0);

		if (form && typeof form.reportValidity === 'function' && form.reportValidity()) {
			setNick('<' + getPlayableSkin() + '|' + (playerIdent ? playerIdent : '') + '>' + sanitizeNick($nick.val()));
		}

		return false;
	});

	$('#spectate-btn').off('click').on('click', function(e) {
		e.preventDefault();
		spectate();
		return false;
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

	$('#chat_textbox').off('paste').on('paste', function(e) {
		e.preventDefault();
		return false;
	});

	$nick.val(getStoredValue(storageKeys.nick, legacyKeys.nick));
	$skin.val(getStoredValue(storageKeys.skin, legacyKeys.skin));
	syncSkinInputWithAvailableSkins();
});
