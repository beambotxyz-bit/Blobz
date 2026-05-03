(function () {
    var sessionTokenKey = "blobzSessionToken";
    var playerCacheKey = "blobzPlayerCache";
    var inventoryCacheKey = "blobzInventoryCache";
    var defaultApiBase = "http://127.0.0.1:8787";
    var state = {
        token: readStorage(sessionTokenKey),
        player: readJson(playerCacheKey),
        inventory: readJson(inventoryCacheKey),
        lastError: null,
        ready: false
    };

    function readStorage(key) {
        try {
            return localStorage.getItem(key) || "";
        } catch (error) {
            return "";
        }
    }

    function writeStorage(key, value) {
        try {
            if (value === null || value === undefined || value === "") {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
        } catch (error) {}
    }

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "null");
        } catch (error) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            if (!value) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (error) {}
    }

    function getBaseUrl() {
        var configured = window.BLOBZ_API_BASE || readStorage("blobzApiBase") || defaultApiBase;
        return String(configured).replace(/\/+$/, "");
    }

    function getTelegramInitData() {
        return window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData
            ? window.Telegram.WebApp.initData
            : "";
    }

    function setSession(token, player, inventory) {
        state.token = token || "";
        state.player = player || state.player || null;
        if (inventory !== undefined) state.inventory = inventory || null;
        writeStorage(sessionTokenKey, state.token);
        writeJson(playerCacheKey, state.player);
        writeJson(inventoryCacheKey, state.inventory);
    }

    function clearSession() {
        state.token = "";
        state.player = null;
        state.inventory = null;
        writeStorage(sessionTokenKey, "");
        writeJson(playerCacheKey, null);
        writeJson(inventoryCacheKey, null);
    }

    function request(path, options) {
        options = options || {};
        var headers = options.headers || {};
        headers.Accept = "application/json";
        if (options.body !== undefined) headers["Content-Type"] = "application/json";
        if (state.token) headers.Authorization = "Bearer " + state.token;

        return fetch(getBaseUrl() + path, {
            method: options.method || "GET",
            headers: headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            mode: "cors"
        }).then(function (response) {
            return response.text().then(function (text) {
                var payload = text ? JSON.parse(text) : {};
                if (!response.ok) {
                    var message = payload && payload.error && payload.error.message ? payload.error.message : "Blobz API request failed.";
                    var error = new Error(message);
                    error.status = response.status;
                    error.payload = payload;
                    throw error;
                }
                return payload;
            });
        });
    }

    function authenticateTelegram() {
        var initData = getTelegramInitData();
        if (!initData) return Promise.resolve(null);
        return request("/auth/telegram", {
            method: "POST",
            body: { initData: initData }
        }).then(function (payload) {
            setSession(payload.token, payload.player, state.inventory);
            return payload.player;
        });
    }

    function getMe() {
        if (!state.token) return Promise.resolve(null);
        return request("/me").then(function (payload) {
            state.player = payload.player || null;
            writeJson(playerCacheKey, state.player);
            return state.player;
        });
    }

    function getInventory() {
        if (!state.token) return Promise.resolve(null);
        return request("/me/inventory").then(function (payload) {
            state.inventory = payload.inventory || null;
            writeJson(inventoryCacheKey, state.inventory);
            return state.inventory;
        });
    }

    function equipSkin(playerSkinId) {
        if (!state.token) return Promise.reject(new Error("No Blobz API session."));
        return request("/me/skin/equip", {
            method: "POST",
            body: { playerSkinId: playerSkinId || null }
        }).then(function (payload) {
            state.player = payload.player || state.player;
            writeJson(playerCacheKey, state.player);
            return state.player;
        });
    }

    function assignWorld(options) {
        return request("/worlds/assign", {
            method: "POST",
            body: options || {}
        });
    }

    function bootstrap() {
        var initData = getTelegramInitData();
        var chain = initData ? authenticateTelegram() : getMe();
        return chain.then(function () {
            return getInventory();
        }).then(function () {
            state.ready = true;
            state.lastError = null;
            return {
                authenticated: !!state.token,
                player: state.player,
                inventory: state.inventory
            };
        }).catch(function (error) {
            state.ready = true;
            state.lastError = error;
            return {
                authenticated: !!state.token,
                player: state.player,
                inventory: state.inventory,
                error: error
            };
        });
    }

    window.blobzApi = {
        bootstrap: bootstrap,
        authenticateTelegram: authenticateTelegram,
        getMe: getMe,
        getInventory: getInventory,
        equipSkin: equipSkin,
        assignWorld: assignWorld,
        clearSession: clearSession,
        hasSession: function () { return !!state.token; },
        getToken: function () { return state.token; },
        getPlayer: function () { return state.player; },
        getInventoryCache: function () { return state.inventory; },
        getLastError: function () { return state.lastError; },
        getBaseUrl: getBaseUrl,
        isTelegramAvailable: function () { return !!getTelegramInitData(); }
    };
})();
