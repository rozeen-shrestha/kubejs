// ================================================================
//  HUNGER GAMES — Core Game Logic
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-core.sk
//
//  Player assignment, teleport, freeze, countdown, grace period,
//  nether control, world border, reset, auto-run
// ================================================================

// Safety: ensure global state exists regardless of load order
if (!global.HG) global.HG = { cfg: { freezeTime: 30, graceTime: 60, netherUnlockDelay: 600, borderShrinkDelay: 300, borderFinalSize: 100, borderShrinkDuration: 600, maxSpawns: 50, assignMode: 'members', prefix: '§6[HG]', wandItemId: 'minecraft:blaze_rod', wandName: 'HG Spawn Wand' }, game: { running: false, countdownActive: false }, grace: false, pvp: false, nether: { locked: false }, frozen: {}, alive: {}, spectate: {}, assignment: {}, spawns: {}, graceRemaining: 0, airdrop: { active: false, currentY: 200, targetX: 0, targetZ: 0, world: 'minecraft:overworld' }, tick: 0 };
if (!global.HG.fn) global.HG.fn = {};

// ════════════════════════════════════
//  PLAYER ASSIGNMENT (Fisher-Yates shuffle)
// ════════════════════════════════════

global.HG.fn.assign = function (server, mode, sender) {
    let HG = global.HG;
    let total = HG.fn.spawnCount();

    if (total < 1) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cNo spawns set! Use the wand or /hg setspawn.');
        return;
    }

    // Clear old assignments
    HG.assignment = {};

    // Build player list based on mode
    let players = [];
    if (mode === 'all') {
        for (let p of server.players) { players.push(p); }
    } else if (mode === 'members') {
        for (let p of server.players) {
            if (!p.op) {
                players.push(p);
            }
        }
    } else {
        // Single player mode — 'mode' is the player name
        let target = null;
        for (let p of server.players) {
            if (p.username.toLowerCase() === mode.toLowerCase()) {
                target = p;
                break;
            }
        }
        if (!target) {
            HG.fn.tell(server, sender, HG.cfg.prefix + " §cPlayer '" + mode + "' not found online.");
            return;
        }
        players.push(target);
    }

    // Build spawn slot pool
    let slots = Object.keys(HG.spawns).map(function (s) { return parseInt(s); });

    // Fisher-Yates shuffle
    for (let i = slots.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let temp = slots[i];
        slots[i] = slots[j];
        slots[j] = temp;
    }

    // Assign players to shuffled slots
    let assigned = 0;
    for (let i = 0; i < players.length; i++) {
        let slotIndex = i % slots.length;
        let slot = slots[slotIndex];
        HG.assignment[players[i].uuid.toString()] = slot;
        assigned++;
    }

    HG.fn.tell(server, sender,
        HG.cfg.prefix + ' §aAssigned §f' + assigned + ' §7players to spawn slots.');
};

// ════════════════════════════════════
//  TELEPORT & FREEZE
// ════════════════════════════════════

global.HG.fn.teleportPlayers = function (server, sender) {
    let HG = global.HG;
    let count = 0;

    for (let p of server.players) {
        let uuid = p.uuid.toString();
        let slot = HG.assignment[uuid];
        if (slot === undefined) continue;

        let loc = HG.spawns[slot];
        if (!loc) continue;

        // Clear inventory and effects
        server.runCommandSilent('clear ' + p.username);
        p.removeAllEffects();

        // Set to adventure mode
        server.runCommandSilent('gamemode adventure ' + p.username);

        // Teleport
        server.runCommandSilent('tp ' + p.username + ' ' + loc.x + ' ' + loc.y + ' ' + loc.z);

        // Mark as frozen and alive
        HG.frozen[uuid] = { x: loc.x, y: loc.y, z: loc.z, world: loc.world };
        HG.alive[uuid] = true;

        // Apply slowness 255 to prevent movement
        server.runCommandSilent('effect give ' + p.username + ' minecraft:slowness 999 255 true');

        // Apply jump boost 250 to prevent jumping (amplifier 250 disables jumping in vanilla)
        server.runCommandSilent('effect give ' + p.username + ' minecraft:jump_boost 999 250 true');

        // Send title
        HG.fn.sendTitle(server, p,
            '§6Hunger Games',
            '§7The game will start soon.',
            10, 80, 20);

        count++;
    }

    if (count < 1) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cNo players to teleport! Run /hg assign first.');
        return;
    }

    // Destroy existing portal blocks near spawn points (128-block cube)
    Object.keys(HG.spawns).forEach(function (slot) {
        let loc = HG.spawns[slot];
        let px = Math.floor(loc.x);
        let py = Math.floor(loc.y);
        let pz = Math.floor(loc.z);
        server.runCommandSilent(
            'fill ' + (px - 64) + ' ' + (py - 64) + ' ' + (pz - 64) + ' ' +
            (px + 64) + ' ' + (py + 64) + ' ' + (pz + 64) + ' air replace nether_portal'
        );
    });

    HG.fn.tell(server, sender,
        HG.cfg.prefix + ' §a§7Teleported §f' + count + ' §7players. They are frozen.');
    HG.game.running = true;
    HG.game.started = false;
};
// Helper to check if a block is passable/clippable (air, plants, etc.)
function isPassableBlock(block) {
    if (!block) return true;
    let id = block.id.toString();
    if (id.indexOf('air') !== -1) return true;

    let passable = [
        'minecraft:grass', 'minecraft:tall_grass', 'minecraft:fern', 'minecraft:large_fern',
        'minecraft:dandelion', 'minecraft:poppy', 'minecraft:blue_orchid', 'minecraft:allium',
        'minecraft:azure_bluet', 'minecraft:red_tulip', 'minecraft:orange_tulip', 'minecraft:white_tulip',
        'minecraft:pink_tulip', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:lily_of_the_valley',
        'minecraft:wither_rose', 'minecraft:sunflower', 'minecraft:lilac', 'minecraft:rose_bush',
        'minecraft:peony', 'minecraft:vine', 'minecraft:glow_lichen', 'minecraft:fire'
    ];
    if (passable.indexOf(id) !== -1) return true;

    try {
        if (block.collisionShape && typeof block.collisionShape.isEmpty === 'function') {
            return block.collisionShape.isEmpty();
        }
    } catch (e) { }
    return false;
}

// Find a safe spot next to target coordinates in the Overworld level
function findSafeOverworldCoords(overworld, ox, oy, oz) {
    let bx = Math.floor(ox);
    let by = Math.floor(oy);
    let bz = Math.floor(oz);

    // Adjacent offsets list (horizontal first, then horizontal distance 2, then vertical search)
    let offsets = [
        [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
        [2, 0, 0], [-2, 0, 0], [0, 0, 2], [0, 0, -2],
        [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
        [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]
    ];

    if (overworld) {
        for (let offset of offsets) {
            let x = bx + offset[0];
            let y = by + offset[1];
            let z = bz + offset[2];
            try {
                let blockFeet = overworld.getBlock(x, y, z);
                let blockHead = overworld.getBlock(x, y + 1, z);
                let blockUnder = overworld.getBlock(x, y - 1, z);

                if (isPassableBlock(blockFeet) && isPassableBlock(blockHead) && !isPassableBlock(blockUnder)) {
                    return { x: x + 0.5, y: y, z: z + 0.5 };
                }
            } catch (e) { }
        }

        // Secondary pass: ignore solid floor requirement if none found
        for (let offset of offsets) {
            let x = bx + offset[0];
            let y = by + offset[1];
            let z = bz + offset[2];
            try {
                let blockFeet = overworld.getBlock(x, y, z);
                let blockHead = overworld.getBlock(x, y + 1, z);

                if (isPassableBlock(blockFeet) && isPassableBlock(blockHead)) {
                    return { x: x + 0.5, y: y, z: z + 0.5 };
                }
            } catch (e) { }
        }
    }

    // Default fallback offset if level unavailable or no safe spots found
    return { x: ox + 2.0, y: oy, z: oz };
}

// ════════════════════════════════════
//  FREEZE HANDLER (tick-based enforcement)
// ════════════════════════════════════

ServerEvents.tick(function (event) {
    let HG = global.HG;
    if (!HG.game.running) return;

    let server = event.server;

    // ── Freeze enforcement: teleport back if player moved ──
    let frozenUuids = Object.keys(HG.frozen);
    if (frozenUuids.length > 0) {
        for (let p of server.players) {
            let uuid = p.uuid.toString();
            let pos = HG.frozen[uuid];
            if (!pos) continue;

            // Check if player moved more than 0.5 blocks to prevent jittery visual rubberbanding
            let dx = p.x - pos.x;
            let dy = p.y - pos.y;
            let dz = p.z - pos.z;
            if (dx * dx + dy * dy + dz * dz > 0.25) {
                server.runCommandSilent('tp ' + p.username + ' ' + pos.x + ' ' + pos.y + ' ' + pos.z);
            }
        }
    }

    // ── Game elapsed seconds and timeline events (every 20 ticks = 1 second) ──
    if (HG.game.started && HG.tick % 20 === 0) {
        HG.game.elapsedSeconds = (HG.game.elapsedSeconds || 0) + 1;

        // Display grace period remaining on the action bar if grace is active
        if (HG.grace) {
            let graceRemaining = HG.cfg.graceTime - HG.game.elapsedSeconds;
            if (graceRemaining > 0) {
                for (let p of server.players) {
                    HG.fn.sendActionBar(server, p,
                        '§aGrace Period: §f' + graceRemaining + 's remaining');
                }
            }
        }

        // Run timeline events
        if (HG.timeline) {
            HG.timeline.forEach(function (ev) {
                if (ev.time === HG.game.elapsedSeconds) {
                    try {
                        ev.run(server);
                    } catch (e) {
                        console.error('[HG Timeline Error] Failed to run event: ' + ev.name + ': ' + e);
                    }
                }
            });
        }
    }

    // ── Nether lock enforcement (every tick) ──
    if (HG.nether.locked) {
        for (let p of server.players) {
            let uuid = p.uuid.toString();
            if (!HG.alive[uuid]) continue;

            let dim = p.level.dimension.toString();
            let isInsideNether = dim.indexOf('the_nether') !== -1;

            let insidePortal = false;
            // Optimize: Only query portal block state once every 10 ticks (0.5s) per player
            if (HG.tick % 10 === 0) {
                try {
                    let bx = Math.floor(p.x);
                    let by = Math.floor(p.y);
                    let bz = Math.floor(p.z);
                    let block = p.level.getBlock(bx, by, bz);
                    let blockHead = p.level.getBlock(bx, by + 1, bz);
                    if (block.id === 'minecraft:nether_portal' || blockHead.id === 'minecraft:nether_portal') {
                        insidePortal = true;
                    }
                } catch (e) { }
            }

            if (insidePortal || isInsideNether) {
                if (!HG.lastNetherTp) HG.lastNetherTp = {};
                let lastTp = HG.lastNetherTp[uuid] || 0;
                let now = HG.tick;
                if (now - lastTp > 40) { // 2-second cooldown to prevent teleport loop spam
                    HG.lastNetherTp[uuid] = now;
                    let overworld = null;
                    try {
                        overworld = server.getLevel('minecraft:overworld');
                    } catch (e) {
                        try {
                            overworld = server.overworld;
                        } catch (e2) { }
                    }

                    if (isInsideNether) {
                        // Teleport back to Overworld equivalent position (using safe air block finding)
                        let ox = p.x * 8;
                        let oy = p.y;
                        let oz = p.z * 8;
                        let dest = findSafeOverworldCoords(overworld, ox, oy, oz);
                        server.runCommandSilent('execute in minecraft:overworld run tp ' + p.username + ' ' + dest.x + ' ' + dest.y + ' ' + dest.z);
                    } else if (insidePortal) {
                        // Push player out of the portal block in the Overworld (using safe air block finding)
                        let dest = findSafeOverworldCoords(p.level, p.x, p.y, p.z);
                        server.runCommandSilent('execute in minecraft:overworld run tp ' + p.username + ' ' + dest.x + ' ' + dest.y + ' ' + dest.z);
                    }
                    HG.fn.sendActionBar(server, p, '§cThe Nether is locked.');
                }
            }
        }
    }

    // ── Portal destruction near players while nether locked (every 200 ticks, small 8-block radius) ──
    // Optimize: Reduced radius from 32 to 8 blocks, and checking frequency to 10 seconds to avoid major server freeze
    if (HG.nether.locked && HG.tick % 200 === 0) {
        for (let p of server.players) {
            let px = Math.floor(p.x);
            let py = Math.floor(p.y);
            let pz = Math.floor(p.z);
            server.runCommandSilent(
                'fill ' + (px - 8) + ' ' + (py - 8) + ' ' + (pz - 8) + ' ' +
                (px + 8) + ' ' + (py + 8) + ' ' + (pz + 8) + ' air replace nether_portal'
            );
        }
    }
});

// ════════════════════════════════════
//  COUNTDOWN → GO (chained scheduled tasks)
// ════════════════════════════════════

global.HG.fn.startCountdown = function (server, sender) {
    let HG = global.HG;

    if (!HG.game.running) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cGame not running. Teleport players first.');
        return;
    }
    if (HG.game.countdownActive) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cCountdown already in progress!');
        return;
    }
    if (HG.game.started) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cThe game has already started!');
        return;
    }

    HG.game.countdownActive = true;
    HG.fn.tell(server, sender,
        HG.cfg.prefix + ' §eCountdown started. (' + HG.cfg.freezeTime + 's freeze)');

    let timeLeft = HG.cfg.freezeTime;

    function tickCountdown() {
        if (!HG.game.running || !HG.game.countdownActive) return;

        if (timeLeft <= 0) {
            // ── UNFREEZE — GO! ──
            for (let p of server.players) {
                let uuid = p.uuid.toString();
                if (HG.frozen[uuid]) {
                    delete HG.frozen[uuid];
                    server.runCommandSilent('gamemode survival ' + p.username);
                    p.removeEffect('minecraft:slowness');
                    p.removeEffect('minecraft:jump_boost');
                }
            }

            // GO title to alive players
            HG.fn.alivePlayers(server).forEach(function (p) {
                HG.fn.sendTitle(server, p,
                    '§a§lGO!',
                    '§7Good luck.',
                    0, 60, 20);
                HG.fn.playSound(server, p, 'minecraft:entity.ender_dragon.growl');
            });

            HG.fn.broadcast(server, HG.cfg.prefix + ' §a§lThe Hunger Games have begun!');
            HG.game.countdownActive = false;
            HG.game.started = true;
            HG.game.elapsedSeconds = 0;

            // Initial states:
            HG.grace = true;
            HG.pvp = false;
            HG.nether.locked = true;

            // Destroy existing portals near all players immediately on start
            for (let p of server.players) {
                let px = Math.floor(p.x);
                let py = Math.floor(p.y);
                let pz = Math.floor(p.z);
                server.runCommandSilent(
                    'fill ' + (px - 64) + ' ' + (py - 64) + ' ' + (pz - 64) + ' ' +
                    (px + 64) + ' ' + (py + 64) + ' ' + (pz + 64) + ' air replace nether_portal'
                );
            }
            return;
        }

        // Determine visual appearance based on time left
        let color = '§a'; // green for > 10
        let sub = '§7Prepare yourself!';
        let sound = 'minecraft:block.note_block.hat';
        let pitch = 1.0;

        if (timeLeft <= 5) {
            color = '§4§l'; // bold dark red for last 5
            sub = '§cGet ready!';
            sound = 'minecraft:block.note_block.chime';
            pitch = 1.5;
        } else if (timeLeft <= 10) {
            color = '§e§l'; // bold gold/yellow for 6-10
            sub = '§ePrepare...';
            sound = 'minecraft:block.note_block.chime';
            pitch = 1.0;
        }

        // Broadcast to all alive players on title & sound
        HG.fn.alivePlayers(server).forEach(function (p) {
            HG.fn.sendTitle(server, p, color + timeLeft, sub, 0, 22, 0);
            HG.fn.playSound(server, p, sound, 1.0, pitch);
        });

        timeLeft--;
        server.scheduleInTicks(20, tickCountdown);
    }

    tickCountdown();
};

// ════════════════════════════════════
//  GRACE PERIOD
// ════════════════════════════════════

global.HG.fn.startGrace = function (server) {
    let HG = global.HG;
    HG.grace = true;
    HG.pvp = false;
    HG.graceRemaining = 60; // default 60s

    HG.fn.broadcast(server,
        HG.cfg.prefix + ' §aGrace period active. PvP disabled for 60 seconds.');
};

global.HG.fn.endGrace = function (server) {
    let HG = global.HG;
    HG.grace = false;
    HG.pvp = true;
    HG.graceRemaining = 0;

    // Action bar notification
    for (let p of server.players) {
        HG.fn.sendActionBar(server, p, '§cPvP is now enabled.');
    }

    HG.fn.broadcast(server, HG.cfg.prefix + ' §c§lPvP is now enabled.');

    HG.fn.alivePlayers(server).forEach(function (p) {
        server.runCommandSilent('gamemode survival ' + p.username);
        HG.fn.sendTitle(server, p, '§c§lPvP ON', '§7Watch your back.', 0, 60, 20);
        HG.fn.playSound(server, p, 'minecraft:entity.wither.spawn', 0.5);
    });
};

// ════════════════════════════════════
//  NETHER CONTROL
// ════════════════════════════════════

global.HG.fn.lockNether = function (server) {
    let HG = global.HG;
    HG.nether.locked = true;

    HG.fn.broadcast(server, HG.cfg.prefix + ' §c§lThe Nether is now closed.');

    // Find all alive players in the Nether and teleport them to spawn
    let count = 0;
    for (let p of server.players) {
        let uuid = p.uuid.toString();
        if (!HG.alive[uuid]) continue;

        let dim = p.level.dimension.toString();
        let isInsideNether = dim.indexOf('the_nether') !== -1;
        if (isInsideNether) {
            let slot = HG.assignment[uuid];
            let loc = HG.spawns[slot];
            if (loc) {
                server.runCommandSilent('execute in ' + loc.world + ' run tp ' + p.username + ' ' + loc.x + ' ' + loc.y + ' ' + loc.z);
            } else {
                server.runCommandSilent('execute in minecraft:overworld run tp ' + p.username + ' 0 200 0');
            }
            HG.fn.sendTitle(server, p, '§c§lNether Closed', '§7Teleported to spawn.', 10, 60, 20);
            HG.fn.playSound(server, p, 'minecraft:entity.wither.spawn', 0.5);
            count++;
        }
    }

    if (count > 0) {
        console.info('[HG] Teleported ' + count + ' players in the Nether back to spawn.');
    }
};

// ════════════════════════════════════
//  RESET GAME
// ════════════════════════════════════

global.HG.fn.resetGame = function (server) {
    let HG = global.HG;

    // Clear all state
    HG.game.running = false;
    HG.game.countdownActive = false;
    HG.game.started = false;
    HG.game.elapsedSeconds = 0;
    if (HG.lastNetherTp) HG.lastNetherTp = {};
    HG.grace = false;
    HG.pvp = false;
    HG.nether.locked = false;
    HG.graceRemaining = 0;

    // Kill all zombie proxies left in the world
    if (typeof HG.fn.killAllZombieProxies === 'function') {
        HG.fn.killAllZombieProxies(server);
    } else {
        // Fallback in case combat.js loaded after core.js
        try { server.runCommandSilent('kill @e[tag=hg_zombie_proxy]'); } catch (e) { }
        if (HG.zombieProxies) HG.zombieProxies = {};
        if (HG.zombiePlayerNames) HG.zombiePlayerNames = {};
        if (HG.zombieInventories) HG.zombieInventories = {};
    }

    // Release all players
    for (let p of server.players) {
        let uuid = p.uuid.toString();
        delete HG.frozen[uuid];
        delete HG.alive[uuid];
        delete HG.spectate[uuid];

        // Reset gamemode to survival if they're in spectator/adventure
        server.runCommandSilent('gamemode survival ' + p.username);
        p.removeAllEffects();
    }

    // Clear assignments (keep spawns for reuse)
    HG.assignment = {};

    // Reset world border
    server.runCommandSilent('worldborder set 60000000 0');

    HG.fn.broadcast(server, HG.cfg.prefix + ' §aGame reset. All players released.');
};

// ════════════════════════════════════
//  AUTO RUN (full sequence)
// ════════════════════════════════════

global.HG.fn.autoRun = function (server, sender) {
    let HG = global.HG;

    if (HG.game.running) {
        HG.fn.tell(server, sender, HG.cfg.prefix + ' §cA game is already running! Reset first.');
        return;
    }

    HG.fn.tell(server, sender, HG.cfg.prefix + ' §eRunning full sequence...');

    // Step 1: Assign
    HG.fn.assign(server, HG.cfg.assignMode, sender);

    // Step 2: Teleport (after 1 second)
    server.scheduleInTicks(20, function () {
        HG.fn.teleportPlayers(server, sender);

        // Step 3: Start countdown (after another 1 second to let tp settle)
        server.scheduleInTicks(20, function () {
            HG.fn.startCountdown(server, sender);
        });
    });
};

// Prevent Nether portal ignition when the Nether is locked
BlockEvents.rightClicked(function (event) {
    let HG = global.HG;
    if (!HG.nether.locked) return;

    let item = event.item;
    if (!item || item.empty) return;

    let itemId = item.id.toString();
    if (itemId === 'minecraft:flint_and_steel' || itemId === 'minecraft:fire_charge') {
        let block = event.block;
        if (!block) return;

        // Check if the clicked block itself or any of its 6 neighbors is obsidian
        let isNextToObsidian = false;
        let x = block.x;
        let y = block.y;
        let z = block.z;
        let level = block.level;

        try {
            if (block.id.toString() === 'minecraft:obsidian') {
                isNextToObsidian = true;
            } else {
                let neighbors = [
                    [1, 0, 0], [-1, 0, 0],
                    [0, 1, 0], [0, -1, 0],
                    [0, 0, 1], [0, 0, -1]
                ];
                for (let offset of neighbors) {
                    let nb = level.getBlock(x + offset[0], y + offset[1], z + offset[2]);
                    if (nb && nb.id.toString() === 'minecraft:obsidian') {
                        isNextToObsidian = true;
                        break;
                    }
                }
            }
        } catch (e) { }

        if (isNextToObsidian) {
            event.cancel();
            event.player.server.runCommandSilent('title ' + event.player.username + ' actionbar ' + JSON.stringify({ text: '§cThe Nether is locked. You cannot ignite portals.' }));
            event.player.server.runCommandSilent('execute at ' + event.player.username + ' run playsound minecraft:block.fire.extinguish master ' + event.player.username + ' ~ ~ ~ 0.5 1.5');
        }
    }
});

// Intercept dispenser usage of Flint & Steel and Fire Charges near obsidian when Nether is locked
(function () {
    try {
        var DispenserBlock = Java.loadClass('net.minecraft.world.level.block.DispenserBlock');
        var Items = Java.loadClass('net.minecraft.world.item.Items');
        var Blocks = Java.loadClass('net.minecraft.world.level.block.Blocks');

        var dispenserMap = null;
        try {
            dispenserMap = DispenserBlock.DISPENSER_REGISTRY;
        } catch (e) {
            try {
                dispenserMap = DispenserBlock.BEHAVIORS;
            } catch (e2) { }
        }

        if (dispenserMap) {
            if (!global.originalDispenserBehaviors) {
                global.originalDispenserBehaviors = {};
            }

            var originalFlint = global.originalDispenserBehaviors.flint || dispenserMap.get(Items.FLINT_AND_STEEL);
            var originalFireCharge = global.originalDispenserBehaviors.fireCharge || dispenserMap.get(Items.FIRE_CHARGE);

            if (originalFlint && !global.originalDispenserBehaviors.flint) {
                global.originalDispenserBehaviors.flint = originalFlint;
            }
            if (originalFireCharge && !global.originalDispenserBehaviors.fireCharge) {
                global.originalDispenserBehaviors.fireCharge = originalFireCharge;
            }

            function checkDispenseIgnition(source, stack, originalBehavior) {
                var HG = global.HG;
                if (HG && HG.nether && HG.nether.locked) {
                    try {
                        var level = (typeof source.level === 'function') ? source.level() : source.getLevel();
                        var pos = (typeof source.pos === 'function') ? source.pos() : source.getPos();
                        var state = (typeof source.state === 'function') ? source.state() : source.getBlockState();
                        var facing = state.getValue(DispenserBlock.FACING);
                        var targetPos = pos.relative(facing);

                        var isObsidian = (p) => {
                            try {
                                return level.getBlockState(p).is(Blocks.OBSIDIAN);
                            } catch (err) {
                                return false;
                            }
                        };

                        var nextToObsidian = isObsidian(targetPos) ||
                            isObsidian(targetPos.above()) ||
                            isObsidian(targetPos.below()) ||
                            isObsidian(targetPos.north()) ||
                            isObsidian(targetPos.south()) ||
                            isObsidian(targetPos.east()) ||
                            isObsidian(targetPos.west());

                        if (nextToObsidian) {
                            try {
                                level.levelEvent(1001, pos, 0); // Dispenser click fail sound
                            } catch (err) { }
                            return stack; // Cancel dispensing by returning unchanged stack
                        }
                    } catch (e) {
                        console.error("[HG] Error in dispenser ignition check: " + e);
                    }
                }
                return originalBehavior.dispense(source, stack);
            }

            if (originalFlint) {
                DispenserBlock.registerBehavior(Items.FLINT_AND_STEEL, (source, stack) => {
                    return checkDispenseIgnition(source, stack, originalFlint);
                });
            }
            if (originalFireCharge) {
                DispenserBlock.registerBehavior(Items.FIRE_CHARGE, (source, stack) => {
                    return checkDispenseIgnition(source, stack, originalFireCharge);
                });
            }
        }
    } catch (err) {
        console.error("[HG] Failed to register dispenser overrides: " + err);
    }
})();