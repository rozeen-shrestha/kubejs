// ================================================================
//  HUNGER GAMES — Combat, Death & Elimination
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-combat.sk
//
//  PvP handler, death messages, winner, disconnect
//  + Zombie Proxy system: disconnecting players leave a zombie behind
// ================================================================

// Safety: ensure global state exists regardless of load order
if (!global.HG) global.HG = { cfg: { prefix: '§6[HG]' }, game: { running: false, countdownActive: false }, grace: false, pvp: false, nether: { locked: false }, frozen: {}, alive: {}, spectate: {}, assignment: {}, spawns: {}, graceRemaining: 0, airdrop: { active: false }, tick: 0 };
if (!global.HG.fn) global.HG.fn = {};

// zombieProxies: maps zombie entity UUID string → player UUID string
// zombiePlayerNames: maps zombie entity UUID string → player username (for messages)
// zombieInventories: maps player UUID string → { armorItems, heldItems } (NBT arrays)
if (!global.HG.zombieProxies) global.HG.zombieProxies = {};
if (!global.HG.zombiePlayerNames) global.HG.zombiePlayerNames = {};
if (!global.HG.zombieInventories) global.HG.zombieInventories = {};

// ════════════════════════════════════
//  PVP DAMAGE HANDLER
// ════════════════════════════════════

// Helper to safely check if an entity is a player (raw or wrapped)
function isPlayer(entity) {
    if (!entity) return false;
    try {
        let className = String(entity.getClass ? entity.getClass().getName() : '');
        if (className.indexOf('Player') !== -1) return true;
    } catch (e) { }
    try {
        if (typeof entity.isPlayer === 'function' && entity.isPlayer()) return true;
        if (entity.isPlayer === true) return true;
    } catch (e) { }
    try {
        let typeStr = String(entity.type || (entity.getType ? entity.getType() : ''));
        if (typeStr.indexOf('player') !== -1) return true;
    } catch (e) { }
    try {
        if (entity.username) return true;
    } catch (e) { }
    return false;
}

// Helper to get player's username safely
function getPlayerName(player) {
    if (!player) return 'Unknown';
    try {
        if (player.username) return String(player.username);
        if (typeof player.getUsername === 'function') return String(player.getUsername());
        if (typeof player.getName === 'function') {
            let nameObj = player.getName();
            if (nameObj && typeof nameObj.getString === 'function') {
                return String(nameObj.getString());
            }
        }
    } catch (e) { }
    return String(player);
}

// Helper to resolve the player attacker from a hurt event
function getAttackerPlayer(event) {
    let source = event.source;
    if (source) {
        try {
            let causingEntity = source.getEntity();
            if (isPlayer(causingEntity)) return causingEntity;
        } catch (e) { }
        try {
            if (typeof source.getAttacker === 'function') {
                let causingEntity = source.getAttacker();
                if (isPlayer(causingEntity)) return causingEntity;
            }
        } catch (e) { }
        try {
            let causingEntity = source.entity;
            if (isPlayer(causingEntity)) return causingEntity;
        } catch (e) { }
        try {
            let causingEntity = source.attacker;
            if (isPlayer(causingEntity)) return causingEntity;
        } catch (e) { }
        try {
            let directEntity = source.getDirectEntity();
            if (isPlayer(directEntity)) return directEntity;
        } catch (e) { }
        try {
            let directEntity = source.directEntity;
            if (isPlayer(directEntity)) return directEntity;
        } catch (e) { }
    }

    let attacker = event.attacker;
    if (isPlayer(attacker)) return attacker;

    if (attacker) {
        try {
            if (typeof attacker.getOwner === 'function') {
                let owner = attacker.getOwner();
                if (isPlayer(owner)) return owner;
            }
        } catch (e) { }
        try {
            let owner = attacker.owner;
            if (isPlayer(owner)) return owner;
        } catch (e) { }
    }

    return null;
}

EntityEvents.hurt(function (event) {
    let HG = global.HG;
    let victim = event.entity;

    // 1. Prevents zombie proxies from burning/taking damage in sunlight
    if (victim && victim.type === 'minecraft:zombie' && victim.tags && typeof victim.tags.contains === 'function' && victim.tags.contains('hg_zombie_proxy')) {
        let source = event.source;
        if (source) {
            let typeId = '';
            let msgId = '';
            let sourceStr = '';
            try { typeId = String(source.getTypeId ? source.getTypeId() : (source.typeId || '')); } catch (e) { }
            try { msgId = String(source.getMsgId ? source.getMsgId() : (source.msgId || '')); } catch (e) { }
            try { sourceStr = String(source); } catch (e) { }

            let isFireDamage = false;
            let checkStr = (typeId + ' ' + msgId + ' ' + sourceStr).toLowerCase();
            if (checkStr.indexOf('fire') !== -1 || checkStr.indexOf('burn') !== -1 || checkStr.indexOf('sun') !== -1 || checkStr.indexOf('hot') !== -1) {
                isFireDamage = true;
            }

            if (isFireDamage) {
                let attacker = null;
                try { attacker = source.actual || source.getEntity(); } catch (e) { }
                if (!attacker) {
                    let bx = Math.floor(victim.x);
                    let by = Math.floor(victim.y);
                    let bz = Math.floor(victim.z);
                    let hasFireOrLava = false;
                    try {
                        let level = victim.level;
                        for (let dy = -1; dy <= 2; dy++) {
                            let b = level.getBlock(bx, by + dy, bz);
                            if (b) {
                                let id = b.id.toString();
                                if (id.indexOf('fire') !== -1 || id.indexOf('lava') !== -1) {
                                    hasFireOrLava = true;
                                    break;
                                }
                            }
                        }
                    } catch (e) { }

                    if (!hasFireOrLava) {
                        try {
                            event.setAmount(0);
                        } catch (e) {
                            try { event.amount = 0; } catch (e2) { }
                        }
                        event.cancel();
                        try {
                            victim.setRemainingFireTicks(0);
                        } catch (e) {
                            try { victim.extinguish(); } catch (e2) { }
                        }
                        return;
                    }
                }
            }
        }
    }

    // Helper to detect if an entity is a zombie proxy
    function isZombieProxy(entity) {
        if (!entity) return false;
        try {
            if (entity.tags && typeof entity.tags.contains === 'function') {
                return entity.tags.contains('hg_zombie_proxy');
            }
        } catch (e) { }
        return false;
    }

    // PvP rules for zombie proxies during grace period (when HG.pvp is false)
    if (!HG.pvp) {
        // Case 1: Player tries to attack a zombie proxy
        if (event.entity && isZombieProxy(event.entity)) {
            let victim = event.entity;
            let attacker = event.source.actual;
            if (attacker && isPlayer(attacker)) {
                try {
                    event.setAmount(0);
                } catch (e) {
                    try { event.amount = 0; } catch (e2) { }
                }
                try {
                    let server = victim.server || attacker.server;
                    if (server) {
                        HG.fn.sendActionBar(server, attacker, '§cPvP is disabled.');
                    }
                } catch (err) { }
                event.cancel();
                return;
            }
        }

        // Case 2: Zombie proxy tries to attack a player
        if (event.entity && event.entity.isPlayer() && event.source.actual && isZombieProxy(event.source.actual)) {
            let victim = event.entity;
            try {
                event.setAmount(0);
            } catch (e) {
                try { event.amount = 0; } catch (e2) { }
            }
            event.cancel();
            return;
        }
    }

    // Check if both the attacker (damager) and the target are players
    if (event.entity && event.entity.isPlayer() && event.source.actual && event.source.actual.isPlayer()) {
        let victim = event.entity;
        let attacker = event.source.actual;

        // Both are players — check PvP flag
        if (!HG.pvp) {
            // Set amount and action bar BEFORE cancel() in case cancel() exits the event block
            try {
                event.setAmount(0);
            } catch (e) {
                try {
                    event.amount = 0;
                } catch (e2) { }
            }

            try {
                let server = victim.server || attacker.server;
                if (server) {
                    HG.fn.sendActionBar(server, attacker, '§cPvP is disabled.');
                }
            } catch (err) { }

            event.cancel();
        }
    }
});

// ════════════════════════════════════
//  DEATH MESSAGES — Hunger Games flavored
// ════════════════════════════════════

// PvP kill messages (10 variants)
global.HG.fn.deathMessage = function (victimName, killerName) {
    let v = victimName;
    let k = killerName;
    let messages = [
        '§c' + v + ' §7was eliminated by §f' + k + '§7.',
        '§f' + k + ' §7has taken §f' + v + '§7\'s life.',
        '§f' + v + ' §7fell to §f' + k + '§7\'s blade.',
        '§f' + k + ' §7eliminated §f' + v + '§7.',
        '§f' + v + ' §7was no match for §f' + k + '§7.',
        '§f' + k + ' §7struck down §f' + v + '§7.',
        '§f' + v + ' §7was hunted down by §f' + k + '§7.',
        '§f' + k + ' §7has claimed §f' + v + '§7.',
        '§f' + v + ' §7was defeated by §f' + k + '§7.',
        '§f' + v + ' §7was slain by §f' + k + '§7.'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
};

// Environmental death messages (5 variants)
global.HG.fn.envDeathMessage = function (victimName) {
    let v = victimName;
    let messages = [
        '§f' + v + ' §7has been eliminated.',
        '§f' + v + ' §7did not survive the arena.',
        '§f' + v + ' §7has fallen.',
        '§f' + v + ' §7perished in the arena.',
        '§f' + v + ' §7met an untimely end.'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
};

// ════════════════════════════════════
//  DEATH EVENT
// ════════════════════════════════════

EntityEvents.death(function (event) {
    let victim = event.entity;
    let HG = global.HG;
    if (!HG) return;

    let isRealPlayer = (victim.type === 'minecraft:player');
    let isProxy = false;
    let playerUuid = null;
    let playerName = null;
    let proxyTag = null;

    if (victim.type === 'minecraft:zombie' && victim.tags && typeof victim.tags.contains === 'function' && victim.tags.contains('hg_zombie_proxy')) {
        // Find the specific tag for the player mapping
        victim.tags.forEach(function (t) {
            if (t.startsWith('hgproxy_')) {
                proxyTag = t;
            }
        });
        if (proxyTag && HG.zombieProxies && HG.zombieProxies[proxyTag]) {
            isProxy = true;
            playerUuid = HG.zombieProxies[proxyTag].uuid;
            playerName = HG.zombiePlayerNames[proxyTag] || 'Unknown';
        }
    }

    if (!isRealPlayer && !isProxy) return;

    let server = victim.server;
    let px = victim.x;
    let py = victim.y;
    let pz = victim.z;
    let dimStr = 'minecraft:overworld';
    try { dimStr = victim.level.dimension.toString(); } catch (e) { }

    // 1. Summon a visual-only lightning bolt at the victim's location (no damage, no fire)
    try {
        let level = victim.level;
        let lightning = level.createEntity('minecraft:lightning_bolt');
        lightning.setPosition(px, py, pz);

        // Attempt to set visualOnly/cosmetic flags to prevent damage and fire
        try {
            lightning.setVisualOnly(true);
        } catch (e1) {
            try {
                lightning.setCosmetic(true);
            } catch (e2) {
                try {
                    lightning.minecraftEntity.setVisualOnly(true);
                } catch (e3) {
                    try {
                        lightning.minecraftEntity.setCosmetic(true);
                    } catch (e4) { }
                }
            }
        }
        lightning.spawn();
    } catch (err) {
        console.error('Failed to spawn visual lightning: ' + err);
        // Fallback to standard command if API creation fails
        server.runCommandSilent('execute in ' + dimStr + ' run summon lightning_bolt ' + px + ' ' + py + ' ' + pz);
    }

    // 2. Broadcast "A Player has been eliminated" (without the player's username)
    if (HG.fn && typeof HG.fn.broadcast === 'function') {
        HG.fn.broadcast(server, '§cA player has been eliminated.');
    } else {
        server.runCommandSilent('tellraw @a {"text":"A player has been eliminated.","color":"red"}');
    }

    if (isRealPlayer) {
        // 3. Kick the player after a short delay (5 ticks) to allow the death to register in the world
        server.scheduleInTicks(5, function () {
            try {
                victim.kick('Player died');
            } catch (e) {
                server.runCommandSilent('kick ' + victim.username + ' Player died');
            }
        });

        // 4. Hunger Games specific logic (if game is running and player was an active tribute)
        if (HG.game && HG.game.running) {
            let uuid = victim.uuid.toString();
            if (HG.alive[uuid]) {
                delete HG.alive[uuid];
                delete HG.frozen[uuid];

                // Announce remaining count
                let remaining = HG.fn.aliveCount();
                HG.fn.broadcast(server, HG.cfg.prefix + ' §7Players remaining: §f' + remaining);

                // Mark for spectator on respawn (if they reconnect/respawn later)
                HG.spectate[uuid] = true;

                // Check for winner
                if (remaining <= 1) {
                    HG.fn.alivePlayers(server).forEach(function (winner) {
                        HG.fn.declareWinner(server, winner);
                    });
                }
            }
        }
    } else if (isProxy) {
        // Zombie proxy was killed — eliminate the offline player
        console.info('[HG ZombieProxy] Ghost zombie for ' + playerName + ' was killed. Eliminating player via Death Event.');

        // Clean up zombie proxy mapping
        delete HG.zombieProxies[proxyTag];
        delete HG.zombiePlayerNames[proxyTag];

        if (HG.alive[playerUuid]) {
            delete HG.alive[playerUuid];
            delete HG.frozen[playerUuid];

            // Drop saved inventory at the proxy location
            if (HG.zombieInventories[playerUuid]) {
                let itemsToDrop = HG.zombieInventories[playerUuid];
                itemsToDrop.forEach(function (savedItem) {
                    try {
                        let itemNbt = '{id:\"' + savedItem.id + '\",Count:' + savedItem.count + 'b';
                        if (savedItem.nbt && savedItem.nbt !== '{}') {
                            itemNbt += ',tag:' + savedItem.nbt;
                        }
                        itemNbt += '}';
                        let dropCmd = 'execute in ' + dimStr + ' run summon minecraft:item ' + px + ' ' + (py + 0.5) + ' ' + pz + ' {Item:' + itemNbt + '}';
                        server.runCommandSilent(dropCmd);
                    } catch (dropErr) {
                        console.error('[HG ZombieProxy] Failed to drop item: ' + dropErr);
                    }
                });
                delete HG.zombieInventories[playerUuid];
            }

            // Announce remaining count
            let remaining = HG.fn.aliveCount();
            HG.fn.broadcast(server, HG.cfg.prefix + ' §7Tributes remaining: §f' + remaining);

            if (remaining <= 1) {
                HG.fn.alivePlayers(server).forEach(function (winner) {
                    HG.fn.declareWinner(server, winner);
                });
            }
        }
    }
});

// ════════════════════════════════════
//  SPECTATOR ON RESPAWN
// ════════════════════════════════════

global.HG.fn.alivePlayers = function (server) {
    let result = [];
    for (let p of server.players) {
        if (global.HG.alive[p.uuid.toString()]) {
            result.push(p);
        }
    }
    return result;
};

PlayerEvents.respawned(function (event) {
    let HG = global.HG;
    let player = event.player;
    let uuid = player.uuid.toString();

    if (HG.spectate[uuid]) {
        delete HG.spectate[uuid];
        // Small delay to ensure respawn completes
        player.server.scheduleInTicks(2, function () {
            player.server.runCommandSilent('gamemode spectator ' + player.username);
        });
    }
});

// ════════════════════════════════════
//  WINNER DECLARATION
// ════════════════════════════════════

global.HG.fn.declareWinner = function (server, winner) {
    let HG = global.HG;
    let name = winner.username;

    HG.fn.broadcast(server, '§6§l━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    HG.fn.broadcast(server, '§e§l    VICTOR OF THE HUNGER GAMES');
    HG.fn.broadcast(server, '§f§l    ' + name);
    HG.fn.broadcast(server, '§6§l━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    HG.fn.sendTitle(server, winner,
        '§e§lVICTORY',
        '§6You are the last player  standing.',
        0, 100, 20);

    // Celebration fireworks around the winner (20 rockets)
    let px = Math.floor(winner.x);
    let py = Math.floor(winner.y);
    let pz = Math.floor(winner.z);

    // Stagger fireworks over time
    for (let i = 0; i < 20; i++) {
        (function (index) {
            server.scheduleInTicks(index * 5, function () {
                let fx = px + Math.floor(Math.random() * 11) - 5;
                let fy = py + 1 + Math.floor(Math.random() * 10);
                let fz = pz + Math.floor(Math.random() * 11) - 5;
                server.runCommandSilent(
                    'summon firework_rocket ' + fx + ' ' + fy + ' ' + fz +
                    ' {LifeTime:10,Fireworks:{Flight:0b,Explosions:[{' +
                    'Type:1,Flicker:1b,Trail:1b,' +
                    'Colors:[I;16776960,16753920],' +
                    'FadeColors:[I;16777215]}]}}'
                );
            });
        })(i);
    }

    HG.fn.playSound(server, winner, 'minecraft:ui.toast.challenge_complete');

    // End the game after celebration (3 seconds)
    server.scheduleInTicks(60, function () {
        HG.fn.resetGame(server);
    });
};

// ════════════════════════════════════
//  ZOMBIE PROXY SYSTEM
//  When a player disconnects mid-game, a stationary zombie is
//  spawned in their place. The zombie has their health, wears
//  their armor, deals damage to nearby players, and cannot move.
//  If the zombie is killed, the offline player is also eliminated.
//  If the player reconnects before the zombie dies, they resume
//  normally and the zombie is removed.
// ════════════════════════════════════

// ── Helper: spawn a zombie proxy for a disconnected player ──
global.HG.fn.spawnZombieProxy = function (server, playerUuid, playerName, px, py, pz, dimStr, healthPct, armorSlots, handItemsNbt) {
    let HG = global.HG;

    // maxHealth in half-hearts (20 = 10 full hearts). Scale current HP proportionally.
    // healthPct is a value 0-1 (fraction of full health).
    let halfHearts = Math.max(1, Math.round(healthPct * 20));

    // Build armor NBT string from saved armor slot data
    let armorNbt = '[{},{},{},{}]'; // default empty
    if (armorSlots && armorSlots.length === 4) {
        let parts = armorSlots.map(function (slot) {
            return slot ? slot : '{}';
        });
        armorNbt = '[' + parts.join(',') + ']';
    }

    let tag = 'hgproxy_' + playerUuid.replace(/-/g, '_');
    let displayName = '{"text":"[GHOST] ' + playerName + '","color":"red","bold":true}';

    // NBT for a stationary zombie with NoAI:0b (so it can still attack players close by)
    // and Attributes to set movement speed to 0.0 and knockback resistance to 1.0 (so it won't move).
    // Drop chances are set to 0.0f so it does not drop its visual model gear upon death.
    let nbt = '{' +
        'NoAI:0b,' +
        'IsBaby:0b,' +
        'Silent:0b,' +
        'PersistenceRequired:1b,' +
        'CustomName:\'' + displayName + '\',' +
        'CustomNameVisible:1b,' +
        'Health:' + halfHearts + '.0f,' +
        'MaxHealth:20.0f,' +
        'CanBreakDoors:0b,' +
        'Attributes:[{Name:\"generic.movement_speed\",Base:0.0d},{Name:\"generic.knockback_resistance\",Base:1.0d}],' +
        'ArmorItems:' + armorNbt + ',' +
        'HandItems:' + handItemsNbt + ',' +
        'ArmorDropChances:[0.0f,0.0f,0.0f,0.0f],' +
        'HandDropChances:[0.0f,0.0f],' +
        'Tags:[\'hg_zombie_proxy\',\'hgproxy\',\'' + tag + '\']' +
        '}';

    // Summon the zombie
    let summonCmd;
    if (dimStr && dimStr.indexOf('overworld') === -1) {
        summonCmd = 'execute in ' + dimStr + ' run summon minecraft:zombie ' + px + ' ' + py + ' ' + pz + ' ' + nbt;
    } else {
        summonCmd = 'summon minecraft:zombie ' + px + ' ' + py + ' ' + pz + ' ' + nbt;
    }

    try {
        server.runCommandSilent(summonCmd);
        // Give infinite fire resistance so it does not burn in sunlight
        server.runCommandSilent('execute in ' + dimStr + ' run effect give @e[tag=' + tag + '] minecraft:fire_resistance infinite 0 true');
    } catch (e) {
        console.error('[HG ZombieProxy] Failed to summon zombie: ' + e);
    }

    // We store the mapping tag → data object for tracking and position enforcement
    HG.zombieProxies[tag] = { uuid: playerUuid, x: px, y: py, z: pz, dim: dimStr, spawnedAt: (HG.tick || 0) };
    HG.zombiePlayerNames[tag] = playerName;

    console.info('[HG ZombieProxy] Spawned ghost zombie for ' + playerName + ' (' + playerUuid + ') at ' + px + ' ' + py + ' ' + pz);
};

// ── Tick-based: enforce position and check zombie proxy deaths ──
ServerEvents.tick(function (zombieTickEvent) {
    let HG = global.HG;
    if (!HG.game.running) return;
    if (!HG.zombieProxies) return;

    let proxyTags = Object.keys(HG.zombieProxies);
    if (proxyTags.length === 0) return;

    let server = zombieTickEvent.server;

    // Enforce position using fast command selectors (handled in Java by Minecraft)
    // Runs once every tick to ensure the zombie stays in place.
    // This entirely avoids expensive level.getEntities() calls in JS.
    proxyTags.forEach(function (tag) {
        let proxyData = HG.zombieProxies[tag];
        if (proxyData && typeof proxyData === 'object') {
            server.runCommandSilent('execute in ' + proxyData.dim + ' as @e[tag=' + tag + '] at @s run tp @s ' + proxyData.x + ' ' + proxyData.y + ' ' + proxyData.z);
        }
    });

    // NOTE: Sunlight burning is prevented by Fire Resistance given on spawn.
    // Zombie proxy death is handled dynamically by EntityEvents.death.
});

// ── If the player reconnects while their zombie is still alive — remove the zombie ──
PlayerEvents.loggedIn(function (reconnectEvent) {
    let HG = global.HG;

    let player = reconnectEvent.player;
    let uuid = player.uuid.toString();
    let server = player.server;

    // Case A: If they reconnect and the zombie is alive, remove the zombie
    let tag = 'hgproxy_' + uuid.replace(/-/g, '_');
    if (HG.zombieProxies[tag]) {
        let proxyData = HG.zombieProxies[tag];
        let remainingHealthPct = 1.0;
        let foundZombie = null;
        try {
            let level = null;
            try {
                level = server.getLevel(proxyData.dim);
            } catch (e) {
                try {
                    level = server.getLevel('minecraft:overworld');
                } catch (e2) {
                    level = server.overworld;
                }
            }
            if (level) {
                let entities = level.getEntities ? level.getEntities() : level.entities;
                for (let ent of entities) {
                    if (ent.tags && ent.tags.contains(tag)) {
                        let hp = ent.health;
                        let maxHp = ent.maxHealth || 20.0;
                        if (maxHp > 0) {
                            remainingHealthPct = hp / maxHp;
                        }
                        foundZombie = ent;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('[HG ZombieProxy] Failed to get zombie health: ' + e);
        }

        // Clean up zombie proxy mappings BEFORE removing entity so that if a death event fires,
        // it doesn't recognize it as a proxy death.
        delete HG.zombieProxies[tag];
        delete HG.zombiePlayerNames[tag];
        delete HG.zombieInventories[uuid];

        // Cleanly discard the zombie proxy if possible to prevent any death mechanics
        if (foundZombie) {
            try {
                foundZombie.discard();
            } catch (e) {
                try {
                    foundZombie.remove('discarded');
                } catch (e2) {
                    // Fallback to kill command if entity removal methods fail
                    try {
                        server.runCommandSilent('kill @e[tag=' + tag + ']');
                    } catch (e3) { }
                }
            }
        } else {
            // If we didn't find it via entity list loop, run the kill command just in case
            try {
                server.runCommandSilent('kill @e[tag=' + tag + ']');
            } catch (e) { }
        }

        // Let the player resume in survival (they're still alive) and sync health
        player.server.scheduleInTicks(5, function () {
            try {
                server.runCommandSilent('gamemode survival ' + player.username);
            } catch (e) { }
            try {
                let targetHp = player.maxHealth * remainingHealthPct;
                targetHp = Math.max(1.0, targetHp);
                player.health = targetHp;
            } catch (e) {
                try {
                    player.setHealth(Math.max(1.0, player.getMaxHealth() * remainingHealthPct));
                } catch (e2) { }
            }
        });

        console.info('[HG ZombieProxy] Player ' + player.username + ' reconnected, ghost removed.');
    } else {
        // Case B: If a game is running, and the player is not registered as alive anymore (eliminated while offline)
        if (HG.game.running && !HG.alive[uuid]) {
            // Clear their inventory and gamemode to spectator
            server.scheduleInTicks(5, function () {
                try {
                    server.runCommandSilent('clear ' + player.username);
                    server.runCommandSilent('gamemode spectator ' + player.username);
                } catch (e) { }
            });
        }
    }
});

// ── Helper: kill all zombie proxies (used on reset) ──
global.HG.fn.killAllZombieProxies = function (server) {
    let HG = global.HG;
    try {
        server.runCommandSilent('kill @e[tag=hg_zombie_proxy]');
    } catch (e) { }
    HG.zombieProxies = {};
    HG.zombiePlayerNames = {};
    HG.zombieInventories = {};
};

// ════════════════════════════════════
//  DISCONNECT HANDLING
//  Instead of eliminating immediately, spawn a zombie proxy.
// ════════════════════════════════════

PlayerEvents.loggedOut(function (event) {
    let HG = global.HG;
    if (!HG.game.running) return;

    let player = event.player;
    let uuid = player.uuid.toString();

    if (!HG.alive[uuid]) return; // not an active tribute

    let server = player.server;
    let px = player.x;
    let py = player.y;
    let pz = player.z;
    let dim = 'minecraft:overworld';
    try { dim = player.level.dimension.toString(); } catch (e) { }

    // Capture health fraction (health/maxHealth)
    let healthFraction = 1.0;
    try {
        let hp = player.health;
        let maxHp = player.maxHealth;
        if (maxHp > 0) healthFraction = hp / maxHp;
    } catch (e) { }

    // Capture armor items as NBT strings
    let armorSlots = ['{}', '{}', '{}', '{}'];
    try {
        let inv = player.inventory;
        if (inv) {
            let slots = [36, 37, 38, 39]; // boots, leggings, chestplate, helmet
            for (let i = 0; i < slots.length; i++) {
                try {
                    let item = inv.getItem(slots[i]);
                    if (item && !item.empty) {
                        let nbt = item.nbt;
                        let idStr = item.id.toString();
                        let count = item.count || 1;
                        let nbtStr = nbt ? nbt.toString() : '{}';
                        armorSlots[i] = '{id:\"' + idStr + '\",Count:' + count + 'b,tag:' + nbtStr + '}';
                    }
                } catch (e2) { }
            }
        }
    } catch (e) { }

    // Capture hand items NBT
    let handItemsNbt = '[{},{}]';
    try {
        let mainHand = player.mainHandItem;
        let offHand = player.offHandItem;
        let mainStr = '{}';
        let offStr = '{}';
        if (mainHand && !mainHand.empty) {
            let nbt = mainHand.nbt;
            let nbtStr = nbt ? nbt.toString() : '{}';
            mainStr = '{id:\"' + mainHand.id.toString() + '\",Count:' + (mainHand.count || 1) + 'b,tag:' + nbtStr + '}';
        }
        if (offHand && !offHand.empty) {
            let nbt = offHand.nbt;
            let nbtStr = nbt ? nbt.toString() : '{}';
            offStr = '{id:\"' + offHand.id.toString() + '\",Count:' + (offHand.count || 1) + 'b,tag:' + nbtStr + '}';
        }
        handItemsNbt = '[' + mainStr + ',' + offStr + ']';
    } catch (e) { }

    // Save entire inventory to drop if zombie is killed
    let savedInventory = [];
    try {
        let inv = player.inventory;
        if (inv) {
            // slots 0-40 (0-35: main/hotbar, 36-39: armor, 40: offhand)
            for (let i = 0; i < 41; i++) {
                try {
                    let item = inv.getItem(i);
                    if (item && !item.empty) {
                        let nbt = item.nbt;
                        let idStr = item.id.toString();
                        let count = item.count || 1;
                        let nbtStr = nbt ? nbt.toString() : '{}';
                        savedInventory.push({
                            slot: i,
                            id: idStr,
                            count: count,
                            nbt: nbtStr
                        });
                    }
                } catch (e2) { }
            }
        }
    } catch (e) { }
    HG.zombieInventories[uuid] = savedInventory;

    let playerName = player.username;

    // Spawn the zombie proxy
    HG.fn.spawnZombieProxy(server, uuid, playerName, px, py, pz, dim, healthFraction, armorSlots, handItemsNbt);
});
