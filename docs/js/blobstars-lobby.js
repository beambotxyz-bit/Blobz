(function () {
    var storageKeys = {
        nick: "blobznick",
        skin: "blobzskin"
    };
    var legacyKeys = {
        nick: "agarv1nick",
        skin: "agarv1skin"
    };
    var launchStorageKey = "blobzLaunch";
    var defaultSkinName = "Base";
    var gemBalance = 42400;
    var gemBalanceLabel = "42.4K";
    var defaultSettings = {
        playSounds: true,
        soundsVolume: 0.45,
        playMusic: false,
        musicVolume: 0.28,
        jellyPhysics: true,
        splitMacro: true,
        feedMacro: true,
        showMass: false,
        hideGrid: false,
        hideChat: false,
        showSkins: true
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
        gems: gemBalance,
        tasks: [false, false, false, false],
        rankingTab: "global",
        activeModal: null,
        activeInventoryTab: "skins",
        activeSkinId: 1,
        pendingSkinId: null,
        nick: sanitizeNick(getStoredValue(storageKeys.nick, legacyKeys.nick)) || "BitGraf",
        skin: sanitizeSkin(getStoredValue(storageKeys.skin, legacyKeys.skin)),
        settings: readStoredSettings()
    };

    var inventoryData = {
        skins: [],
        boosts: [
            { name: "SHIELD", color: "#00e5ff", icon: "fa-shield-halved", quantity: 29 },
            { name: "FREEZE", color: "#39ff14", icon: "fa-snowflake", quantity: 19 },
            { name: "SPIKE", color: "#ff4500", icon: "fa-sun", quantity: 17 }
        ],
        lootboxes: [
            { id: 1, name: "Supply Crate", color: "#00e5ff", icon: "fa-box-open", value: "26,318" },
            { id: 2, name: "Void Crate", color: "#9400d3", icon: "fa-cube", value: "44,200" },
            { id: 3, name: "Star Vault", color: "#ffaa00", icon: "fa-gem", value: "71,500" }
        ]
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
            showSkins: parseToggle(parsed.showSkins, defaultSettings.showSkins)
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
            raw[key] = key.indexOf("Volume") !== -1 ? clampVolume(State.settings[key], defaultSettings[key]) : !!State.settings[key];
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
            image: skinUrl(id === 1 ? defaultSkinName : name)
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

    function loadSkins() {
        rebuildSkins([]);
        fetch("/skinList.txt", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) throw new Error("skinList failed");
                return response.text();
            })
            .then(function (text) {
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
        if (gemAmount) gemAmount.textContent = gemBalanceLabel;
    }

    function updateShell() {
        var activeSkin = getActiveSkin();
        if (profileName) profileName.textContent = State.nick.toUpperCase();
        if (profileTag) profileTag.textContent = State.activeSkinId === 1 ? "LVL 42" : "ACTIVE";
        if (profileProgressBar) profileProgressBar.style.width = State.activeSkinId === 1 ? "65%" : "78%";
        if (profileAvatar) {
            profileAvatar.src = activeSkin.image;
            profileAvatar.onerror = function () {
                profileAvatar.src = skinUrl(defaultSkinName);
            };
        }
        updateGemDisplay();
    }

    function updateNavState(index) {
        navItems.forEach(function (item, itemIndex) {
            item.classList.toggle("active", itemIndex === index || (index === -1 && item.getAttribute("data-modal") === "home"));
        });
    }

    function openModal(type) {
        State.activeModal = type;
        if (!modalOverlay || !modalTitle || !modalContent) return;
        modalOverlay.style.display = "flex";
        window.requestAnimationFrame(function () { modalOverlay.classList.add("active"); });

        if (type === "profile") {
            updateNavState(-1);
            modalTitle.innerText = "PROFILE HUB";
            modalContent.innerHTML = buildProfileContent();
            return;
        }
        if (type === "settings") {
            updateNavState(-1);
            modalTitle.innerText = "SETTINGS";
            modalContent.innerHTML = buildSettingsContent();
            syncSettingsControls();
            return;
        }
        if (type === "inventory") {
            updateNavState(0);
            modalTitle.innerText = "SUPPLY / ASSETS";
            renderInventoryContent(State.activeInventoryTab || "skins");
            return;
        }
        if (type === "market") {
            updateNavState(1);
            modalTitle.innerText = "SPECIAL OFFERS";
            modalContent.innerHTML = buildMarketContent();
            return;
        }
        if (type === "ranking") {
            updateNavState(3);
            modalTitle.innerText = "RANKING HUB";
            renderRankingContent(State.rankingTab || "global");
            return;
        }
        if (type === "daily") {
            updateNavState(-1);
            modalTitle.innerText = "DAILY DROP";
            modalContent.innerHTML = buildDailyContent();
            return;
        }
        if (type === "invite") {
            updateNavState(-1);
            modalTitle.innerText = "INVITE FRIENDS";
            modalContent.innerHTML = buildInviteContent();
            return;
        }
        if (type === "tasks") {
            updateNavState(4);
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
        updateNavState(-1);
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
            '<div style="width: 100px; height: 100px; border-radius: 50%; margin-bottom: 1.5rem; background: #000; border: 2px solid ' + escapeAttribute(skin.color) + '; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 25px ' + escapeAttribute(skin.color) + '55, inset 0 0 18px rgba(255,255,255,0.04); position: relative; overflow: visible;">' +
                '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; display: block;">' +
                '<div style="position:absolute; inset: 0; border-radius: 50%; pointer-events:none; box-shadow: inset 0 10px 18px rgba(255,255,255,0.08), inset 0 -16px 18px rgba(0,0,0,0.35);"></div>' +
            '</div>' +
            '<div style="font-size: 0.65rem; font-weight: 900; padding: 4px 12px; border-radius: 12px; background: ' + escapeAttribute(skin.color) + '; color: ' + (skin.rarity === "LEGEND" ? "#000" : "#fff") + '; margin-bottom: 0.8rem; letter-spacing: 1px;">' + escapeHtml(skin.rarity) + '</div>' +
            '<h2 style="margin: 0 0 0.3rem; font-size: 1.4rem; font-weight: 900; color: #fff; text-align:center;">' + escapeHtml(skin.displayName) + '</h2>' +
            '<div style="font-size: 0.6rem; color: rgba(255,255,255,0.4); font-weight: 800; letter-spacing: 2px; margin-bottom: 1.5rem; text-transform: uppercase; text-align:center;">Unlocked for Alpha</div>' +
            '<button class="pill-btn" onclick="confirmUseSkin()" style="width: 100%; background: #ffffff; color: #000000; padding: 0.9rem; border-radius: 14px; font-size: 0.95rem; font-weight: 900; letter-spacing: 1px; border: none; box-shadow: 0 4px 15px rgba(255,255,255,0.15);">EQUIP</button>';
        showPopup(html, "border-color:" + skin.color + "; box-shadow: 0 15px 50px " + skin.color + "33;");
    }

    function confirmUseSkin() {
        var skin = inventoryData.skins.find(function (entry) { return entry.id === Number(State.pendingSkinId); });
        if (skin) {
            State.activeSkinId = skin.id;
            State.skin = skin.id === 1 ? "" : skin.name;
            persistProfile();
            updateShell();
            if (State.activeModal === "inventory") renderInventoryContent(State.activeInventoryTab || "skins");
            if (State.activeModal === "profile") openModal("profile");
        }
        closePopup();
    }

    function renderInventoryContent(tab) {
        State.activeInventoryTab = tab || "skins";
        if (!modalContent) return;
        var tabsWrap = document.createElement("div");
        tabsWrap.style.cssText = "display: flex; gap: 0.5rem; margin-bottom: 1rem; overflow-x: auto; padding-bottom: 5px; flex-shrink: 0;";
        ["SKINS", "BOOSTS", "LOOTBOXES"].forEach(function (label) {
            var lower = label.toLowerCase();
            var btn = document.createElement("button");
            btn.className = "pill-btn";
            btn.innerText = label;
            btn.style.cssText = "font-size: 0.8rem; padding: 0.8rem 1.5rem; " + (State.activeInventoryTab === lower ? "border-color:#00e5ff; color:#00e5ff; background:rgba(0,229,255,0.1);" : "color: rgba(255,255,255,0.5);");
            btn.onclick = function () { renderInventoryContent(lower); };
            tabsWrap.appendChild(btn);
        });
        modalContent.innerHTML = "";
        modalContent.appendChild(tabsWrap);

        if (State.activeInventoryTab === "skins") {
            modalContent.insertAdjacentHTML("beforeend", buildSkinGrid());
        } else if (State.activeInventoryTab === "boosts") {
            modalContent.insertAdjacentHTML("beforeend", buildBoostGrid());
        } else {
            modalContent.insertAdjacentHTML("beforeend", buildLootboxGrid());
        }
    }

    function buildSkinGrid() {
        return '<div class="grid-4" style="padding: 5px 0;">' + inventoryData.skins.map(function (skin) {
            var active = skin.id === State.activeSkinId;
            return '' +
                '<div class="premium-panel" onclick="openSkinPopup(' + skin.id + ')" style="padding: 1.5rem 0.5rem; text-align: center; position: relative; cursor: pointer; border-color: ' + (active ? skin.color : 'rgba(255,255,255,0.05)') + '; background: ' + (active ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,30,0.4)') + ';">' +
                    '<div class="id-ribbon">#' + skin.id + '</div>' +
                    '<div style="width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 1.5rem; background: #000; border: 2px solid ' + skin.color + '; display: flex; justify-content: center; align-items: center; position: relative; box-shadow: 0 0 15px ' + skin.color + '55; overflow: visible;">' +
                        '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; object-position: center; display: block;">' +
                        '<div class="rarity-tag" style="background: ' + skin.color + '; color: ' + (skin.rarity === "LEGEND" ? "#000" : "#fff") + ';">' + escapeHtml(skin.rarity) + '</div>' +
                    '</div>' +
                    '<h4 style="margin: 0; font-weight: 700; letter-spacing: 1px; font-size: 0.9rem; color: #fff;">' + escapeHtml(shortName(skin.displayName, 18)) + '</h4>' +
                    (active ? '<div style="margin-top:0.5rem; font-size:0.7rem; color:' + skin.color + '; font-weight:700;">ACTIVE</div>' : '') +
                '</div>';
        }).join("") + '</div>';
    }

    function buildBoostGrid() {
        return '<div class="grid-3" style="padding: 5px 0;">' + inventoryData.boosts.map(function (boost) {
            return '' +
                '<div class="premium-panel" style="padding: 1.5rem 1rem; text-align: center; position: relative;">' +
                    '<div style="width: 70px; height: 70px; border-radius: 16px; margin: 0 auto 1rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center; box-shadow: inset 0 0 20px ' + boost.color + '33;">' +
                        '<i class="fa-solid ' + boost.icon + '" style="font-size: 2rem; color: ' + boost.color + ';"></i>' +
                    '</div>' +
                    '<div style="position: absolute; top: 0.5rem; right: 0.5rem; background: ' + boost.color + '; color: #000; font-weight: 900; padding: 2px 8px; border-radius: 10px; font-size:0.8rem;">x' + boost.quantity + '</div>' +
                    '<h4 style="margin: 0; font-weight: 700; letter-spacing: 2px; font-size:0.9rem;">' + boost.name + '</h4>' +
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
        return '' +
            '<div class="premium-panel grid-2 profile-hero" style="padding: 1.5rem; margin-bottom: 1.5rem; align-items: stretch; gap: 2rem; flex-shrink:0;">' +
                '<div style="display: flex; flex-direction: column; min-width: 0;">' +
                    '<div style="color: #00e5ff; font-size: 0.65rem; font-weight: 900; letter-spacing: 2px; margin-bottom: 0.5rem; text-transform: uppercase;">Active Pilot</div>' +
                    '<div style="display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">' +
                        '<div style="width: 70px; height: 70px; border-radius: 16px; background: linear-gradient(180deg, rgba(0,229,255,0.2), rgba(0,0,0,0.5)); border: 1px solid rgba(0,229,255,0.3); display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: 0 0 20px rgba(0,229,255,0.1); flex-shrink: 0;">' +
                            '<img src="' + escapeAttribute(skin.image) + '" alt="' + escapeAttribute(skin.displayName) + '" onerror="this.src=\'' + escapeAttribute(skinUrl(defaultSkinName)) + '\'" style="width:54px;height:54px;border-radius:50%;object-fit:cover;">' +
                        '</div>' +
                        '<div style="flex: 1; min-width: 0;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 0.7rem;">' +
                                '<h2 style="margin: 0; font-size: 1.5rem; font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(State.nick) + '</h2>' +
                                '<span style="font-size: 0.6rem; font-weight: 900; background: rgba(0,229,255,0.15); color: #00e5ff; padding: 4px 8px; border-radius: 12px; border: 1px solid rgba(0,229,255,0.3); white-space:nowrap;">LVL 1</span>' +
                            '</div>' +
                            '<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">' +
                                '<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px; font-size: 0.6rem; font-weight: 700;">ROOKIE PILOT</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700; margin-bottom: 0.3rem;">' +
                        '<span>XP PROGRESS</span><span>0 / 700</span>' +
                    '</div>' +
                    '<div style="width: 100%; height: 8px; background: rgba(0,0,0,0.5); border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden;">' +
                        '<div style="width: 25%; height: 100%; background: #00e5ff; border-radius: 10px;"></div>' +
                    '</div>' +
                '</div>' +
                '<div style="display: flex; flex-direction: column; gap: 1rem; padding-left: 1rem; border-left: 1px solid rgba(255,255,255,0.05);">' +
                    '<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1rem;">' +
                        '<div style="font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700; letter-spacing: 1px; margin-bottom: 0.5rem;">GEM BALANCE</div>' +
                        '<div class="gem-pill" style="font-size: 1.2rem; font-weight: 900; color: #ffaa00; padding:0; border:none; background:none; box-shadow:none; backdrop-filter:none;">' + gemBalanceLabel + ' <i class="fa-solid fa-gem" style="color:#00e5ff;"></i></div>' +
                    '</div>' +
                    '<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1rem;">' +
                        '<div style="font-size: 0.65rem; color: rgba(255,255,255,0.5); font-weight: 700; letter-spacing: 1px; margin-bottom: 0.5rem;">PILOT NAME</div>' +
                        '<div style="display: flex; gap: 0.5rem;">' +
                            '<input id="profileNameInput" type="text" value="' + escapeAttribute(State.nick) + '" maxlength="15" style="flex:1; width:100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 0.6rem; color: #fff; font-family: \'Outfit\'; font-size: 0.8rem; font-weight: 600; outline: none;">' +
                            '<button class="pill-btn" onclick="saveProfile(this)" style="border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; border: none; padding: 0 1rem; font-size:0.7rem;">SAVE</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<h3 style="margin: 0; text-align: center; color: #00e5ff; letter-spacing: 2px; font-size: 1rem;"><i class="fa-solid fa-vial"></i> SKILLS</h3>' +
            '<div class="grid-3" style="gap: 0.8rem; display: grid;">' +
                [
                    { n: "MASS", c: "#ff4444", i: "fa-dumbbell" },
                    { n: "SPEED", c: "#00ddff", i: "fa-bolt" },
                    { n: "SHIELD", c: "#ffaa00", i: "fa-shield-halved" },
                    { n: "FREEZE", c: "#00ddff", i: "fa-snowflake" },
                    { n: "SPIKE", c: "#ffaa00", i: "fa-certificate" },
                    { n: "EJECT", c: "#39ff14", i: "fa-arrow-right-from-bracket" }
                ].map(function (skill) {
                    return '' +
                        '<div class="skill-card premium-panel" style="padding: 1rem;">' +
                            '<div class="skill-icon" style="color: ' + skill.c + '; width: 45px; height: 45px; font-size:1.3rem; margin-bottom: 0.5rem;"><i class="fa-solid ' + skill.i + '"></i></div>' +
                            '<div style="font-size: 0.8rem; font-weight: 900; text-align:center; color:#fff; letter-spacing:1px; margin-bottom: 0.5rem;">' + skill.n + '</div>' +
                            '<button class="pill-btn" onclick="alert(\'Upgrade required!\')" style="width: 100%; padding: 0.4rem; font-size: 0.65rem; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.8);">LV.0 UPGRADE</button>' +
                        '</div>';
                }).join("") +
            '</div>';
    }

    function settingToggleRow(label, key) {
        var isOn = !!State.settings[key];
        return '' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem;">' +
                '<span style="letter-spacing: 2px; font-size:0.8rem;">' + escapeHtml(label) + '</span>' +
                '<div data-setting-toggle="' + escapeAttribute(key) + '" onclick="toggleSetting(\'' + escapeAttribute(key) + '\')" style="width:40px; height:22px; border-radius:12px; background:' + (isOn ? '#00e5ff' : 'rgba(255,255,255,0.16)') + '; position:relative; cursor:pointer; transition:0.3s; flex-shrink:0;">' +
                    '<div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:3px; ' + (isOn ? 'right:3px;' : 'left:3px;') + ' transition:0.3s;"></div>' +
                '</div>' +
            '</div>';
    }

    function settingRangeRow(label, key, enabledKey) {
        var disabled = enabledKey && !State.settings[enabledKey];
        return '' +
            '<div style="margin-bottom: 1.5rem; opacity:' + (disabled ? '0.45' : '1') + ';">' +
                '<div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem; font-size: 0.8rem;"><span>' + escapeHtml(label) + '</span><span data-setting-value="' + escapeAttribute(key) + '">' + Math.round(clampVolume(State.settings[key], 0) * 100) + '%</span></div>' +
                '<input data-setting-range="' + escapeAttribute(key) + '" oninput="updateSettingRange(\'' + escapeAttribute(key) + '\', this.value)" type="range" min="0" max="1" step="0.01" value="' + clampVolume(State.settings[key], 0) + '" ' + (disabled ? 'disabled' : '') + ' style="width:100%; cursor:pointer;">' +
            '</div>';
    }

    function buildSettingsContent() {
        return '' +
            '<div class="grid-2">' +
                '<div class="premium-panel" style="padding:1.5rem;">' +
                    '<h3 style="margin:0 0 1rem; font-weight:300; letter-spacing:4px; font-size:1rem;">VOLUME</h3>' +
                    settingToggleRow('SOUND EFFECTS', 'playSounds') +
                    '<div style="height:1rem;"></div>' +
                    settingRangeRow('SFX', 'soundsVolume', 'playSounds') +
                    settingToggleRow('MUSIC', 'playMusic') +
                    '<div style="height:1rem;"></div>' +
                    settingRangeRow('MUSIC', 'musicVolume', 'playMusic') +
                '</div>' +
                '<div class="premium-panel" style="padding:1.5rem; display:flex; flex-direction:column; gap:1rem;">' +
                    '<h3 style="margin:0; font-weight:300; letter-spacing:4px; font-size:1rem;">GAMEPLAY</h3>' +
                    settingToggleRow('JELLY PHYSICS', 'jellyPhysics') +
                    settingToggleRow('SKINS', 'showSkins') +
                    settingToggleRow('SPLIT MACRO', 'splitMacro') +
                    settingToggleRow('FEED MACRO', 'feedMacro') +
                    settingToggleRow('SHOW MASS', 'showMass') +
                    settingToggleRow('HIDE GRID', 'hideGrid') +
                    settingToggleRow('HIDE CHAT', 'hideChat') +
                '</div>' +
            '</div>';
    }

    function syncSettingsControls() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-setting-toggle]'), function (toggle) {
            var key = toggle.getAttribute('data-setting-toggle');
            var knob = toggle.firstElementChild;
            var isOn = !!State.settings[key];
            toggle.style.background = isOn ? '#00e5ff' : 'rgba(255,255,255,0.16)';
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
    }

    function buildMarketContent() {
        return '<div class="grid-3" style="padding-top: 0.5rem;">' + [
            { n: "x10 PACK", p: "0.14", b: "#ff4444", off: "+5% BONUS", i: "fa-suitcase" },
            { n: "x20 SUPER", p: "0.4", b: "#00ddff", off: "+10% BONUS", i: "fa-box-open" },
            { n: "x50 MEGA", p: "1.1", b: "#39ff14", off: "+25% BONUS", i: "fa-server" }
        ].map(function (pack) {
            return '' +
                '<div class="premium-panel" style="padding: 1.5rem 1rem; text-align: center; position: relative; background: radial-gradient(circle at top, ' + pack.b + '44, rgba(20,20,30,0.6));">' +
                    '<div class="bundle-badge" style="background:' + pack.b + '; color:#000;">' + pack.off + '</div>' +
                    '<h2 style="margin:0 0 1rem; font-size:1.4rem; font-weight:900; letter-spacing:1px; color:#fff;">' + pack.n + '</h2>' +
                    '<div style="font-size: 3.5rem; margin-bottom: 1rem; filter: drop-shadow(0 5px 5px rgba(0,0,0,0.5)); color:' + pack.b + ';"><i class="fa-solid ' + pack.i + '"></i></div>' +
                    '<button class="pill-btn" onclick="buyMarketItem(\'' + pack.p + '\', \'' + pack.n + '\', this)" style="background: rgba(0,0,0,0.6); padding: 0.6rem 1rem; font-size: 1rem; width:100%;"><i class="fa-solid fa-gem" style="color: #00e5ff; margin-right:4px;"></i> ' + pack.p + '</button>' +
                '</div>';
        }).join("") + '</div>';
    }

    function renderRankingContent(tab) {
        State.rankingTab = tab || "global";
        var tabHtml = '<div style="display:flex; gap:0.5rem; margin-bottom:1rem;">' +
            ["GLOBAL", "FRIENDS", "CLANS"].map(function (label) {
                var lower = label.toLowerCase();
                var active = State.rankingTab === lower;
                return '<button class="pill-btn" onclick="renderRankingContent(\'' + lower + '\')" style="font-size:0.8rem; padding:0.8rem 1.5rem; ' + (active ? 'border-color:#ffaa00; color:#ffaa00; background:rgba(255,170,0,0.1);' : 'color:rgba(255,255,255,0.5);') + '">' + label + '</button>';
            }).join("") +
            '</div>';
        var names = ["RunePilot", "LuxeMako", "JunoByte", "NeoVoid", "LunarHex", "BitGraf", "OrbitFox", "NovaCell"];
        var rows = names.map(function (name, index) {
            var rank = index + 1;
            var accent = rank === 1 ? '#ffea00' : rank === 2 ? '#d7d7d7' : rank === 3 ? '#ff8c00' : 'rgba(255,255,255,0.45)';
            var self = name.toLowerCase() === State.nick.toLowerCase();
            return '' +
                '<div class="premium-panel" style="display:flex; align-items:center; gap:1rem; padding:0.8rem 1rem; background:' + (self ? 'rgba(0,229,255,0.12)' : 'rgba(20,20,30,0.38)') + '; border-color:' + (self ? 'rgba(0,229,255,0.35)' : 'rgba(255,255,255,0.04)') + ';">' +
                    '<span style="width:32px; color:' + accent + '; font-weight:900;">#' + rank + '</span>' +
                    '<span style="flex:1; font-weight:700;">' + escapeHtml(name) + '</span>' +
                    '<span style="color:#00e5ff; font-weight:900;">' + (42 - index * 3) + 'K</span>' +
                '</div>';
        }).join("");
        modalContent.innerHTML = tabHtml + '<div style="display:flex; flex-direction:column; gap:0.65rem;">' + rows + '</div>';
    }

    function buildDailyContent() {
        return '' +
            '<div class="daily-grid">' + [1,2,3,4,5,6,7].map(function (day) {
                return '' +
                    '<div class="premium-panel ' + (day === 7 ? 'day-7-card' : '') + '" style="text-align:center; padding:1rem 0.5rem; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0.5rem; ' +
                    (day < 3 ? 'opacity:0.4; pointer-events:none;' : '') +
                    (day === 3 ? 'background:rgba(0,229,255,0.1); border-color:#00e5ff; box-shadow: inset 0 0 15px rgba(0,229,255,0.2); cursor:pointer;' : '') + '" ' + (day === 3 ? 'onclick="claimDailyReward()"' : '') + '>' +
                        '<h4 style="margin:0; font-weight:400; font-size:0.7rem; opacity:0.8;">DAY ' + day + '</h4>' +
                        '<i class="fa-solid ' + (day === 7 ? 'fa-box-open' : 'fa-gem') + '" style="font-size: ' + (day === 7 ? '2.5rem' : '1.3rem') + '; margin: ' + (day === 7 ? '1rem 0' : '0') + '; color: ' + (day === 7 ? '#9400d3' : '#00e5ff') + ';"></i>' +
                        '<span style="font-weight: 700; font-size: ' + (day === 7 ? '1rem' : '0.8rem') + ';">x' + (day * 50) + '</span>' +
                    '</div>';
            }).join("") +
            '</div>' +
            '<button class="pill-btn" onclick="claimDailyReward()" style="width:100%; padding:1rem; margin-top:0.5rem; background:rgba(0,229,255,0.15); border-color:#00e5ff; color:#00e5ff; font-size:1rem; flex-shrink:0;">CLAIM REWARD</button>';
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
        return '<div style="display:flex; flex-direction:column; gap:0.8rem;">' + [
            { n: "SUBSCRIBE YOUTUBE", q: 500, i: "fa-youtube", brand: "fa-brands", bg: "#ff0000" },
            { n: "JOIN TELEGRAM", q: 300, i: "fa-telegram", brand: "fa-brands", bg: "#0088cc" },
            { n: "FOLLOW TWITTER", q: 300, i: "fa-x-twitter", brand: "fa-brands", bg: "#1da1f2" },
            { n: "VISIT BLOBZ.IO", q: 100, i: "fa-globe", brand: "fa-solid", bg: "#00e5ff" }
        ].map(function (task, index) {
            var claimed = State.tasks[index];
            return '' +
                '<div class="premium-panel" style="padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem;">' +
                    '<div style="display:flex; align-items:center; gap:1rem; min-width:0;">' +
                        '<div style="width:35px; height:35px; border-radius:10px; background:' + task.bg + '; display:flex; justify-content:center; align-items:center; font-size:1.2rem; flex-shrink:0;"><i class="' + task.brand + ' ' + task.i + '"></i></div>' +
                        '<h3 style="margin:0; font-weight:600; letter-spacing:1px; font-size: 0.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + task.n + '</h3>' +
                    '</div>' +
                    '<div style="display:flex; align-items:center; gap: 0.8rem; flex-shrink:0;">' +
                        '<span style="font-weight:900; color:#00e5ff; font-size:0.8rem;"><i class="fa-solid fa-gem"></i> +' + task.q + '</span>' +
                        '<button class="pill-btn" onclick="claimTask(' + index + ', ' + task.q + ', this)" style="' + (claimed ? 'background:#39ff14; color:#000; border-color:#39ff14;' : '') + ' padding:0.4rem 1rem; font-size: 0.7rem;">' + (claimed ? 'CLAIMED <i class="fa-solid fa-check"></i>' : 'GO <i class="fa-solid fa-arrow-right"></i>') + '</button>' +
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
        if (State.tasks[index]) return;
        State.tasks[index] = true;
        State.gems += Number(reward) || 0;
        if (btn) {
            btn.innerHTML = 'CLAIMED <i class="fa-solid fa-check"></i>';
            btn.style.background = '#39ff14';
            btn.style.color = '#000';
            btn.style.borderColor = '#39ff14';
        }
        updateGemDisplay();
    }

    function buyMarketItem(price, name, btn) {
        var html = '' +
            '<div style="font-size: 4rem; color: #00e5ff; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(0,229,255,0.5));"><i class="fa-solid fa-gem"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900; text-align:center;">' + escapeHtml(name) + '</h2>' +
            '<div style="font-size:0.75rem; color: rgba(255,255,255,0.55); margin-bottom:1.5rem; text-align:center; letter-spacing:1px;">STORE PREVIEW</div>' +
            '<button class="pill-btn" onclick="completePurchase(\'' + escapeAttribute(name) + '\', \'' + escapeAttribute(price) + '\')" style="width:100%; background:#fff; color:#000; border:none;">CONFIRM ' + escapeHtml(price) + '</button>';
        showPopup(html, 'border-color:#00e5ff; box-shadow: 0 15px 50px rgba(0,229,255,0.3);');
    }

    function completePurchase(name, price) {
        var html = '' +
            '<div style="font-size: 4rem; color: #39ff14; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(57,255,20,0.5));"><i class="fa-solid fa-check-circle"></i></div>' +
            '<h2 style="color: #fff; font-size: 1.4rem; margin:0 0 0.5rem; font-weight:900; text-align:center;">PURCHASE READY</h2>' +
            '<div style="font-size:0.8rem; color: rgba(255,255,255,0.6); margin-bottom:1.5rem; text-align:center;">' + escapeHtml(name) + ' for ' + escapeHtml(price) + '</div>' +
            '<button class="pill-btn" onclick="closePopup()" style="width:100%; background:#39ff14; color:#000; border:none;">OK</button>';
        showPopup(html, 'border-color:#39ff14; box-shadow: 0 15px 50px rgba(57,255,20,0.25);');
    }

    function claimDailyReward() {
        var html = '' +
            '<div style="font-size: 4rem; color: #00e5ff; margin-bottom: 1rem; filter: drop-shadow(0 6px 15px rgba(0,229,255,0.5));"><i class="fa-solid fa-gem"></i></div>' +
            '<h2 style="color: #00e5ff; font-size: 2rem; margin:0 0 0.5rem; font-weight:900;">CLAIMED!</h2>' +
            '<div style="font-size:0.9rem; color: #fff; margin: 0 0 1.5rem; text-align:center;">Daily Bonus Acquired <br><span style="color:#ffaa00; font-size: 1.5rem; font-weight:900;">+50 GEMS</span></div>' +
            '<button class="pill-btn" style="width:100%; background:#00e5ff; color:#000; border:none;" onclick="closePopup()">AWESOME</button>';
        State.gems += 50;
        updateGemDisplay();
        showPopup(html, 'border-color:#00e5ff; box-shadow: 0 15px 50px rgba(0,229,255,0.3);');
    }

    function openLootbox(id) {
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
                State.gems += 150;
                updateGemDisplay();
            }
        }, 95);
    }

    function launchGame(mode) {
        persistProfile();
        persistSettings();
        try {
            sessionStorage.setItem(launchStorageKey, JSON.stringify({
                mode: mode === "spectate" ? "spectate" : "play",
                nick: State.nick,
                skin: State.skin,
                timestamp: Date.now()
            }));
        } catch (error) {}
        window.location.href = "/game.html";
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
        persistSettings();
        updateShell();
        bindEvents();
        loadSkins();
        updateNavState(-1);
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
    window.showPopup = showPopup;
    window.closePopup = closePopup;
    window.openSkinPopup = openSkinPopup;
    window.confirmUseSkin = confirmUseSkin;
    window.renderInventoryContent = renderInventoryContent;
    window.renderRankingContent = renderRankingContent;
    window.toggleSetting = toggleSetting;
    window.updateSettingRange = updateSettingRange;
    window.saveProfile = saveProfile;
    window.claimTask = claimTask;
    window.buyMarketItem = buyMarketItem;
    window.completePurchase = completePurchase;
    window.claimDailyReward = claimDailyReward;
    window.openLootbox = openLootbox;
    window.launchGame = launchGame;

    init();
})();
