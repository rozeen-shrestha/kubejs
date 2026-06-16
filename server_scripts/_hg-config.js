// ================================================================
//  HUNGER GAMES — Configuration & Utility Functions
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-config.sk
//  
//  INSTALL: Copy all .js files into <server>/kubejs/server_scripts/
//  This file loads first (underscore prefix) and sets up the global
//  state object that all other scripts reference.
// ================================================================

// ══════════════════════════════════
//  CONFIGURATION — Edit values here
// ══════════════════════════════════

if (!global.HG) global.HG = {};

// Overwrite config on every reload so changes apply dynamically
global.HG.cfg = {
    freezeTime: 30,       // seconds frozen before GO
    maxSpawns: 50,
    assignMode: 'members', // 'all' or 'members'
    prefix: '§6[HG]',
    wandItemId: 'minecraft:blaze_rod',
    wandName: 'HG Spawn Wand',  // plain text (no §) for matching
    appleDropChance: 0.1,       // additional chance (0.0 - 1.0) for leaves to drop apples

    // Sherpa's Pickaxe random bonus ore drop chances (in % - set to 0.0 to disable)
    sherpaEmeraldChance: 10.0,  // was 2.5% originally (4x = 10%)
    sherpaDiamondChance: 12.0,  // was 3.0% originally (4x = 12%)
    sherpaLapisChance: 32.0,    // was 8.0% originally (4x = 32%)
    sherpaGoldChance: 40.0,     // was 10.0% originally (4x = 40%)
    sherpaIronChance: 60.0,     // was 15.0% originally (4x = 60%)

    // ================================================================
    //  TIMELINE CONFIGURATION (in seconds)
    //  Edit these values to dynamically change game milestones.
    //  (1 minute = 60 seconds, 45 minutes = 2700 seconds, etc.)
    // ================================================================
    graceTime: 60,                    // 01:00 Grace Period Ends (PvP enabled)
    netherUnlockTime: 2700,           // 45:00 Nether opens
    borderShrink1Time: 4200,          // 70:00 World Border Starts Shrinking to 300
    borderShrink1Size: 300,           // Size to shrink to (first shrinkage)
    borderShrink1Duration: 1200,       // Time in seconds it takes to shrink to size 1
    netherLockTime: 4500,             // 75:00 Nether Closes
    borderShrink2Time: 5400,          // 90:00 Last World Border Shrinkage to 80
    borderShrink2Size: 80,            // Size to shrink to (final shrinkage)
    borderShrink2Duration: 300
};

if (global.HG.game === undefined) global.HG.game = { running: false, countdownActive: false, elapsedSeconds: 0 };
if (global.HG.grace === undefined) global.HG.grace = false;
if (global.HG.pvp === undefined) global.HG.pvp = false;
if (global.HG.nether === undefined) global.HG.nether = { locked: false };
if (global.HG.frozen === undefined) global.HG.frozen = {};
if (global.HG.alive === undefined) global.HG.alive = {};
if (global.HG.spectate === undefined) global.HG.spectate = {};
if (global.HG.assignment === undefined) global.HG.assignment = {};
if (global.HG.spawns === undefined) global.HG.spawns = {};
if (global.HG.graceRemaining === undefined) global.HG.graceRemaining = 0;
if (global.HG.airdrop === undefined) {
    global.HG.airdrop = {
        active: false,
        currentY: 200,
        targetX: 0,
        targetZ: 0,
        world: 'minecraft:overworld'
    };
}
if (global.HG.tick === undefined) global.HG.tick = 0;

// ================================================================
//  HUNGER GAMES TIMELINE (Reads from config dynamically on reload)
// ================================================================
global.HG.timeline = [
    {
        get time() { return global.HG.cfg.graceTime; },
        name: "Grace Period Ends",
        run: function (server) {
            let HG = global.HG;
            console.info("[HG TIMELINE] Event: " + this.name + " triggered at elapsed game time: " + HG.game.elapsedSeconds + "s.");
            server.runCommandSilent('tellraw @a[permission=2] {"text":"[HG TIMELINE] Event: ' + this.name + ' triggered at ' + HG.game.elapsedSeconds + 's","color":"gray","italic":true}');

            HG.grace = false;
            HG.pvp = true;
            HG.graceRemaining = 0;

            for (let p of server.players) {
                HG.fn.sendActionBar(server, p, '§cPvP is now enabled.');
            }
            HG.fn.broadcast(server, HG.cfg.prefix + ' §c§lPvP is now enabled.');
            HG.fn.alivePlayers(server).forEach(function (p) {
                server.runCommandSilent('gamemode survival ' + p.username);
                HG.fn.sendTitle(server, p, '§c§lPvP ON', '§7Watch your back.', 0, 60, 20);
                HG.fn.playSound(server, p, 'minecraft:entity.wither.spawn', 0.5);
            });
        }
    },
    {
        get time() { return global.HG.cfg.netherUnlockTime; },
        name: "Nether Opens",
        run: function (server) {
            let HG = global.HG;
            console.info("[HG TIMELINE] Event: " + this.name + " triggered at elapsed game time: " + HG.game.elapsedSeconds + "s.");
            server.runCommandSilent('tellraw @a[permission=2] {"text":"[HG TIMELINE] Event: ' + this.name + ' triggered at ' + HG.game.elapsedSeconds + 's","color":"gray","italic":true}');

            HG.nether.locked = false;
            HG.fn.broadcast(server, HG.cfg.prefix + ' §a§lThe Nether is now open!');
            HG.fn.alivePlayers(server).forEach(function (p) {
                HG.fn.sendTitle(server, p, '§a§lNether Open', '§7Portals are active.', 10, 60, 20);
                HG.fn.playSound(server, p, 'minecraft:entity.wither.death', 0.5);
            });
        }
    },
    {
        get time() { return global.HG.cfg.borderShrink1Time; },
        name: "World Border Starts Shrinking to 300",
        run: function (server) {
            let HG = global.HG;
            console.info("[HG TIMELINE] Event: " + this.name + " triggered at elapsed game time: " + HG.game.elapsedSeconds + "s.");
            server.runCommandSilent('tellraw @a[permission=2] {"text":"[HG TIMELINE] Event: ' + this.name + ' triggered at ' + HG.game.elapsedSeconds + 's","color":"gray","italic":true}');

            HG.fn.broadcast(server, HG.cfg.prefix + ' §cWorld border shrinking to §f' + HG.cfg.borderShrink1Size + '§c.');
            HG.fn.alivePlayers(server).forEach(function (p) {
                HG.fn.sendTitle(server, p, '§c§lBorder Shrinking', '§7Shrinking to ' + HG.cfg.borderShrink1Size + '.', 0, 60, 20);
                HG.fn.playSound(server, p, 'minecraft:entity.elder_guardian.curse');
            });
            server.runCommandSilent('worldborder set ' + HG.cfg.borderShrink1Size + ' ' + HG.cfg.borderShrink1Duration);
        }
    },
    {
        get time() { return global.HG.cfg.netherLockTime; },
        name: "Nether Closes",
        run: function (server) {
            let HG = global.HG;
            console.info("[HG TIMELINE] Event: " + this.name + " triggered at elapsed game time: " + HG.game.elapsedSeconds + "s.");
            server.runCommandSilent('tellraw @a[permission=2] {"text":"[HG TIMELINE] Event: ' + this.name + ' triggered at ' + HG.game.elapsedSeconds + 's","color":"gray","italic":true}');

            HG.fn.lockNether(server);
        }
    },
    {
        get time() { return global.HG.cfg.borderShrink2Time; },
        name: "Last World Border Shrinkage to 80",
        run: function (server) {
            let HG = global.HG;
            console.info("[HG TIMELINE] Event: " + this.name + " triggered at elapsed game time: " + HG.game.elapsedSeconds + "s.");
            server.runCommandSilent('tellraw @a[permission=2] {"text":"[HG TIMELINE] Event: ' + this.name + ' triggered at ' + HG.game.elapsedSeconds + 's","color":"gray","italic":true}');

            HG.fn.broadcast(server, HG.cfg.prefix + ' §cFinal world border shrinking to §f' + HG.cfg.borderShrink2Size + '§c.');
            HG.fn.alivePlayers(server).forEach(function (p) {
                HG.fn.sendTitle(server, p, '§c§lBorder Shrinking', '§7Shrinking to ' + HG.cfg.borderShrink2Size + '.', 0, 60, 20);
                HG.fn.playSound(server, p, 'minecraft:entity.elder_guardian.curse');
            });
            server.runCommandSilent('worldborder set ' + HG.cfg.borderShrink2Size + ' ' + HG.cfg.borderShrink2Duration);
        }
    }
];

// ══════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════

/**
 * Broadcast a message to all online players.
 */
if (!global.HG.fn) global.HG.fn = {};

global.HG.fn.broadcast = function (server, msg) {
    let json = JSON.stringify({ text: msg });
    server.runCommandSilent('tellraw @a ' + json);
};

/**
 * Send a message to a specific player.
 */
global.HG.fn.tell = function (server, player, msg) {
    let json = JSON.stringify({ text: msg });
    server.runCommandSilent('tellraw ' + player.username + ' ' + json);
};

/**
 * Send a title + subtitle to a player.
 * @param {number} fadeIn   - ticks
 * @param {number} stay     - ticks
 * @param {number} fadeOut  - ticks
 */
global.HG.fn.sendTitle = function (server, player, title, subtitle, fadeIn, stay, fadeOut) {
    server.runCommandSilent('title ' + player.username + ' times ' + fadeIn + ' ' + stay + ' ' + fadeOut);
    if (subtitle) {
        server.runCommandSilent('title ' + player.username + ' subtitle ' + JSON.stringify({ text: subtitle }));
    }
    server.runCommandSilent('title ' + player.username + ' title ' + JSON.stringify({ text: title }));
};

/**
 * Send an action bar message to a player.
 */
global.HG.fn.sendActionBar = function (server, player, msg) {
    server.runCommandSilent('title ' + player.username + ' actionbar ' + JSON.stringify({ text: msg }));
};

/**
 * Play a sound for a specific player.
 */
global.HG.fn.playSound = function (server, player, sound, volume, pitch) {
    volume = volume || 1;
    pitch = pitch || 1;
    server.runCommandSilent(
        'playsound ' + sound + ' master ' + player.username +
        ' ~ ~ ~ ' + volume + ' ' + pitch
    );
};

/**
 * Format a location as a readable string.
 */
global.HG.fn.locString = function (x, y, z, world) {
    let w = world || 'unknown';
    // Strip "minecraft:" prefix for readability
    w = w.replace('minecraft:', '');
    return w + ' (' + Math.floor(x) + ', ' + Math.floor(y) + ', ' + Math.floor(z) + ')';
};

/**
 * Count how many spawn points are set.
 */
global.HG.fn.spawnCount = function () {
    return Object.keys(global.HG.spawns).length;
};

/**
 * Check if a player is a game participant (assigned to a spawn).
 */
global.HG.fn.isParticipant = function (player) {
    return !!global.HG.assignment[player.uuid.toString()];
};

/**
 * Get an array of alive player objects from the server.
 */
global.HG.fn.alivePlayers = function (server) {
    let result = [];
    for (let p of server.players) {
        if (global.HG.alive[p.uuid.toString()]) {
            result.push(p);
        }
    }
    return result;
};

/**
 * Count how many players are still alive.
 */
global.HG.fn.aliveCount = function () {
    return Object.keys(global.HG.alive).length;
};

/**
 * Check if a player is holding the HG Spawn Wand.
 */
global.HG.fn.isHoldingWand = function (item) {
    if (!item || item.empty) return false;
    let itemId = '';
    try {
        itemId = String(item.id || item.getId() || item.item || (item.getItem ? item.getItem() : '') || '');
    } catch (e) { }
    if (itemId.indexOf('blaze_rod') === -1) return false;

    // Check NBT first using toString fallback, which is 100% version-independent
    try {
        if (item.nbt) {
            let nbtStr = item.nbt.toString();
            if (nbtStr.indexOf('Spawn Wand') !== -1 || nbtStr.indexOf('HG Spawn Wand') !== -1) {
                return true;
            }
        }
    } catch (e) { }

    // Check custom names using standard getters
    try {
        let name = '';
        if (item.getHoverName) {
            let n = item.getHoverName();
            name = n.getString ? n.getString() : String(n);
        } else if (item.getName) {
            let n = item.getName();
            name = n.getString ? n.getString() : String(n);
        } else if (item.getDisplayName) {
            let n = item.getDisplayName();
            name = n.getString ? n.getString() : String(n);
        } else if (item.displayName) {
            name = item.displayName.getString ? item.displayName.getString() : (item.displayName.string || String(item.displayName));
        }

        if (name && (name.indexOf('Spawn Wand') !== -1 || name.indexOf('HG Spawn Wand') !== -1)) {
            return true;
        }
    } catch (e) {
        console.error('[HG] Error checking display name in isHoldingWand: ' + e);
    }
    return false;
};

/**
 * Give the HG Spawn Wand to a player.
 */
global.HG.fn.giveWand = function (server, player) {
    server.runCommandSilent(
        'give ' + player.username +
        ' minecraft:blaze_rod{display:{' +
        'Name:\'{"text":"§6§lHG Spawn Wand","italic":false}\',' +
        'Lore:[' +
        '\'{"text":"§7Right-click a block to set spawn","italic":false}\',' +
        '\'{"text":"§7Shift + Right-click to remove nearest spawn","italic":false}\'' +
        ']}} 1'
    );
};

// ══════════════════════════════════
//  SPAWN DATA PERSISTENCE
// ══════════════════════════════════

/**
 * Save spawns to a physical JSON file (kubejs/hg_spawns.json).
 */
global.HG.fn.saveSpawns = function (server) {
    try {
        JsonIO.write('kubejs/hg_spawns.json', global.HG.spawns);
    } catch (e) {
        console.error('[HG] Failed to save spawns to JSON: ' + e);
    }
};

/**
 * Load spawns from a physical JSON file (kubejs/hg_spawns.json).
 */
global.HG.fn.loadSpawns = function (server) {
    try {
        let data = JsonIO.read('kubejs/hg_spawns.json');
        if (data) {
            global.HG.spawns = {};
            // Convert Java Map/JSON objects back to standard JS objects
            for (let key of data.keySet()) {
                let val = data.get(key);
                global.HG.spawns[key] = {
                    x: val.get('x'),
                    y: val.get('y'),
                    z: val.get('z'),
                    world: val.get('world')
                };
            }
            console.info('[HG] Loaded ' + Object.keys(global.HG.spawns).length + ' spawns from hg_spawns.json');
        } else {
            global.HG.spawns = {};
        }
    } catch (e) {
        console.error('[HG] Failed to load spawns from JSON: ' + e);
        global.HG.spawns = {};
    }
};

// Load spawns immediately during script evaluation (crucial for reloads)
global.HG.fn.loadSpawns();

// ══════════════════════════════════
//  SCHEDULE HELPER
// ══════════════════════════════════

/**
 * Execute a sequence of delayed tasks.
 * @param {MinecraftServer} server
 * @param {Array} steps - [[delayTicks, callback], ...]
 */
global.HG.fn.scheduleSequence = function (server, steps) {
    if (!steps || steps.length === 0) return;
    let delayTicks = steps[0][0];
    let callback = steps[0][1];
    let remaining = steps.slice(1);
    server.scheduleInTicks(delayTicks, function () {
        callback();
        global.HG.fn.scheduleSequence(server, remaining);
    });
};

// ══════════════════════════════════
//  INITIALIZATION — Load persistent data on server start
// ══════════════════════════════════

ServerEvents.loaded(function (event) {
    let server = event.server;
    global.HG.fn.loadSpawns(server);

    // Disable default vanilla death messages globally
    server.runCommandSilent('gamerule showDeathMessages false');

    // Clean state on load (only if no game is running)
    if (!global.HG.game.running) {
        global.HG.grace = false;
        global.HG.pvp = false;
        global.HG.nether.locked = false;
        global.HG.game.countdownActive = false;
        global.HG.frozen = {};
        global.HG.alive = {};
        global.HG.spectate = {};
    }

    // Wrap all global.HG.fn functions with console error loggers 1 tick after load
    server.scheduleInTicks(1, function () {
        let fn = global.HG.fn;
        for (let key in fn) {
            if (typeof fn[key] === 'function' && !fn[key].wrapped) {
                let original = fn[key];
                fn[key] = (function (name, orig) {
                    let wrappedFn = function () {
                        try {
                            return orig.apply(this, arguments);
                        } catch (e) {
                            console.error('[HG Function Error] Error in global.HG.fn.' + name + ': ' + e);
                            if (e.stack) {
                                console.error(e.stack);
                            }
                            throw e;
                        }
                    };
                    wrappedFn.wrapped = true;
                    return wrappedFn;
                })(key, original);
            }
        }
        console.info('[HG] Wrapped all utility functions with safety error loggers.');
    });

    console.info('[HG] Hunger Games scripts loaded. Spawns: ' + global.HG.fn.spawnCount());
});

// ── Global tick counter ──
ServerEvents.tick(function (event) {
    global.HG.tick++;
});
