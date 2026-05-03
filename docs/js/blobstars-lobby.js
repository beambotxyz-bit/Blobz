(function () {
    var storageKeys = {
        nick: "blobznick",
        skin: "blobzskin",
        economy: "blobzEconomy",
        daily: "blobzDaily"
    };
    var legacyKeys = {
        nick: "agarv1nick",
        skin: "agarv1skin"
    };
    var launchStorageKey = "blobzLaunch";
    var defaultSkinName = "Base";
    var skinRenderBatchSize = 48;
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
    var defaultSettings = {
        playSounds: true,
        soundsVolume: 0.45,
        playMusic: false,
        musicVolume: 0.28,
        jellyPhysics: false,
        splitMacro: true,
        feedMacro: true,
        showMass: false,
        hideGrid: false,
        hideChat: false,
        showSkins: true,
        joystickSide: "left",
        keyBindings: {
            split: "Space",
            eject: "KeyW",
            maxSplit: "KeyC",
            freeze: "KeyQ",
            shield: "KeyE",
            spike: "KeyR",
            special: "KeyT"
        }
    };
    var boostDefinitions = {
        shield: { key: "shield", name: "SHIELD", color: "#00e5ff", icon: "fa-shield-halved" },
        spike: { key: "spike", name: "SPIKES", color: "#ff4d68", icon: "fa-certificate" },
        freeze: { key: "freeze", name: "FREEZES", color: "#39ff14", icon: "fa-snowflake" }
    };
    var rarityCycle = [
        { rarity: "LEGEND", color: "#ff007f" },
        { rarity: "EPIC", color: "#9400d3" },
        { rarity: "RARE", color: "#00e5ff" },
        { rarity: "LEGEND", color: "#ffaa00" },
        { rarity: "RARE", color: "#00e5ff" }
    ];

    var modalOverlay = document.getElementById("modalOverlay");
    var modalTitle = document.getElementById("modalTitle");
    var modalContent = document.getElementById("modalContent");
    var dialogueOverlay = document.getElementById("dialogueOverlay");
    var dialogueCard = document.getElementById("dialogueCard");
    var navItems = Array.prototype.slice.call(document.querySelectorAll(".bottom-dock .nav-item"));
    var profileAvatar = document.getElementById("profileAvatar");
    var profileName = document.getElementById("profileName");
    var profileTag = document.getElementById("profileTag");
    var profileProgressBar = document.getElementById("profileProgressBar");
    var gemAmount = document.getElementById("gem-amount");

    var State = {
        economy: readEconomy(),
        tasks: [false, false, false, false],
        rankingTab: "global",
        activeModal: null,
        activeInventoryTab: "skins",
        activeSkinId: 1,
        visibleSkinCount: skinRenderBatchSize,
        pendingSkinId: null,
        account: {
            authenticated: false,
            player: null,
            inventory: null,
            syncError: null
        },
        nick: sanitizeNick(getStoredValue(storageKeys.nick, legacyKeys.nick)) || "BitGraf",
        skin: sanitizeSkin(getStoredValue(storageKeys.skin, legacyKeys.skin)),
        settings: readStoredSettings()
    };

    var inventoryData = {
        skins: [],
        boosts: Object.keys(boostDefinitions).map(function (key) { return boostDefinitions[key]; })
    };

    function getStoredValue(key, legacyKey) {
        try {
            return localStorage.getItem(key) || localStorage.getItem(legacyKey) || "";
        } catch (error) {
            return "";
        }
    }

    function setStoredValue(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {}
    }

    function sanitizeNick(value) {
        return String(value || "").replace(/[<>|]/g, "").trim().slice(0, 15);
    }

    function sanitizeSkin(value) {
        return String(value || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, "&#96;");
    }

    function parseToggle(value, fallback) {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            if (value === "true") return true;
            if (value === "false") return false;
        }
        return fallback;
    }

    function clampVolume(value, fallback) {
        var parsed = parseFloat(value);
        if (isNaN(parsed)) parsed = fallback;
        if (isNaN(parsed)) parsed = 0;
        return Math.max(0, Math.min(1, parsed));
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
            return normalizeEconomy(JSON.parse(localStorage.getItem(storageKeys.economy) || "null"));
        } catch (error) {
            return normalizeEconomy(null);
        }
    }

    function persistEconomy() {
        State.economy = normalizeEconomy(State.economy);
        try {
            localStorage.setItem(storageKeys.economy, JSON.stringify(State.economy));
        } catch (error) {}
    }

    function xpForLevel(level) {
        level = Math.max(0, Math.min(49, Math.floor(Number(level) || 0)));
        return 700 + level * 120;
    }

    function totalXpForLevel(level) {
        level = Math.max(0, Math.min(50, Math.floor(Number(level) || 0)));
        if (level <= 0) return 0;
        return 700 * level + 60 * level * (level - 1);
    }

    function economyFromPlayer(player) {
        var level = Math.max(0, Math.min(50, Math.floor(Number(player && player.level) || 0)));
        var totalXp = Math.max(0, Math.floor(Number(player && player.xp) || 0));
        var progressXp = level >= 50 ? 0 : Math.max(0, totalXp - totalXpForLevel(level));
        return normalizeEconomy({
            gems: player && player.gems,
            cups: player && player.cups,
            level: level,
            xp: progressXp,
            boosts: State.economy && State.economy.boosts
        });
    }

    function formatCompact(value) {
        value = Math.max(0, Math.floor(Number(value) || 0));
        if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
        if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
        return String(value);
    }

    function parseCompactAmount(value) {
        var text = String(value || "").trim().toUpperCase();
        var multiplier = text.indexOf("K") !== -1 ? 1000 : text.indexOf("M") !== -1 ? 1000000 : 1;
        var parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
        return Math.max(0, Math.floor((isNaN(parsed) ? 0 : parsed) * multiplier));
    }

    function normalizeKeyBindings(bindings) {
        var normalized = {};
        bindings = bindings || {};
        Object.keys(defaultSettings.keyBindings).forEach(function (action) {
            normalized[action] = typeof bindings[action] === "string" && bindings[action] ? bindings[action] : defaultSettings.keyBindings[action];
        });
        return normalized;
    }

    function normalizeJoystickSide(value) {
        return value === "right" ? "right" : "left";
    }

    function keyLabel(code) {
        if (code === "Space") return "SPACE";
        return String(code || "").replace(/^Key/, "").replace(/^Digit/, "").replace(/([A-Z])/g, " $1").trim().toUpperCase();
    }

    function readStoredSettings() {
        var parsed = {};
        try {
            if (localStorage.settings) parsed = JSON.parse(localStorage.settings) || {};
        } catch (error) {
            parsed = {};
        }
        return {
            playSounds: parseToggle(parsed.playSounds, defaultSettings.playSounds),
            soundsVolume: clampVolume(parsed.soundsVolume, defaultSettings.soundsVolume),
            playMusic: parseToggle(parsed.playMusic, defaultSettings.playMusic),
            musicVolume: clampVolume(parsed.musicVolume, defaultSettings.musicVolume),
            jellyPhysics: parseToggle(parsed.jellyPhysics, defaultSettings.jellyPhysics),
            splitMacro: parseToggle(parsed.splitMacro, defaultSettings.splitMacro),
            feedMacro: parseToggle(parsed.feedMacro, defaultSettings.feedMacro),
            showMass: parseToggle(parsed.showMass, defaultSettings.showMass),
            hideGrid: parseToggle(parsed.hideGrid, defaultSettings.hideGrid),
            hideChat: parseToggle(parsed.hideChat, defaultSettings.hideChat),
            showSkins: parseToggle(parsed.showSkins, defaultSettings.showSkins),
            joystickSide: normalizeJoystickSide(parsed.joystickSide),
            keyBindings: normalizeKeyBindings(parsed.keyBindings)
        };
    }

    function persistSettings() {
        var raw = {};
        try {
            if (localStorage.settings) raw = JSON.parse(localStorage.settings) || {};
        } catch (error) {
            raw = {};
        }
        Object.keys(defaultSettings).forEach(function (key) {
            if (key.indexOf("Volume") !== -1) {
                raw[key] = clampVolume(State.settings[key], defaultSettings[key]);
            } else if (key === "keyBindings") {
                raw[key] = normalizeKeyBindings(State.settings.keyBindings);
            } else if (key === "joystickSide") {
                raw[key] = normalizeJoystickSide(State.settings[key]);
            } else {
                raw[key] = !!State.settings[key];
            }
        });
        try {
            localStorage.settings = JSON.stringify(raw);
        } catch (error) {}
    }

    function persistProfile() {
        State.nick = sanitizeNick(State.nick) || "BitGraf";
        State.skin = sanitizeSkin(State.skin);
        setStoredValue(storageKeys.nick, State.nick);
        setStoredValue(storageKeys.skin, State.skin);
    }

    function skinUrl(name) {
        return "/skins/" + encodeURIComponent(sanitizeSkin(name) || defaultSkinName) + ".png";
    }

    function displayName(name) {
        var cleaned = String(name || "Base").replace(/_/g, " ").trim();
        return cleaned ? cleaned.replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }) : "Base";
    }

    function shortName(name, limit) {
        var value = String(name || "");
        if (value.length <= limit) return value;
        return value.slice(0, Math.max(1, limit - 3)) + "...";
    }

    function normalizeSkinList(data) {
        var seen = Object.create(null);
        return String(data || "")
            .split(",")
            .map(function (name) { return sanitizeSkin(name); })
            .filter(function (name) {
                if (!name || seen[name] || name.toLowerCase() === defaultSkinName.toLowerCase()) return false;
                seen[name] = true;
                return true;
            });
    }

    function buildSkinEntry(name, id) {
        var theme = id === 1 ? { rarity: "DEFAULT", color: "#00e5ff" } : rarityCycle[(id - 2) % rarityCycle.length];
        return {
            id: id,
            name: id === 1 ? "Base" : name,
            displayName: id === 1 ? "Base" : displayName(name),
            rarity: theme.rarity,
            color: theme.color,
            desc: id === 1 ? "The shared Blobz base look for every new pilot." : "Unlocked for Alpha",
            image: skinUrl(id === 1 ? defaultSkinName : name),
            serialLabel: "#" + id
        };
    }

    function rebuildSkins(names) {
        inventoryData.skins = [buildSkinEntry(defaultSkinName, 1)].concat(names.map(function (name, index) {
            return buildSkinEntry(name, index + 2);
        }));
        var stored = State.skin || defaultSkinName;
        var match = inventoryData.skins.find(function (skin) { return skin.name === stored; });
        State.activeSkinId = match ? match.id : 1;
        if (!match) State.skin = "";
    }

    function rarityTheme(rarity, index) {
        var key = String(rarity || "").toUpperCase();
        if (key === "LEGEND" || key === "LEGENDARY") return { rarity: "LEGEND", color: "#ff007f" };
        if (key === "EPIC") return { rarity: "EPIC", color: "#9400d3" };
        if (key === "RARE") return { rarity: "RARE", color: "#00e5ff" };
        if (key === "DEFAULT") return { rarity: "DEFAULT", color: "#00e5ff" };
        return rarityCycle[index % rarityCycle.length] || { rarity: "COMMON", color: "#39ff14" };
    }

    function skinNameFromApiSkin(skin) {
        var path = skin && skin.imagePath ? String(skin.imagePath) : "";
        var file = path.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
        return sanitizeSkin(file || (skin && skin.name) || (skin && skin.slug) || defaultSkinName) || defaultSkinName;
    }

    function buildApiSkinEntry(skin, index) {
        var theme = rarityTheme(skin && skin.rarity, index);
        var name = skinNameFromApiSkin(skin);
        var serial = Math.max(0, Math.floor(Number(skin && skin.serialNumber) || 0));
        return {
            id: index + 1,
            playerSkinId: skin && skin.id ? skin.id : null,
            name: name,
            displayName: skin && skin.name ? skin.name : displayName(name),
            rarity: index === 0 && name.toLowerCase() === "base" ? "DEFAULT" : theme.rarity,
            color: index === 0 && name.toLowerCase() === "base" ? "#00e5ff" : theme.color,
            desc: serial ? "Minted personal skin #" + serial : "Personal Blobz skin",
            image: skin && skin.imagePath ? skin.imagePath : skinUrl(name),
            serialNumber: serial,
            serialLabel: serial ? "#" + serial : "#" + (index + 1)
        };
    }

    function applyBackendInventory(inventory) {
        var skins = inventory && Array.isArray(inventory.skins) ? inventory.skins.slice() : [];
        var hasBase = skins.some(function (skin) {
            return skinNameFromApiSkin(skin).toLowerCase() === defaultSkinName.toLowerCase();
        });

        if (!hasBase) {
            skins.unshift({
                id: null,
                slug: "base",
                name: "Base",
                rarity: "default",
                imagePath: skinUrl(defaultSkinName),
                serialNumber: 0
            });
        }

        inventoryData.skins = skins.map(buildApiSkinEntry);
        var selected = State.account.player && State.account.player.selectedSkin;
        var selectedSkinId = selected && selected.id;
        var active = selectedSkinId
            ? inventoryData.skins.find(function (skin) { return skin.playerSkinId === selectedSkinId; })
            : inventoryData.skins.find(function (skin) { return skin.name.toLowerCase() === defaultSkinName.toLowerCase(); });

        if (!active) active = inventoryData.skins[0];
        State.activeSkinId = active ? active.id : 1;
        State.skin = active && active.name.toLowerCase() !== defaultSkinName.toLowerCase() ? active.name : "";

        var boosts = { shield: 0, spike: 0, freeze: 0 };
        if (inventory && Array.isArray(inventory.items)) {
            inventory.items.forEach(function (item) {
                if (Object.prototype.hasOwnProperty.call(boosts, item.slug)) {
                    boosts[item.slug] = Math.max(0, Math.floor(Number(item.quantity) || 0));
                }
            });
            State.economy.boosts = boosts;
        }
    }

    function loadSkins() {
        rebuildSkins([]);
        fetch("/skinList.txt", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) throw new Error("skinList failed");
                return response.text();
            })
            .then(function (text) {
                if (isBackendAccount() && State.account.inventory) return;
                rebuildSkins(normalizeSkinList(text));
                updateShell();
                if (State.activeModal === "inventory") renderInventoryContent(State.activeInventoryTab);
                if (State.activeModal === "profile") openModal("profile");
            })
            .catch(function () {
                updateShell();
            });
    }

    function getActiveSkin() {
        return inventoryData.skins.find(function (skin) { return skin.id === State.activeSkinId; }) || inventoryData.skins[0] || buildSkinEntry(defaultSkinName, 1);
    }

    function updateGemDisplay() {
        if (gemAmount) gemAmount.textContent = formatCompact(State.economy.gems);
    }

    function updateShell() {
        var activeSkin = getActiveSkin();
        var nextXp = xpForLevel(State.economy.level);
        var xpPercent = State.economy.level >= 50 ? 100 : Math.max(0, Math.min(100, State.economy.xp / nextXp * 100));
        if (profileName) profileName.textContent = State.nick.toUpperCase();
        if (profileTag) profileTag.textContent = "LVL " + State.economy.level;
        if (profileProgressBar) profileProgressBar.style.width = xpPercent + "%";
        if (profileAvatar) {
            profileAvatar.src = activeSkin.image;
            profileAvatar.onerror = function () {
                profileAvatar.src = skinUrl(defaultSkinName);
            };
        }
        updateGemDisplay();
    }

    function isBackendAccount() {
        return !!(State.account && State.account.authenticated && State.account.player);
    }

    function refreshActiveModal() {
        if (State.activeModal === "inventory") renderInventoryContent(State.activeInventoryTab || "skins");
        if (State.activeModal === "profile") openModal("profile");
        if (State.activeModal === "ranking") renderRankingContent(State.rankingTab || "global");
    }

    function applyBackendPlayer(player) {
        if (!player) return;
        State.account.player = player;
        State.account.authenticated = true;
        State.nick = sanitizeNick(player.displayName || player.username || State.nick) || State.nick;
        State.economy = economyFromPlayer(player);
        persistProfile();
        persistEconomy();
    }

    function syncBackendAccount() {
        if (!window.blobzApi || typeof window.blobzApi.bootstrap !== "function") return;
        window.blobzApi.bootstrap().then(function (result) {
            if (!result || !result.player) return;
            State.account.authenticated = !!result.authenticated;
            State.account.syncError = result.error || null;
            applyBackendPlayer(result.player);
            if (result.inventory) {
                State.account.inventory = result.inventory;
                applyBackendInventory(result.inventory);
            }
            updateShell();
            refreshActiveModal();
        });
    }

    function showOnlineEconomyPending() {
        showPopup(
            '<div style="font-size: 3.4rem; color: #00e5ff; margin-bottom: 1rem;"><i class="fa-solid fa-lock"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.25rem; margin:0 0 0.6rem; font-weight:900; text-align:center;">ONLINE ECONOMY</h2>' +
            '<div style="font-size:0.8rem; color: rgba(255,255,255,0.62); margin-bottom:1.4rem; text-align:center;">This account is synced to the Blobz backend. Purchases and claims need server-side routes before they can change your real balance.</div>' +
            '<button class="pill-btn" onclick="closePopup()" style="width:100%; background:#fff; color:#000; border:none;">OK</button>',
            'border-color:#00e5ff; box-shadow: 0 15px 50px rgba(0,229,255,0.25);'
        );
    }

    function updateNavState(activeModal) {
        var activeKey = activeModal || "home";
        navItems.forEach(function (item) {
            item.classList.toggle("active", item.getAttribute("data-modal") === activeKey);
        });
    }

    function openModal(type) {
        State.activeModal = type;
        if (!modalOverlay || !modalTitle || !modalContent) return;
        modalOverlay.style.display = "flex";
        window.requestAnimationFrame(function () { modalOverlay.classList.add("active"); });

        if (type === "profile") {
            updateNavState("home");
            modalTitle.innerText = "PROFILE HUB";
            modalContent.innerHTML = buildProfileContent();
            return;
        }
        if (type === "settings") {
            updateNavState("home");
            modalTitle.innerText = "COMMAND DECK / SETTINGS";
            modalContent.innerHTML = buildSettingsContent();
            syncSettingsControls();
            return;
        }
        if (type === "inventory") {
            updateNavState("inventory");
            modalTitle.innerText = "SUPPLY / ASSETS";
            renderInventoryContent(State.activeInventoryTab || "skins");
            return;
        }
        if (type === "market") {
            updateNavState("market");
            modalTitle.innerText = "BLACK MARKET";
            modalContent.innerHTML = buildMarketContent();
            return;
        }
        if (type === "ranking") {
            updateNavState("ranking");
            modalTitle.innerText = "RANKING HUB";
            renderRankingContent(State.rankingTab || "global");
            return;
        }
        if (type === "daily") {
            updateNavState("home");
            modalTitle.innerText = "DAILY DROP";
            modalContent.innerHTML = buildDailyContent();
            return;
        }
        if (type === "invite") {
            updateNavState("home");
            modalTitle.innerText = "INVITE FRIENDS";
            modalContent.innerHTML = buildInviteContent();
            return;
        }
        if (type === "tasks") {
            updateNavState("tasks");
            modalTitle.innerText = "SOCIAL TASKS";
            modalContent.innerHTML = buildTasksContent();
            return;
        }
        closeModal();
    }

    function closeModal() {
        State.activeModal = null;
        if (!modalOverlay) return;
        modalOverlay.classList.remove("active");
        setTimeout(function () {
            if (!modalOverlay.classList.contains("active")) modalOverlay.style.display = "none";
        }, 300);
        updateNavState("home");
    }

    function showPopup(html, customCardStyle) {
        if (!dialogueOverlay || !dialogueCard) return;
        dialogueCard.innerHTML = html;
        dialogueCard.style.cssText = "width: 100%; max-width: 320px; padding: 2.5rem 1.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; position: relative; background: rgba(10, 10, 15, 0.95); border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); transition: box-shadow 0.3s, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform: scale(0.95); box-shadow: 0 15px 50px rgba(0,0,0,0.8);" + (customCardStyle || "");
        dialogueOverlay.style.display = "flex";
        setTimeout(function () {
            dialogueOverlay.classList.add("active");
            dialogueCard.style.transform = "scale(1)";
        }, 10);
    }

    function closePopup() {
        if (!dialogueOverlay || !dialogueCard) return;
        dialogueOverlay.classList.remove("active");
        dialogueCard.style.transform = "scale(0.95)";
        setTimeout(function () {
            if (!dialogueOverlay.classList.contains("active")) {
                dialogueOverlay.style.display = "none";
                dialogueCard.innerHTML = "";
            }
        }, 250);
    }

    function openSkinPopup(id) {
        var skin = inventoryData.skins.find(function (entry) { return entry.id === Number(id); });
        if (!skin) return;
        State.pendingSkinId = skin.id;
        var html = '' +
            '<div style="position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; display: flex; justify-content: center; align-items: center; border-radius: 50%; background: rgba(255,255,255,0.05); font-size: 0.8rem; color: rgba(255,255,255,0.5); cursor: pointer; transition: 0.2s; border: 1px solid rgba(255,255,255,0.1);" onclick="closePopup()" onmouseover="this.style.color=\'#fff\'; this.style.background=\'rgba(255,255,255,0.15)\'" onmouseleave="this.style.color=\'rgba(255,255,255,0.5)\'; this.style.background=\'rgba(255,255,255,0.05)\'"><i class="fa-solid fa-xmark"></i></div>' +
            '<div style="width: 100px; height: 100px; border-radius: 50%; margin-bottom: 1.5rem; background: #000; border: 2px solid ' + escapeAttribute(skin.color) + '; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 25px ' + escapeAttribute(skin.color) + '55, inset 0 0 18px rgba(255,255,255,0.04); position: relative; overflow: hidden;">' +
                '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">' +
                '<div style="position:absolute; inset: 0; border-radius: 50%; pointer-events:none; box-shadow: inset 0 10px 18px rgba(255,255,255,0.08), inset 0 -16px 18px rgba(0,0,0,0.35);"></div>' +
            '</div>' +
            '<div style="font-size: 0.65rem; font-weight: 900; padding: 4px 12px; border-radius: 12px; background: ' + escapeAttribute(skin.color) + '; color: ' + (skin.rarity === "LEGEND" ? "#000" : "#fff") + '; margin-bottom: 0.8rem; letter-spacing: 1px;">' + escapeHtml(skin.rarity) + '</div>' +
            '<h2 style="margin: 0 0 0.3rem; font-size: 1.4rem; font-weight: 900; color: #fff; text-align:center;">' + escapeHtml(skin.displayName) + '</h2>' +
            '<div style="font-size: 0.6rem; color: rgba(255,255,255,0.4); font-weight: 800; letter-spacing: 2px; margin-bottom: 1.5rem; text-transform: uppercase; text-align:center;">' + escapeHtml(skin.serialNumber ? 'Minted ' + skin.serialLabel : 'Unlocked for Alpha') + '</div>' +
            '<button class="pill-btn" onclick="confirmUseSkin()" style="width: 100%; background: #ffffff; color: #000000; padding: 0.9rem; border-radius: 14px; font-size: 0.95rem; font-weight: 900; letter-spacing: 1px; border: none; box-shadow: 0 4px 15px rgba(255,255,255,0.15);">EQUIP</button>';
        showPopup(html, "border-color:" + skin.color + "; box-shadow: 0 15px 50px " + skin.color + "33;");
    }

    function applySelectedSkin(skin) {
        State.activeSkinId = skin.id;
        State.skin = skin.id === 1 && !skin.playerSkinId ? "" : skin.name;
        persistProfile();
        updateShell();
        refreshActiveModal();
    }

    function confirmUseSkin() {
        var skin = inventoryData.skins.find(function (entry) { return entry.id === Number(State.pendingSkinId); });
        if (skin) {
            if (isBackendAccount() && window.blobzApi && typeof window.blobzApi.equipSkin === "function") {
                window.blobzApi.equipSkin(skin.playerSkinId || null).then(function (player) {
                    if (player) applyBackendPlayer(player);
                    applySelectedSkin(skin);
                    closePopup();
                }).catch(function () {
                    showOnlineEconomyPending();
                });
                return;
            }
            applySelectedSkin(skin);
        }
        closePopup();
    }

    function renderInventoryContent(tab) {
        if (tab === "lootboxes") tab = "skins";
        State.activeInventoryTab = tab || "skins";
        if (!modalContent) return;
        var tabsWrap = document.createElement("div");
        tabsWrap.className = "modal-tabs reference-tabs";
        tabsWrap.style.cssText = "display:flex; gap:0.5rem; margin-bottom:1.5rem; overflow-x:auto; padding-bottom:5px; flex-shrink:0; border-bottom:1px solid rgba(255,255,255,0.1);";
        ["SKINS", "BOOSTS"].forEach(function (label) {
            var lower = label.toLowerCase();
            var active = State.activeInventoryTab === lower;
            var btn = document.createElement("button");
            btn.className = "pill-btn modal-tab-btn" + (active ? " is-active" : "");
            btn.innerText = label;
            btn.style.cssText = "background:" + (active ? "rgba(0,229,255,0.1)" : "transparent") +
                "; color:" + (active ? "#00e5ff" : "rgba(255,255,255,0.4)") +
                "; border-color:" + (active ? "#00e5ff" : "transparent") +
                "; border-radius:8px 8px 0 0; border-bottom:none; padding:0.6rem 1.5rem; font-weight:900; letter-spacing:1px;";
            btn.onclick = function () { renderInventoryContent(lower); };
            tabsWrap.appendChild(btn);
        });
        modalContent.innerHTML = "";
        modalContent.appendChild(tabsWrap);

        if (State.activeInventoryTab === "skins") {
            modalContent.insertAdjacentHTML("beforeend", buildSkinGrid());
        } else if (State.activeInventoryTab === "boosts") {
            modalContent.insertAdjacentHTML("beforeend", buildBoostGrid());
        }
    }

    function getVisibleSkins() {
        var count = Math.max(skinRenderBatchSize, State.visibleSkinCount || skinRenderBatchSize);
        var visible = inventoryData.skins.slice(0, count);
        var active = inventoryData.skins.find(function (skin) { return skin.id === State.activeSkinId; });
        if (active && !visible.some(function (skin) { return skin.id === active.id; })) {
            visible.unshift(active);
        }
        return visible;
    }

    function buildSkinGrid() {
        var visibleSkins = getVisibleSkins();
        var remaining = Math.max(0, inventoryData.skins.length - Math.max(skinRenderBatchSize, State.visibleSkinCount || skinRenderBatchSize));
        var grid = '<div class="grid-4 skin-square-grid" style="padding: 5px 0;">' + visibleSkins.map(function (skin) {
            var active = skin.id === State.activeSkinId;
            var skinColor = escapeAttribute(skin.color);
            return '' +
                '<div class="premium-panel asset-card skin-square-card" onclick="openSkinPopup(' + skin.id + ')" style="--skin-color:' + skinColor + '; border: 1px solid ' + (active ? skinColor : 'rgba(255,255,255,0.05)') + '; background: ' + (active ? skinColor + '11' : 'rgba(10,10,15,0.6)') + ';">' +
                    '<div class="skin-card-shine" style="background:linear-gradient(0deg, ' + skinColor + '22 0%, transparent 55%);"></div>' +
                    '<div class="skin-card-topline" style="background:' + skinColor + '; box-shadow:0 0 10px ' + skinColor + ';"></div>' +
                    '<div class="id-ribbon skin-card-id">' + escapeHtml(skin.serialLabel || ("#" + skin.id)) + '</div>' +
                    '<div class="skin-card-stage" style="background: radial-gradient(circle, ' + skinColor + '44 0%, transparent 70%);">' +
                        '<div class="skin-card-orbit" style="border-color:' + skinColor + '88; box-shadow:0 0 15px ' + skinColor + ';"></div>' +
                        '<div class="skin-card-media">' +
                            '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="filter: drop-shadow(0 5px 10px ' + skinColor + '); border-color:' + skinColor + ';">' +
                        '</div>' +
                    '</div>' +
                    '<div class="skin-card-copy">' +
                        '<div class="skin-card-rarity" style="background:' + skinColor + '; color:' + (skin.rarity === "LEGEND" ? "#000" : "#fff") + '; box-shadow:0 0 10px ' + skinColor + '66;">' + escapeHtml(skin.rarity) + '</div>' +
                        '<h4 class="skin-card-title">' + escapeHtml(shortName(skin.displayName, 16)) + '</h4>' +
                        (active ? '<div class="skin-card-equipped" style="color:' + skinColor + ';"><i class="fa-solid fa-bolt"></i> EQUIPPED</div>' : '') +
                    '</div>' +
                '</div>';
        }).join("") + '</div>';
        if (!remaining) return grid;
        return grid +
            '<div style="display:flex; justify-content:center; padding: 0.75rem 0 0.25rem;">' +
                '<button class="pill-btn" onclick="loadMoreSkins()" style="border-color:rgba(0,229,255,0.35); color:#00e5ff; background:rgba(0,229,255,0.08);">LOAD MORE ' + Math.min(skinRenderBatchSize, remaining) + '</button>' +
            '</div>';
    }

    function loadMoreSkins() {
        State.visibleSkinCount = Math.min(inventoryData.skins.length, (State.visibleSkinCount || skinRenderBatchSize) + skinRenderBatchSize);
        renderInventoryContent("skins");
    }

    function buildBoostGrid() {
        return '<div class="grid-3" style="padding: 5px 0;">' + inventoryData.boosts.map(function (boost) {
            var quantity = State.economy.boosts[boost.key] || 0;
            return '' +
                '<div class="premium-panel asset-card" style="padding: 1.5rem 1rem; text-align: center; position: relative; background:rgba(10,10,15,0.6); overflow:hidden;">' +
                    '<div style="position:absolute; top:-20px; right:-20px; font-size:6rem; opacity:0.05; color:' + boost.color + ';"><i class="fa-solid ' + boost.icon + '"></i></div>' +
                    '<div style="width: 80px; height: 80px; border-radius: 12px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4)); border: 1px solid ' + boost.color + '44; display: flex; justify-content: center; align-items: center; box-shadow: inset 0 0 20px ' + boost.color + '33, 0 10px 20px rgba(0,0,0,0.5); position:relative; z-index:1;">' +
                        '<i class="fa-solid ' + boost.icon + '" style="font-size: 2.5rem; color: ' + boost.color + '; filter:drop-shadow(0 0 10px ' + boost.color + ');"></i>' +
                    '</div>' +
                    '<div style="position: absolute; top: 0.8rem; right: 0.8rem; background: ' + boost.color + '; color: #000; font-weight: 900; padding: 3px 10px; border-radius: 4px; font-size:0.8rem; box-shadow:0 0 10px ' + boost.color + '; z-index:1;">x' + quantity + '</div>' +
                    '<h4 style="margin: 0; font-weight: 900; letter-spacing: 2px; font-size:0.8rem; color:#fff; position:relative; z-index:1;">' + boost.name + '</h4>' +
                '</div>';
        }).join("") + '</div>';
    }

    function buildLootboxGrid() {
        return '<div class="grid-3" style="padding: 5px 0;">' + inventoryData.lootboxes.map(function (box) {
            return '' +
                '<div class="premium-panel" style="display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem; text-align: center;">' +
                    '<div style="width: 120px; height: 120px; background: rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.1); border-radius: 20px; display: flex; justify-content: center; align-items: center; margin-bottom: 1.5rem; box-shadow: 0 0 50px ' + box.color + '22 inset;">' +
                        '<i class="fa-solid ' + box.icon + '" style="font-size: 4rem; color: ' + box.color + ';"></i>' +
                    '</div>' +
                    '<div style="font-weight: 900; font-size: 1.2rem; margin-bottom: 0.5rem;">' + box.name + '</div>' +
                    '<div style="color: rgba(255,255,255,0.5); margin-bottom: 1.5rem; font-size:0.9rem;"><i class="fa-solid fa-gem"></i> ' + box.value + ' Value</div>' +
                    '<button class="pill-btn" onclick="openLootbox(' + box.id + ')" style="width:100%; background:#fff; color:#000;">OPEN</button>' +
                '</div>';
        }).join("") + '</div>';
    }

    function buildProfileContent() {
        var skin = getActiveSkin();
        var nextXp = xpForLevel(State.economy.level);
        var xpPercent = State.economy.level >= 50 ? 100 : Math.max(0, Math.min(100, State.economy.xp / nextXp * 100));
        var skillRows = [
            { n: "MASS REGEN", c: "#ff4444", c2: "#ff0055", i: "fa-dumbbell", lv: 0, max: 5 },
            { n: "THRUST SPEED", c: "#00e5ff", c2: "#0088ff", i: "fa-bolt", lv: 0, max: 5 },
            { n: "SHIELD DURABILITY", c: "#ffaa00", c2: "#ff5500", i: "fa-shield-halved", lv: 0, max: 5 },
            { n: "FREEZE RADIUS", c: "#00e5ff", c2: "#0088ff", i: "fa-snowflake", lv: 0, max: 5 },
            { n: "SPIKE DAMAGE", c: "#ffaa00", c2: "#ff5500", i: "fa-certificate", lv: 0, max: 5 },
            { n: "EJECT FORCE", c: "#39ff14", c2: "#00aa00", i: "fa-arrow-right-from-bracket", lv: 0, max: 5 }
        ];
        return '' +
            '<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:1.5rem; padding:1.8rem; margin-bottom:1.5rem; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; flex-wrap:wrap; gap:2rem; align-items:stretch; min-height:300px; position:relative; overflow:hidden;">' +
                '<div style="position:absolute; inset:0; background:radial-gradient(circle at 10% 50%, rgba(0,229,255,0.05) 0%, transparent 50%); z-index:0;"></div>' +
                '<div style="display:flex; flex-direction:column; min-width:0; flex:1; position:relative; z-index:1;">' +
                    '<div style="color:#00e5ff; font-size:0.7rem; font-weight:800; letter-spacing:2px; margin-bottom:1rem; text-transform:uppercase;"><i class="fa-solid fa-address-card" style="margin-right:8px; filter:drop-shadow(0 0 5px rgba(0,229,255,0.5));"></i> DOSSIER</div>' +
                    '<div style="display:flex; align-items:flex-start; gap:1.5rem; margin-bottom:1.5rem;">' +
                        '<div style="width:80px; height:80px; border-radius:50%; background:rgba(0,229,255,0.1); border:2px solid rgba(0,229,255,0.5); display:flex; justify-content:center; align-items:center; box-shadow:0 0 20px rgba(0,229,255,0.2), inset 0 0 10px rgba(0,229,255,0.2); position:relative; flex-shrink:0; overflow:hidden;">' +
                            '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">' +
                            '<div style="position:absolute; bottom:-5px; background:linear-gradient(90deg,#0088ff,#00e5ff); color:#000; font-size:0.6rem; font-weight:900; padding:3px 10px; border-radius:12px; box-shadow:0 2px 5px rgba(0,0,0,0.5);">LVL ' + State.economy.level + '</div>' +
                        '</div>' +
                        '<div style="flex:1; min-width:0;">' +
                            '<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">' +
                                '<h2 style="margin:0; font-size:1.8rem; font-weight:900; text-transform:uppercase; letter-spacing:2px; text-shadow:0 2px 10px rgba(0,0,0,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(State.nick) + '</h2>' +
                            '</div>' +
                            '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">' +
                                '<span style="background:rgba(255,0,85,0.1); border:1px solid rgba(255,0,85,0.2); color:#ff0055; padding:4px 12px; border-radius:12px; font-size:0.65rem; font-weight:800; letter-spacing:1px; box-shadow:inset 0 0 5px rgba(255,0,85,0.2);">CLASS: ROOKIE</span>' +
                                '<span style="background:rgba(57,255,20,0.1); border:1px solid rgba(57,255,20,0.2); color:#39ff14; padding:4px 12px; border-radius:12px; font-size:0.65rem; font-weight:800; letter-spacing:1px; box-shadow:inset 0 0 5px rgba(57,255,20,0.2);">STATUS: ACTIVE</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex; justify-content:space-between; font-size:0.75rem; color:rgba(255,255,255,0.8); font-weight:800; letter-spacing:1px; margin-bottom:0.5rem;">' +
                        '<span>COMBAT XP</span><span style="color:#00e5ff; font-weight:900;">' + State.economy.xp + ' / ' + nextXp + '</span>' +
                    '</div>' +
                    '<div style="width:100%; height:8px; background:rgba(0,0,0,0.4); border-radius:4px; position:relative; box-shadow:inset 0 1px 4px rgba(0,0,0,0.6);">' +
                        '<div style="width:' + xpPercent + '%; height:100%; background:linear-gradient(90deg,#0088ff,#00e5ff); border-radius:4px; box-shadow:0 0 12px rgba(0,229,255,0.4);"></div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex; flex-direction:column; gap:1rem; flex:1; min-width:200px; position:relative; z-index:1;">' +
                    '<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:1.2rem; padding:1.5rem; position:relative;">' +
                        '<div style="font-size:0.7rem; color:rgba(255,255,255,0.5); font-weight:800; letter-spacing:1px; margin-bottom:0.8rem;">VAULT BALANCE</div>' +
                        '<div style="font-size:1.6rem; font-weight:900; color:#ffaa00; display:flex; align-items:center; gap:0.5rem; text-shadow:0 0 15px rgba(255,170,0,0.4);">' + formatCompact(State.economy.gems) + ' <i class="fa-solid fa-gem" style="color:#00e5ff; filter:drop-shadow(0 0 5px rgba(0,229,255,0.5));"></i></div>' +
                    '</div>' +
                    '<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:1.2rem; padding:1.5rem;">' +
                        '<div style="font-size:0.7rem; color:rgba(255,255,255,0.5); font-weight:800; letter-spacing:1px; margin-bottom:0.8rem;">CALLSIGN OVERRIDE</div>' +
                        '<div style="display:flex; gap:0.5rem;">' +
                            '<input id="profileNameInput" type="text" value="' + escapeAttribute(State.nick) + '" maxlength="15" style="flex:1; width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:0.8rem; color:#fff; font-family:\'Outfit\'; font-size:0.85rem; font-weight:800; outline:none; box-shadow:inset 0 1px 4px rgba(0,0,0,0.5);">' +
                            '<button onclick="saveProfile(this)" style="background:linear-gradient(90deg,#0088ff,#00e5ff); color:#000; border:none; padding:0 1.2rem; border-radius:12px; font-weight:900; letter-spacing:1px; cursor:pointer; box-shadow:0 4px 10px rgba(0,229,255,0.3); transition:0.3s;">SAVE</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<h3 style="margin:0 0 1rem 0; color:#fff; letter-spacing:2px; font-size:1.1rem; font-weight:800; padding-bottom:0.5rem; display:flex; align-items:center;"><i class="fa-solid fa-microchip" style="color:#00e5ff; margin-right:10px; filter:drop-shadow(0 0 5px rgba(0,229,255,0.5));"></i> COMBAT MODULES</h3>' +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">' +
                skillRows.map(function (skill) {
                    var pct = Math.max(0, Math.min(100, (skill.lv / skill.max) * 100));
                    return '' +
                        '<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:1.2rem; padding:1.2rem; display:flex; align-items:center; gap:1.2rem; transition:0.3s;">' +
                            '<div style="color:' + skill.c + '; width:42px; height:42px; border-radius:50%; font-size:1.2rem; display:flex; justify-content:center; align-items:center; background:rgba(255,255,255,0.05); box-shadow:inset 0 0 10px rgba(255,255,255,0.05);"><i class="fa-solid ' + skill.i + '" style="filter:drop-shadow(0 0 5px ' + skill.c + '88);"></i></div>' +
                            '<div style="flex:1;">' +
                                '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">' +
                                    '<div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem; font-weight:800; color:#fff; letter-spacing:1px;">' + skill.n + '</div>' +
                                    '<div style="flex-shrink:0; font-size:0.65rem; color:' + (skill.lv > 0 ? skill.c : 'rgba(255,255,255,0.3)') + '; font-weight:900;">LV.' + skill.lv + '</div>' +
                                '</div>' +
                                '<div style="width:100%; height:6px; background:rgba(0,0,0,0.4); border-radius:3px; position:relative; box-shadow:inset 0 1px 3px rgba(0,0,0,0.6);">' +
                                    '<div style="width:' + pct + '%; height:100%; background:linear-gradient(90deg,' + skill.c2 + ',' + skill.c + '); border-radius:3px; box-shadow:0 0 8px ' + skill.c + '88;"></div>' +
                                '</div>' +
                            '</div>' +
                        '</div>';
                }).join("") +
            '</div>';
    }

    function settingToggleRow(label, key) {
        var isOn = !!State.settings[key];
        return '' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">' +
                '<div>' +
                    '<div style="font-weight:800; letter-spacing:1px; font-size:0.85rem; color:#fff; margin-bottom:0.2rem;">' + escapeHtml(label) + '</div>' +
                    '<div style="font-size:0.65rem; color:rgba(255,255,255,0.4); font-weight:700; letter-spacing:0.5px;">Blobz gameplay preference</div>' +
                '</div>' +
                '<div data-setting-toggle="' + escapeAttribute(key) + '" onclick="toggleSetting(\'' + escapeAttribute(key) + '\')" style="width:54px; height:28px; border-radius:14px; background:' + (isOn ? 'linear-gradient(90deg, #0088ff, #00e5ff)' : 'rgba(255,255,255,0.1)') + '; position:relative; cursor:pointer; transition:0.3s; flex-shrink:0; box-shadow:' + (isOn ? 'inset 0 2px 5px rgba(0,0,0,0.3), 0 0 12px rgba(0,229,255,0.3)' : 'inset 0 2px 5px rgba(0,0,0,0.5)') + ';">' +
                    '<div style="width:22px; height:22px; background:#fff; border-radius:50%; position:absolute; top:3px; ' + (isOn ? 'right:3px;' : 'left:3px;') + ' transition:0.3s cubic-bezier(0.4,0,0.2,1); box-shadow:0 2px 5px rgba(0,0,0,0.4);"></div>' +
                '</div>' +
            '</div>';
    }

    function settingRangeRow(label, key, enabledKey) {
        var disabled = enabledKey && !State.settings[enabledKey];
        return '' +
            '<div style="margin-bottom:2rem; opacity:' + (disabled ? '0.45' : '1') + ';">' +
                '<div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; font-size:0.8rem; font-weight:800; letter-spacing:1px; color:rgba(255,255,255,0.8);"><span>' + escapeHtml(label) + '</span><span data-setting-value="' + escapeAttribute(key) + '" style="color:#00e5ff; font-weight:900;">' + Math.round(clampVolume(State.settings[key], 0) * 100) + '%</span></div>' +
                '<input data-setting-range="' + escapeAttribute(key) + '" oninput="updateSettingRange(\'' + escapeAttribute(key) + '\', this.value)" type="range" min="0" max="1" step="0.01" value="' + clampVolume(State.settings[key], 0) + '" ' + (disabled ? 'disabled' : '') + ' style="width:100%; cursor:pointer;">' +
            '</div>';
    }

    function settingKeyBindRow(label, action) {
        var binding = normalizeKeyBindings(State.settings.keyBindings)[action];
        return '' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem;">' +
                '<span style="letter-spacing: 1.5px; font-size:0.76rem;">' + escapeHtml(label) + '</span>' +
                '<button class="pill-btn" data-keybind-action="' + escapeAttribute(action) + '" onclick="beginKeyBind(\'' + escapeAttribute(action) + '\')" style="min-width:78px; padding:0.45rem 0.65rem; font-size:0.68rem; border-color:rgba(0,229,255,0.34); color:#00e5ff;">' + escapeHtml(keyLabel(binding)) + '</button>' +
            '</div>';
    }

    function joystickSideRow() {
        var side = normalizeJoystickSide(State.settings.joystickSide);
        return '' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">' +
                '<span style="letter-spacing: 1.5px; font-size:0.76rem;">MOBILE JOYSTICK</span>' +
                '<div style="display:flex; gap:0.35rem;">' +
                    ['left', 'right'].map(function (value) {
                        var active = side === value;
                        return '<button class="pill-btn" onclick="setJoystickSide(\'' + value + '\')" style="padding:0.45rem 0.65rem; font-size:0.66rem; border-color:' + (active ? '#00e5ff' : 'rgba(255,255,255,0.1)') + '; color:' + (active ? '#00e5ff' : 'rgba(255,255,255,0.55)') + '; background:' + (active ? 'rgba(0,229,255,0.1)' : 'transparent') + ';">' + value.toUpperCase() + '</button>';
                    }).join('') +
                '</div>' +
            '</div>';
    }

    function buildMobileActionShortcuts() {
        var dailyState = readDailyState();
        var claimedToday = dailyState.lastClaim === getTodayKey();
        var streak = Math.max(1, Math.min(7, Math.floor(Number(dailyState.streak) || 1)));
        return '' +
            '<div class="mobile-action-strip">' +
                '<button class="mobile-action-card" onclick="openModal(\'daily\')">' +
                    '<span class="mobile-action-icon"><i class="fa-solid fa-gift"></i></span>' +
                    '<span class="mobile-action-copy">' +
                        '<strong>DAILY DROP</strong>' +
                        '<small>' + (claimedToday ? 'Claimed today' : 'Day ' + streak + ' ready') + '</small>' +
                    '</span>' +
                    '<span class="mobile-action-status ' + (claimedToday ? 'is-claimed' : 'is-ready') + '">' + (claimedToday ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-arrow-right"></i>') + '</span>' +
                '</button>' +
            '</div>';
    }

    function buildSettingsContent() {
        return '' +
            buildMobileActionShortcuts() +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.5rem;">' +
                '<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:1.5rem; padding:1.8rem; box-shadow:0 10px 30px rgba(0,0,0,0.5);">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:1rem;">' +
                        '<h3 style="margin:0; font-weight:800; letter-spacing:2px; font-size:1.1rem; color:#fff;"><i class="fa-solid fa-volume-high" style="color:#00e5ff; margin-right:8px; filter:drop-shadow(0 0 5px rgba(0,229,255,0.5));"></i> AUDIO DECK</h3>' +
                    '</div>' +
                    settingToggleRow('SOUND EFFECTS', 'playSounds') +
                    '<div style="height:1.2rem;"></div>' +
                    settingRangeRow('SFX', 'soundsVolume', 'playSounds') +
                    settingToggleRow('MUSIC', 'playMusic') +
                    '<div style="height:1.2rem;"></div>' +
                    settingRangeRow('MUSIC', 'musicVolume', 'playMusic') +
                '</div>' +
                '<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:1.5rem; padding:1.8rem; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:1.25rem;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:1rem;">' +
                        '<h3 style="margin:0; font-weight:800; letter-spacing:2px; font-size:1.1rem; color:#fff;"><i class="fa-solid fa-gamepad" style="color:#ff00c8; margin-right:8px; filter:drop-shadow(0 0 5px rgba(255,0,200,0.5));"></i> SYSTEM PREFS</h3>' +
                    '</div>' +
                    settingToggleRow('JELLY PHYSICS', 'jellyPhysics') +
                    settingToggleRow('SKINS', 'showSkins') +
                    settingToggleRow('SPLIT MACRO', 'splitMacro') +
                    settingToggleRow('FEED MACRO', 'feedMacro') +
                    settingToggleRow('SHOW MASS', 'showMass') +
                    settingToggleRow('HIDE GRID', 'hideGrid') +
                    settingToggleRow('HIDE CHAT', 'hideChat') +
                    joystickSideRow() +
                '</div>' +
                '<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:1.5rem; padding:1.8rem; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:0.85rem;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:1rem;">' +
                        '<h3 style="margin:0; font-weight:800; letter-spacing:2px; font-size:1.1rem; color:#fff;"><i class="fa-solid fa-keyboard" style="color:#ffaa00; margin-right:8px; filter:drop-shadow(0 0 5px rgba(255,170,0,0.5));"></i> KEYBINDS</h3>' +
                    '</div>' +
                    settingKeyBindRow('SPLIT', 'split') +
                    settingKeyBindRow('EJECT MASS', 'eject') +
                    settingKeyBindRow('MAX SPLIT', 'maxSplit') +
                    settingKeyBindRow('FREEZE', 'freeze') +
                    settingKeyBindRow('SHIELD', 'shield') +
                    settingKeyBindRow('SPIKE', 'spike') +
                    settingKeyBindRow('SPECIAL', 'special') +
                '</div>' +
            '</div>';
    }

    function syncSettingsControls() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-setting-toggle]'), function (toggle) {
            var key = toggle.getAttribute('data-setting-toggle');
            var knob = toggle.firstElementChild;
            var isOn = !!State.settings[key];
            toggle.style.background = isOn ? 'linear-gradient(90deg, #0088ff, #00e5ff)' : 'rgba(255,255,255,0.1)';
            toggle.style.boxShadow = isOn ? 'inset 0 2px 5px rgba(0,0,0,0.3), 0 0 12px rgba(0,229,255,0.3)' : 'inset 0 2px 5px rgba(0,0,0,0.5)';
            if (knob) {
                knob.style.left = isOn ? 'auto' : '3px';
                knob.style.right = isOn ? '3px' : 'auto';
            }
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-setting-range]'), function (range) {
            var key = range.getAttribute('data-setting-range');
            var enabled = key === 'soundsVolume' ? State.settings.playSounds : key === 'musicVolume' ? State.settings.playMusic : true;
            range.value = clampVolume(State.settings[key], 0);
            range.disabled = !enabled;
            if (range.parentElement) range.parentElement.style.opacity = enabled ? '1' : '0.45';
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-setting-value]'), function (label) {
            var key = label.getAttribute('data-setting-value');
            label.textContent = Math.round(clampVolume(State.settings[key], 0) * 100) + '%';
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-keybind-action]'), function (button) {
            var action = button.getAttribute('data-keybind-action');
            button.textContent = keyLabel(normalizeKeyBindings(State.settings.keyBindings)[action]);
        });
    }

    function beginKeyBind(action) {
        var button = document.querySelector('[data-keybind-action="' + action + '"]');
        if (!Object.prototype.hasOwnProperty.call(defaultSettings.keyBindings, action)) return;
        if (button) button.textContent = "PRESS KEY";
        document.addEventListener("keydown", function captureKey(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                syncSettingsControls();
                return;
            }
            event.preventDefault();
            State.settings.keyBindings = normalizeKeyBindings(State.settings.keyBindings);
            State.settings.keyBindings[action] = event.code || defaultSettings.keyBindings[action];
            persistSettings();
            syncSettingsControls();
        }, { once: true });
    }

    function setJoystickSide(side) {
        State.settings.joystickSide = normalizeJoystickSide(side);
        persistSettings();
        openModal("settings");
    }

    function buildMarketContent() {
        var packs = [
            { n: "x10 SHIELDS", amount: 10, p: "900", b: "#00e5ff", off: "STANDARD", i: "fa-shield-halved", desc: "Basic protection module." },
            { n: "x20 SPIKES", amount: 20, p: "1.7K", b: "#ff4500", off: "HEAVY", i: "fa-certificate", desc: "Maximum offensive payload." }
        ];
        return '' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding:0 0.5rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.5rem;">' +
                '<div style="color:#ffaa00; font-size:0.7rem; font-weight:900; letter-spacing:2px; text-transform:uppercase;"><i class="fa-solid fa-clock" style="margin-right:4px;"></i> DAILY ROTATION</div>' +
                '<span style="font-size:0.7rem; font-weight:900; color:#fff; letter-spacing:1px;">LIVE OFFERS</span>' +
            '</div>' +
            '<div class="premium-panel" style="padding: 2rem 1.5rem; min-height:150px; text-align:left; position:relative; background:linear-gradient(135deg, rgba(57,255,20,0.1), rgba(0,0,0,0.8)); border-color:#39ff14; margin-bottom:1rem; overflow:hidden; display:flex; align-items:center; gap:1.5rem;">' +
                '<div style="position:absolute; inset:0; background:repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(57,255,20,0.03) 10px, rgba(57,255,20,0.03) 20px); z-index:0; pointer-events:none;"></div>' +
                '<div class="bundle-badge" style="background:#39ff14; color:#000; left:1rem; right:auto; transform:translateY(-50%); font-weight:900; letter-spacing:1px; font-size:0.7rem; padding:4px 12px; border-radius:4px; top:0;">BEST VALUE</div>' +
                '<div style="font-size:5rem; filter:drop-shadow(0 0 15px rgba(57,255,20,0.5)); color:#39ff14; position:relative; z-index:1; flex-shrink:0;"><i class="fa-solid fa-snowflake"></i></div>' +
                '<div style="flex:1; position:relative; z-index:1;">' +
                    '<div style="font-size:0.7rem; color:#39ff14; font-weight:900; letter-spacing:2px; margin-bottom:0.3rem;">TACTICAL ASSET</div>' +
                    '<h2 style="margin:0 0 0.5rem; font-size:1.8rem; font-weight:900; letter-spacing:1px; color:#fff;">x50 BOOSTS</h2>' +
                    '<div style="font-size:0.8rem; color:rgba(255,255,255,0.6); margin-bottom:1rem;">Adds +50 Shield, +50 Spikes, and +50 Freezes.</div>' +
                    '<button class="pill-btn" onclick="buyMarketItem(50, \'4K\', \'x50 BOOSTS\', this)" style="background:rgba(57,255,20,0.2); border:1px solid #39ff14; padding:0.6rem 1.5rem; font-size:1rem; color:#39ff14; font-weight:900; letter-spacing:1px;"><i class="fa-solid fa-gem" style="margin-right:4px;"></i> 4K</button>' +
                '</div>' +
            '</div>' +
            '<div class="grid-2" style="gap:1rem;">' + packs.map(function (pack) {
                return '' +
                    '<div class="premium-panel" style="padding: 1.5rem 1rem; text-align:center; position:relative; background:rgba(10,10,15,0.8); overflow:hidden; border:1px solid rgba(255,255,255,0.05);">' +
                        '<div style="position:absolute; top:0; left:0; right:0; height:2px; background:' + pack.b + '; box-shadow:0 0 10px ' + pack.b + ';"></div>' +
                        '<div style="font-size:0.6rem; color:' + pack.b + '; font-weight:900; letter-spacing:2px; margin-bottom:1rem; background:rgba(255,255,255,0.05); display:inline-block; padding:3px 10px; border-radius:4px;">' + pack.off + '</div>' +
                        '<div style="font-size:3rem; margin-bottom:1rem; filter:drop-shadow(0 0 10px ' + pack.b + '66); color:' + pack.b + ';"><i class="fa-solid ' + pack.i + '"></i></div>' +
                        '<h2 style="margin:0 0 0.3rem; font-size:1.1rem; font-weight:900; letter-spacing:1px; color:#fff;">' + pack.n + '</h2>' +
                        '<div style="font-size:0.7rem; color:rgba(255,255,255,0.4); margin-bottom:1rem; height:20px;">' + pack.desc + '</div>' +
                        '<button class="pill-btn" onclick="buyMarketItem(' + pack.amount + ', \'' + pack.p + '\', \'' + pack.n + '\', this)" style="background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); padding:0.6rem 1rem; font-size:0.9rem; width:100%; color:#fff; font-weight:900; letter-spacing:1px;"><i class="fa-solid fa-gem" style="color:#00e5ff; margin-right:4px;"></i> ' + pack.p + '</button>' +
                    '</div>';
            }).join("") + '</div>';
    }

    function getRankingSkin(index, preferredName) {
        if (preferredName) {
            var preferred = inventoryData.skins.find(function (skin) {
                return skin.name.toLowerCase() === preferredName.toLowerCase() || skin.displayName.toLowerCase() === preferredName.toLowerCase();
            });
            if (preferred) return preferred;
        }
        if (!inventoryData.skins.length) return buildSkinEntry(defaultSkinName, 1);
        return inventoryData.skins[index % inventoryData.skins.length] || inventoryData.skins[0];
    }

    function formatCups(value) {
        var cups = Math.max(0, Math.floor(Number(value) || 0));
        return cups.toLocaleString ? cups.toLocaleString("en-US") : String(cups);
    }

    function getRankingSeed(tab) {
        var active = getActiveSkin();
        var presets = {
            daily: [
                { name: "RunePilot", cups: 8600, skinIndex: 8 },
                { name: "LuxeMako", cups: 7900, skinIndex: 11 },
                { name: "JunoByte", cups: 7200, skinIndex: 5 },
                { name: "NeoVoid", cups: 6500, skinIndex: 2 },
                { name: "LunarHex", cups: 5900, skinIndex: 14 },
                { name: State.nick, cups: State.economy.cups, skin: active.name, current: true },
                { name: "OrbitAce", cups: 3800, skinIndex: 4 },
                { name: "PixelViper", cups: 3200, skinIndex: 7 }
            ],
            weekly: [
                { name: "EchoHarbor", cups: 18500, skinIndex: 10 },
                { name: "CrimsonJinx", cups: 17200, skinIndex: 3 },
                { name: "ShadowMint", cups: 16600, skinIndex: 6 },
                { name: "FrostVale", cups: 15400, skinIndex: 9 },
                { name: State.nick, cups: State.economy.cups, skin: active.name, current: true },
                { name: "HexMako", cups: 11800, skinIndex: 12 },
                { name: "NovaCell", cups: 10400, skinIndex: 1 },
                { name: "DaxCipher", cups: 9700, skinIndex: 15 }
            ],
            global: [
                { name: "StarLord", cups: 24500, skinIndex: 12 },
                { name: "HyperVoid", cups: 22100, skinIndex: 7 },
                { name: "Plasma", cups: 19800, skinIndex: 4 },
                { name: "AlphaPilot", cups: 15400, skinIndex: 9 },
                { name: "Zenith", cups: 14200, skinIndex: 15 },
                { name: "NeonGhost", cups: 13100, skinIndex: 5 },
                { name: State.nick, cups: State.economy.cups, skin: active.name, current: true },
                { name: "OrbitFox", cups: 10600, skinIndex: 2 }
            ]
        };
        var entries = (presets[tab] || presets.global).map(function (entry, index) {
            var skin = getRankingSkin(entry.skinIndex || index, entry.skin);
            return {
                rank: index + 1,
                name: sanitizeNick(entry.name) || "Pilot",
                cups: entry.cups,
                current: !!entry.current,
                skin: skin
            };
        });
        entries.sort(function (a, b) { return b.cups - a.cups; });
        entries.forEach(function (entry, index) { entry.rank = index + 1; });
        return entries;
    }

    function rankingAvatarHtml(entry, size) {
        return '' +
            '<div class="ranking-avatar" style="width:' + size + 'px; height:' + size + 'px; border-color:' + entry.skin.color + '; box-shadow:0 0 16px ' + entry.skin.color + '55;">' +
                '<img src="' + escapeAttribute(entry.skin.image) + '" alt="' + escapeAttribute(entry.name) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'">' +
            '</div>';
    }

    function renderRankingRow(entry) {
        return '' +
            '<div class="premium-panel ranking-row' + (entry.current ? ' is-current' : '') + '" style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem 1rem; border:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.5); position:relative; overflow:hidden;">' +
                '<div style="position:absolute; left:0; top:0; bottom:0; width:4px; background:' + (entry.current ? '#00e5ff' : 'rgba(255,255,255,0.2)') + ';"></div>' +
                '<div style="display:flex; align-items:center; gap:1rem; min-width:0; position:relative; z-index:1;">' +
                    '<div style="background:rgba(255,255,255,0.1); width:35px; height:35px; border-radius:4px; display:flex; justify-content:center; align-items:center; font-size:0.8rem; font-weight:900; color:#fff; border:1px solid rgba(255,255,255,0.2); box-shadow:0 0 10px rgba(0,0,0,0.5);">#' + entry.rank + '</div>' +
                    '<span style="font-weight:900; letter-spacing:1px; font-size:0.9rem; color:#fff; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(shortName(entry.name, 16)) + '</span>' +
                '</div>' +
                '<div style="font-weight:900; font-size:0.8rem; color:#00e5ff; letter-spacing:1px; z-index:1; white-space:nowrap;"><i class="fa-solid fa-trophy" style="color:#00e5ff; margin-right:6px;"></i> ' + formatCups(entry.cups) + '</div>' +
            '</div>';
    }

    function renderRankingPodium(entry, height) {
        var first = entry.rank === 1;
        var rankColor = first ? "#ffaa00" : entry.rank === 2 ? "#c0c0c0" : "#cd7f32";
        return '' +
            '<div class="ranking-podium-slot">' +
                '<div class="ranking-podium-rank" style="background:' + (first ? '#ffaa00' : 'rgba(255,255,255,0.1)') + '; color:' + (first ? '#000' : '#fff') + '; border-color:' + (first ? '#ffaa00' : 'rgba(255,255,255,0.2)') + '; letter-spacing:2px; border-radius:4px;">RANK ' + entry.rank + '</div>' +
                '<div style="width:' + (first ? 64 : 56) + 'px; height:' + (first ? 64 : 56) + 'px; border-radius:8px; background:linear-gradient(135deg, ' + entry.skin.color + '44, rgba(0,0,0,0.8)); border:2px solid ' + (first ? '#ffaa00' : 'rgba(255,255,255,0.2)') + '; display:flex; justify-content:center; align-items:center; margin-bottom:0.8rem; z-index:2; box-shadow:0 0 20px ' + entry.skin.color + '66; transform:rotate(45deg); overflow:hidden;">' +
                    '<img src="' + escapeAttribute(entry.skin.image) + '" alt="' + escapeAttribute(entry.name) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width:100%; height:100%; object-fit:cover; transform:rotate(-45deg) scale(1.42);">' +
                '</div>' +
                '<h4 class="ranking-podium-name" style="color:' + (first ? '#ffaa00' : '#fff') + '; text-transform:uppercase; letter-spacing:1px;">' + escapeHtml(shortName(entry.name, 12)) + '</h4>' +
                '<div class="premium-panel ranking-podium-base" style="height:' + height + 'px; background:linear-gradient(to bottom, rgba(20,20,30,0.8), rgba(0,0,0,0.9)); border-bottom-left-radius:0; border-bottom-right-radius:0; border-bottom:none; position:relative; overflow:hidden; ' + (first ? 'border-color:#ffaa00; box-shadow:0 -10px 30px rgba(255,170,0,0.2), inset 0 10px 20px rgba(255,170,0,0.1);' : 'border-color:' + rankColor + '44; box-shadow:inset 0 10px 20px rgba(0,0,0,0.5);') + '">' +
                    '<div style="position:absolute; top:0; left:0; right:0; height:4px; background:' + rankColor + '; box-shadow:0 0 10px ' + rankColor + ';"></div>' +
                    '<span class="ranking-podium-number" style="color:' + rankColor + ';">' + entry.rank + '</span>' +
                    '<span class="ranking-podium-cups"><i class="fa-solid fa-trophy" style="color:' + (first ? '#ffaa00' : '#00e5ff') + ';"></i> ' + formatCups(entry.cups) + '</span>' +
                '</div>' +
            '</div>';
    }

    function renderRankingContent(tab) {
        State.rankingTab = tab || "global";
        var entries = getRankingSeed(State.rankingTab);
        var activeColor = State.rankingTab === "global" ? "#00e5ff" : State.rankingTab === "weekly" ? "#ff0055" : "#ffaa00";
        var tabs = '<div style="display:flex; justify-content:center; margin-bottom:2rem; flex-shrink:0;">' +
            '<div class="ranking-tabs reference-tabs" style="display:flex; gap:0.5rem; background:rgba(0,0,0,0.6); padding:0.5rem; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">' +
            ["daily", "weekly", "global"].map(function (label) {
                var active = State.rankingTab === label;
                return '<button class="pill-btn" onclick="renderRankingContent(\'' + label + '\')" style="background:' + (active ? activeColor + '22' : 'transparent') + '; border:1px solid ' + (active ? activeColor : 'transparent') + '; color:' + (active ? activeColor : 'rgba(255,255,255,0.5)') + '; padding:0.6rem 1.5rem; font-size:0.75rem; border-radius:4px; font-weight:900; letter-spacing:1px; transition:0.2s;">' + label.toUpperCase() + '</button>';
            }).join("") +
            '</div></div>';
        var podium = '<div class="ranking-podium">' +
            renderRankingPodium(entries[1], 70) +
            renderRankingPodium(entries[0], 100) +
            renderRankingPodium(entries[2], 50) +
            '</div>';
        var rows = entries.slice(3).map(renderRankingRow).join("");
        modalContent.innerHTML = '' +
            tabs +
            podium +
            '<div class="ranking-heading">' +
                '<div>' +
                    '<div class="ranking-kicker"><i class="fa-solid fa-list-ol" style="margin-right:4px;"></i> COMBAT LOG</div>' +
                    '<div class="ranking-title">RANKS 4 - 8</div>' +
                '</div>' +
                '<span class="ranking-status">' + (State.rankingTab === "global" ? "LIVE LINK" : "ARCHIVE") + '</span>' +
            '</div>' +
            '<div class="ranking-list">' + rows + '</div>';
    }

    function getTodayKey() {
        var today = new Date();
        return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    }

    function readDailyState() {
        try {
            return JSON.parse(localStorage.getItem(storageKeys.daily) || "{}") || {};
        } catch (error) {
            return {};
        }
    }

    function writeDailyState(state) {
        try {
            localStorage.setItem(storageKeys.daily, JSON.stringify(state || {}));
        } catch (error) {}
    }

    function buildDailyContent() {
        var dailyState = readDailyState();
        var todayKey = getTodayKey();
        var claimedToday = dailyState.lastClaim === todayKey;
        var streak = Math.max(1, Math.min(7, Math.floor(Number(dailyState.streak) || 1)));
        var progressWidth = Math.max(0, Math.min(100, ((streak - 1) / 6) * 100));
        return '' +
            '<div class="daily-progress-strip" style="display:flex; flex-wrap:wrap; gap:1rem; position:relative; margin-bottom:2rem; justify-content:center;">' +
                '<div style="position:absolute; top:50%; left:5%; right:5%; height:4px; background:rgba(255,255,255,0.1); z-index:0; transform:translateY(-50%);"></div>' +
                '<div style="position:absolute; top:50%; left:5%; width:' + progressWidth + '%; max-width:90%; height:4px; background:#00e5ff; z-index:0; transform:translateY(-50%); box-shadow:0 0 10px #00e5ff;"></div>' +
                [1,2,3,4,5,6].map(function (day) {
                    var isClaimable = day === streak && !claimedToday;
                    var isClaimed = day < streak || (day === streak && claimedToday);
                    var icon = isClaimed ? "fa-check" : isClaimable ? "fa-gem" : "fa-lock";
                    return '' +
                        '<div style="position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:0.4rem; ' + (!isClaimed && !isClaimable ? 'opacity:0.5;' : '') + '">' +
                            '<div style="font-size:0.6rem; font-weight:900; letter-spacing:1px;">DAY ' + day + '</div>' +
                            '<div style="width:40px; height:40px; border-radius:50%; background:' + (isClaimed ? '#00e5ff' : isClaimable ? 'rgba(0,229,255,0.2)' : 'rgba(0,0,0,0.8)') + '; border:2px solid ' + (isClaimed || isClaimable ? '#00e5ff' : 'rgba(255,255,255,0.2)') + '; display:flex; justify-content:center; align-items:center; box-shadow:' + (isClaimable ? '0 0 15px rgba(0,229,255,0.5), inset 0 0 10px #00e5ff' : 'none') + '; cursor:' + (isClaimable ? 'pointer' : 'default') + ';" ' + (isClaimable ? 'onclick="claimDailyReward()"' : '') + '>' +
                                '<i class="fa-solid ' + icon + '" style="color:' + (isClaimed ? '#000' : isClaimable ? '#00e5ff' : 'rgba(255,255,255,0.5)') + '; font-size:1rem;"></i>' +
                            '</div>' +
                            '<div style="font-size:0.7rem; font-weight:900; color:' + (isClaimed || isClaimable ? '#00e5ff' : '#fff') + ';">' + (day * 50) + '</div>' +
                        '</div>';
                }).join("") +
            '</div>' +
            '<div class="premium-panel daily-reward-card" style="text-align:center; padding:1.5rem; background:radial-gradient(circle, rgba(255,170,0,0.2) 0%, rgba(20,20,30,0.8) 100%); border-color:#ffaa00; box-shadow:inset 0 0 30px rgba(255,170,0,0.1);">' +
                '<div class="bundle-badge" style="background:#ffaa00; color:#000;">DAY 7 MEGA DROP</div>' +
                '<i class="fa-solid fa-box-open daily-crate-icon" style="font-size:4rem; color:#ffaa00; filter:drop-shadow(0 5px 15px rgba(255,170,0,0.5)); margin-bottom:1rem;"></i>' +
                '<div style="font-weight:900; font-size:1.2rem; letter-spacing:2px; margin-bottom:0.5rem; color:#fff;">MYTHIC CRATE</div>' +
                '<div style="font-size:0.8rem; color:rgba(255,255,255,0.6); margin-bottom:1rem; font-weight:700;">Contains gems and power-up drops</div>' +
                '<button class="pill-btn" onclick="claimDailyReward()" ' + (claimedToday ? 'disabled' : '') + ' style="width:100%; background:' + (claimedToday ? 'rgba(0,0,0,0.5)' : 'rgba(0,229,255,0.15)') + '; border-color:' + (claimedToday ? 'rgba(255,255,255,0.2)' : '#00e5ff') + '; color:' + (claimedToday ? 'rgba(255,255,255,0.5)' : '#00e5ff') + '; font-size:0.9rem;">' + (claimedToday ? '<i class="fa-solid fa-lock" style="margin-right:8px;"></i> CLAIMED TODAY' : 'CLAIM REWARD') + '</button>' +
            '</div>';
    }

    function buildInviteContent() {
        return '' +
            '<div class="premium-panel" style="padding:1.5rem; text-align:center; background:rgba(0,229,255,0.05); border-color:rgba(0,229,255,0.3);">' +
                '<h2 style="margin:0 0 0.8rem; font-weight:600; letter-spacing:2px; font-size:1.2rem;">RECRUIT & EARN 10%</h2>' +
                '<div style="display:flex; gap:0.5rem; align-items:center;">' +
                    '<input type="text" value="blobz.io/j/VOID" readonly style="flex:1; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); border-radius:20px; padding:0.8rem 1rem; font-family:\'Outfit\'; font-size:0.9rem; color:#fff; outline:none;">' +
                    '<button class="pill-btn" onclick="var original=this.innerHTML; this.innerHTML=\'COPIED!\'; setTimeout(function(){ this.innerHTML=original; }.bind(this), 1000)" style="padding:0.8rem 1.5rem;"><i class="fa-regular fa-copy"></i></button>' +
                '</div>' +
            '</div>';
    }

    function buildTasksContent() {
        return '<div style="display:flex; flex-direction:column; gap:0.8rem; padding:0.5rem;">' + [
            { n: "SUBSCRIBE YOUTUBE", q: 500, i: "fa-youtube", brand: "fa-brands", bg: "#ff0000" },
            { n: "JOIN TELEGRAM", q: 300, i: "fa-telegram", brand: "fa-brands", bg: "#0088cc" },
            { n: "FOLLOW TWITTER", q: 300, i: "fa-x-twitter", brand: "fa-brands", bg: "#1da1f2" },
            { n: "VISIT BLOBZ.IO", q: 100, i: "fa-globe", brand: "fa-solid", bg: "#00e5ff" }
        ].map(function (task, index) {
            var claimed = State.tasks[index];
            var progress = claimed ? 100 : index === 0 ? 100 : 40 + index * 12;
            var canClaim = index === 0 && !claimed;
            return '' +
                '<div class="premium-panel" style="padding:1rem; display:flex; flex-direction:column; gap:1rem; border-left:4px solid ' + (claimed ? '#39ff14' : '#ffaa00') + '; position:relative; overflow:hidden; background:rgba(10,10,15,0.8);">' +
                    '<div style="position:absolute; inset:0; background:repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px); z-index:0; pointer-events:none;"></div>' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; z-index:1;">' +
                        '<div style="display:flex; align-items:center; gap:1rem; min-width:0;">' +
                            '<div style="width:40px; height:40px; border-radius:4px; background:rgba(255,255,255,0.05); display:flex; justify-content:center; align-items:center; font-size:1.4rem; color:' + task.bg + '; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;"><i class="' + task.brand + ' ' + task.i + '"></i></div>' +
                            '<div style="min-width:0;">' +
                                '<h3 style="margin:0 0 0.3rem; font-weight:900; letter-spacing:2px; font-size:0.9rem; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + task.n + '</h3>' +
                                '<div style="font-size:0.65rem; color:rgba(255,255,255,0.5); font-weight:900; letter-spacing:1px;">REWARD: <span style="color:#00e5ff;">' + task.q + ' GEMS</span></div>' +
                            '</div>' +
                        '</div>' +
                        '<button class="pill-btn" onclick="claimTask(' + index + ', ' + task.q + ', this)" style="' + (claimed ? 'background:#39ff14; color:#000; border-color:#39ff14;' : canClaim ? 'background:#00e5ff; color:#000; border-color:#00e5ff;' : 'background:rgba(255,170,0,0.1); color:#ffaa00; border-color:#ffaa00;') + ' padding:0.6rem 1.2rem; font-size:0.75rem; letter-spacing:1px;" ' + (!canClaim || claimed ? 'disabled' : '') + '>' + (claimed ? 'CLAIMED' : canClaim ? 'CLAIM REWARD' : 'IN PROGRESS') + '</button>' +
                    '</div>' +
                    '<div style="z-index:1;">' +
                        '<div style="display:flex; justify-content:space-between; font-size:0.6rem; font-weight:900; margin-bottom:0.4rem; color:' + (claimed ? '#39ff14' : '#fff') + ';">' +
                            '<span>MISSION STATUS</span><span>[ ' + Math.round(progress) + '% ]</span>' +
                        '</div>' +
                        '<div style="width:100%; height:6px; background:rgba(0,0,0,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">' +
                            '<div style="width:' + progress + '%; height:100%; background:' + (claimed ? '#39ff14' : '#ffaa00') + '; box-shadow:0 0 10px ' + (claimed ? '#39ff14' : '#ffaa00') + ';"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }).join("") + '</div>';
    }

    function toggleSetting(key) {
        if (!Object.prototype.hasOwnProperty.call(State.settings, key)) return;
        State.settings[key] = !State.settings[key];
        persistSettings();
        syncSettingsControls();
    }

    function updateSettingRange(key, value) {
        if (!Object.prototype.hasOwnProperty.call(State.settings, key)) return;
        State.settings[key] = clampVolume(value, defaultSettings[key]);
        persistSettings();
        syncSettingsControls();
    }

    function saveProfile(btn) {
        var input = document.getElementById("profileNameInput");
        if (input) State.nick = sanitizeNick(input.value) || "BitGraf";
        persistProfile();
        updateShell();
        if (btn) {
            var previous = btn.innerText;
            btn.innerText = "SAVED";
            btn.style.background = "#39ff14";
            btn.style.color = "#000";
            setTimeout(function () {
                btn.innerText = previous || "SAVE";
                btn.style.background = "rgba(255,255,255,0.1)";
                btn.style.color = "#fff";
            }, 1400);
        }
    }

    function claimTask(index, reward, btn) {
        if (isBackendAccount()) {
            showOnlineEconomyPending();
            return;
        }
        if (State.tasks[index]) return;
        State.tasks[index] = true;
        State.economy.gems += Number(reward) || 0;
        persistEconomy();
        if (btn) {
            btn.innerHTML = 'CLAIMED <i class="fa-solid fa-check"></i>';
            btn.style.background = '#39ff14';
            btn.style.color = '#000';
            btn.style.borderColor = '#39ff14';
        }
        updateGemDisplay();
    }

    function buyMarketItem(amount, price, name, btn) {
        var html = '' +
            '<div style="font-size: 4rem; color: #00e5ff; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(0,229,255,0.5));"><i class="fa-solid fa-gem"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900; text-align:center;">' + escapeHtml(name) + '</h2>' +
            '<div style="font-size:0.75rem; color: rgba(255,255,255,0.55); margin-bottom:1.5rem; text-align:center; letter-spacing:1px;">+' + amount + ' EACH BOOST TYPE</div>' +
            '<button class="pill-btn" onclick="completePurchase(' + Number(amount || 0) + ', \'' + escapeAttribute(name) + '\', \'' + escapeAttribute(price) + '\')" style="width:100%; background:#fff; color:#000; border:none;">CONFIRM ' + escapeHtml(price) + ' GEMS</button>';
        showPopup(html, 'border-color:#00e5ff; box-shadow: 0 15px 50px rgba(0,229,255,0.3);');
    }

    function completePurchase(amount, name, price) {
        if (isBackendAccount()) {
            showOnlineEconomyPending();
            return;
        }
        var cost = parseCompactAmount(price);
        amount = Math.max(0, Math.floor(Number(amount) || 0));
        if (State.economy.gems < cost) {
            showPopup(
                '<div style="font-size: 4rem; color: #ff4d68; margin-bottom: 1rem;"><i class="fa-solid fa-circle-exclamation"></i></div>' +
                '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900; text-align:center;">NOT ENOUGH GEMS</h2>' +
                '<div style="font-size:0.8rem; color: rgba(255,255,255,0.6); margin-bottom:1.5rem; text-align:center;">You need ' + escapeHtml(price) + ' gems for this pack.</div>' +
                '<button class="pill-btn" onclick="closePopup()" style="width:100%; background:#fff; color:#000; border:none;">OK</button>',
                'border-color:#ff4d68; box-shadow: 0 15px 50px rgba(255,77,104,0.25);'
            );
            return;
        }
        State.economy.gems -= cost;
        State.economy.boosts.shield += amount;
        State.economy.boosts.spike += amount;
        State.economy.boosts.freeze += amount;
        persistEconomy();
        updateShell();
        var html = '' +
            '<div style="font-size: 4rem; color: #39ff14; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(57,255,20,0.5));"><i class="fa-solid fa-check-circle"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900; text-align:center;">PURCHASED</h2>' +
            '<div style="font-size:0.8rem; color: rgba(255,255,255,0.6); margin-bottom:1.5rem; text-align:center;">' + escapeHtml(name) + ' added to your boosts.</div>' +
            '<button class="pill-btn" onclick="closePopup()" style="width:100%; background:#39ff14; color:#000; border:none;">OK</button>';
        showPopup(html, 'border-color:#39ff14; box-shadow: 0 15px 50px rgba(57,255,20,0.25);');
        if (State.activeModal === "inventory" && State.activeInventoryTab === "boosts") renderInventoryContent("boosts");
    }

    function claimDailyReward() {
        if (isBackendAccount()) {
            showOnlineEconomyPending();
            return;
        }
        var dailyState = readDailyState();
        var todayKey = getTodayKey();
        var streak = Math.max(1, Math.min(7, Math.floor(Number(dailyState.streak) || 1)));
        var reward = streak * 50;
        if (dailyState.lastClaim === todayKey) {
            showPopup(
                '<div style="font-size: 4rem; color: #ffaa00; margin-bottom: 1rem;"><i class="fa-solid fa-clock"></i></div>' +
                '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900;">ALREADY CLAIMED</h2>' +
                '<div style="font-size:0.85rem; color: rgba(255,255,255,0.6); margin-bottom:1.5rem; text-align:center;">Come back tomorrow for the next drop.</div>' +
                '<button class="pill-btn" style="width:100%; background:#fff; color:#000; border:none;" onclick="closePopup()">OK</button>',
                'border-color:#ffaa00; box-shadow: 0 15px 50px rgba(255,170,0,0.25);'
            );
            return;
        }
        var html = '' +
            '<div style="font-size: 4rem; color: #00e5ff; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(0,229,255,0.5));"><i class="fa-solid fa-gem"></i></div>' +
            '<h2 style="color: #00e5ff; font-size: 2rem; margin:0 0 0.5rem; font-weight:900;">CLAIMED!</h2>' +
            '<div style="font-size:0.9rem; color: #fff; margin: 0 0 1.5rem; text-align:center;">Daily Drop Acquired <br><span style="color:#ffaa00; font-size: 1.5rem; font-weight:900;">+' + reward + ' GEMS</span></div>' +
            '<button class="pill-btn" style="width:100%; background:#00e5ff; color:#000; border:none;" onclick="closePopup()">AWESOME</button>';
        State.economy.gems += reward;
        dailyState.lastClaim = todayKey;
        dailyState.streak = streak >= 7 ? 1 : streak + 1;
        writeDailyState(dailyState);
        persistEconomy();
        updateGemDisplay();
        if (State.activeModal === "daily") openModal("daily");
        showPopup(html, 'border-color:#00e5ff; box-shadow: 0 15px 50px rgba(0,229,255,0.3);');
    }

    function openLootbox(id) {
        if (isBackendAccount()) {
            showOnlineEconomyPending();
            return;
        }
        var colors = ['#39ff14', '#00ddff', '#ffaa00'];
        var icons = ['fa-box', 'fa-box-open', 'fa-gem'];
        var color = colors[(Number(id) - 1) % colors.length] || '#39ff14';
        var icon = icons[(Number(id) - 1) % icons.length] || 'fa-box';
        showPopup(
            '<div id="chest-anim" style="font-size: 6rem; color: ' + color + '; margin: 1rem 0 1.5rem; filter: drop-shadow(0 6px 15px ' + color + '66); transition: transform 0.1s;"><i class="fa-solid ' + icon + '"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.5rem; margin:0 0 1rem; font-weight:900; letter-spacing:2px;" id="chest-text">OPENING...</h2>',
            'border-color:' + color + '; box-shadow: 0 15px 50px ' + color + '44;'
        );
        var shakes = 0;
        var timer = setInterval(function () {
            var iconEl = document.getElementById('chest-anim');
            if (!iconEl) {
                clearInterval(timer);
                return;
            }
            iconEl.style.transform = 'rotate(' + (shakes % 2 === 0 ? '15deg' : '-15deg') + ') scale(' + (1.1 + shakes * 0.01) + ')';
            shakes++;
            if (shakes > 10) {
                clearInterval(timer);
                dialogueCard.innerHTML = '' +
                    '<div style="font-size: 5rem; color: #ffaa00; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(255,170,0,0.5)); transform: scale(0); animation: popIn 0.4s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);"><i class="fa-solid fa-star"></i></div>' +
                    '<h2 style="color: #ffaa00; font-size: 2rem; margin:0 0 0.5rem; font-weight:900;">REWARD!</h2>' +
                    '<div style="font-size:1.2rem; color: #fff; margin: 0 0 1.5rem; text-align:center; font-weight:900; letter-spacing:1px;"><span style="color:#00e5ff;">+150 GEMS</span></div>' +
                    '<button class="pill-btn" style="width:100%; background:#ffaa00; color:#000; border:none;" onclick="closePopup()">COLLECT</button>' +
                    '<style>@keyframes popIn { to { transform: scale(1); } }</style>';
                State.economy.gems += 150;
                persistEconomy();
                updateGemDisplay();
            }
        }, 95);
    }

    function writeLaunchAndGo(mode, world) {
        persistProfile();
        persistSettings();
        try {
            sessionStorage.setItem(launchStorageKey, JSON.stringify({
                mode: mode === "spectate" ? "spectate" : "play",
                nick: State.nick,
                skin: State.skin,
                online: isBackendAccount(),
                playerId: State.account.player && State.account.player.id ? State.account.player.id : null,
                playerSkinId: getActiveSkin() && getActiveSkin().playerSkinId ? getActiveSkin().playerSkinId : null,
                world: world || null,
                timestamp: Date.now()
            }));
        } catch (error) {}
        window.location.href = "/game.html";
    }

    function launchGame(mode) {
        if (!window.blobzApi || typeof window.blobzApi.assignWorld !== "function") {
            writeLaunchAndGo(mode);
            return;
        }

        window.blobzApi.assignWorld({ mode: "classic", region: "eu" }).then(function (payload) {
            writeLaunchAndGo(mode, payload && payload.world ? payload.world : null);
        }).catch(function () {
            writeLaunchAndGo(mode);
        });
    }

    function initHyperspaceBackground() {
        var hyperspace = document.getElementById("hyperspaceBg");
        if (!hyperspace || hyperspace.dataset.ready === "true") return;
        hyperspace.dataset.ready = "true";
        var compact = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
        var count = compact ? 20 : 40;
        for (var i = 0; i < count; i += 1) {
            var star = document.createElement("div");
            star.className = "star-streak";
            star.style.setProperty("--angle", (Math.random() * 360).toFixed(2) + "deg");
            star.style.width = (Math.random() * 80 + 20).toFixed(1) + "px";
            star.style.animationDuration = (Math.random() * 2 + 1).toFixed(2) + "s";
            star.style.animationDelay = (Math.random() * 2).toFixed(2) + "s";
            hyperspace.appendChild(star);
        }
    }

    function bindEvents() {
        if (modalOverlay) {
            modalOverlay.addEventListener("click", function (event) {
                if (event.target === modalOverlay) closeModal();
            });
        }
        if (dialogueOverlay) {
            dialogueOverlay.addEventListener("click", function (event) {
                if (event.target === dialogueOverlay) closePopup();
            });
        }
        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape") return;
            if (dialogueOverlay && dialogueOverlay.classList.contains("active")) {
                closePopup();
                return;
            }
            if (modalOverlay && modalOverlay.classList.contains("active")) closeModal();
        });
    }

    function init() {
        rebuildSkins([]);
        persistProfile();
        persistEconomy();
        persistSettings();
        updateShell();
        initHyperspaceBackground();
        bindEvents();
        loadSkins();
        syncBackendAccount();
        updateNavState("home");
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
    window.showPopup = showPopup;
    window.closePopup = closePopup;
    window.openSkinPopup = openSkinPopup;
    window.confirmUseSkin = confirmUseSkin;
    window.renderInventoryContent = renderInventoryContent;
    window.loadMoreSkins = loadMoreSkins;
    window.renderRankingContent = renderRankingContent;
    window.toggleSetting = toggleSetting;
    window.updateSettingRange = updateSettingRange;
    window.beginKeyBind = beginKeyBind;
    window.setJoystickSide = setJoystickSide;
    window.saveProfile = saveProfile;
    window.claimTask = claimTask;
    window.buyMarketItem = buyMarketItem;
    window.completePurchase = completePurchase;
    window.claimDailyReward = claimDailyReward;
    window.openLootbox = openLootbox;
    window.launchGame = launchGame;

    init();
})();
