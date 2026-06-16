// ================================================================
//  HUNGER GAMES — Spawn Region Protection
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//
//  Commands (OP only, under /hg):
//    /hg region give    — gives the Region Selector stick
//    /hg region confirm — saves the two selected corners
//    /hg region clear   — removes the region
//    /hg region info    — shows current region bounds
//
//  Block logic:
//    - Original blocks inside the region cannot be broken by players
//    - Players CAN place blocks inside the region; they auto-remove in 5s
//    - Player-placed blocks can be manually broken before the timer
//
//  Edit PLACED_LIFETIME_TICKS below to change the removal delay.
// ================================================================

// ── State init ──────────────────────────────────────────────────
if (!global.HG)       global.HG       = {};
if (!global.HG.fn)    global.HG.fn    = {};

// Active region bounds { minX, minY, minZ, maxX, maxY, maxZ } or null
if (global.HG.region    === undefined) global.HG.region    = null;
// Per-player wand selection { uuid: { c1:{x,y,z}, c2:{x,y,z} } }
if (global.HG.regionSel === undefined) global.HG.regionSel = {};
// Set of "x,y,z" keys for player-placed blocks (allows them to be broken)
if (global.HG.placed    === undefined) global.HG.placed    = {};
if (global.HG.breakerCounter === undefined) global.HG.breakerCounter = 1000;
// Set of "x,y,z" keys for original/decorative fluid blocks to exempt them from decay
if (global.HG.originalFluids === undefined) global.HG.originalFluids = {};
var ORIGINAL_FLUIDS_FILE = 'kubejs/hg_original_fluids.json';

// ── Tunable constant ───────────────────────────────────────────
var REGION_FILE          = 'kubejs/hg_spawn_region.json';
var PLACED_LIFETIME_TICKS = 200; // 10 seconds @ 20 TPS

// ── Cache a server reference for use inside block events ────────
// scheduleInTicks needs a server object; block events don't expose one directly.
ServerEvents.tick(function (event) {
    global.HG._srv = event.server;
});

// ════════════════════════════════════════════════════════
//  PERSISTENCE
// ════════════════════════════════════════════════════════

global.HG.fn.saveRegion = function () {
    try {
        // Always write a plain JS object so JsonIO serialises it cleanly
        var payload = global.HG.region
            ? {
                minX: global.HG.region.minX, minY: global.HG.region.minY, minZ: global.HG.region.minZ,
                maxX: global.HG.region.maxX, maxY: global.HG.region.maxY, maxZ: global.HG.region.maxZ
              }
            : {};
        JsonIO.write(REGION_FILE, payload);
        console.info('[HG Protection] Region saved to ' + REGION_FILE + '.');
    } catch (e) {
        console.error('[HG Protection] saveRegion failed: ' + e);
    }
};

global.HG.fn.loadRegion = function () {
    try {
        var data = JsonIO.read(REGION_FILE);
        // JsonIO returns a Java JsonObject; .get() returns JsonElement or null
        if (data == null) { global.HG.region = null; console.info('[HG Protection] No region file.'); return; }

        // Check for a valid field; empty object means cleared intentionally
        // JsonIO.read returns plain Java primitives (int/double), NOT JsonElement.
        // Use Number() to coerce them safely to JS numbers.
        var minXVal = data.get('minX');
        if (minXVal == null) { global.HG.region = null; console.info('[HG Protection] Region file is empty (cleared).'); return; }

        global.HG.region = {
            minX: Math.floor(Number(data.get('minX'))),
            minY: Math.floor(Number(data.get('minY'))),
            minZ: Math.floor(Number(data.get('minZ'))),
            maxX: Math.floor(Number(data.get('maxX'))),
            maxY: Math.floor(Number(data.get('maxY'))),
            maxZ: Math.floor(Number(data.get('maxZ')))
        };
        var r = global.HG.region;
        console.info(
            '[HG Protection] Loaded region: (' + r.minX + ',' + r.minY + ',' + r.minZ +
            ') → (' + r.maxX + ',' + r.maxY + ',' + r.maxZ + ')'
        );
    } catch (e) {
        console.error('[HG Protection] loadRegion failed: ' + e);
        global.HG.region = null;
    }
};

global.HG.fn.saveOriginalFluids = function () {
    try {
        JsonIO.write(ORIGINAL_FLUIDS_FILE, global.HG.originalFluids);
        console.info('[HG Protection] Original fluids saved to ' + ORIGINAL_FLUIDS_FILE + '.');
    } catch (e) {
        console.error('[HG Protection] saveOriginalFluids failed: ' + e);
    }
};

global.HG.fn.loadOriginalFluids = function () {
    try {
        var data = JsonIO.read(ORIGINAL_FLUIDS_FILE);
        if (data == null) {
            global.HG.originalFluids = {};
            console.info('[HG Protection] No original fluids file.');
            return;
        }
        var obj = {};
        for (var key in data) {
            obj[key] = true;
        }
        global.HG.originalFluids = obj;
        console.info('[HG Protection] Loaded ' + Object.keys(global.HG.originalFluids).length + ' original fluid coordinates.');
    } catch (e) {
        console.error('[HG Protection] loadOriginalFluids failed: ' + e);
        global.HG.originalFluids = {};
    }
};

// Load immediately on script evaluation (captures /reload changes)
global.HG.fn.loadRegion();
global.HG.fn.loadOriginalFluids();

// ════════════════════════════════════════════════════════
//  GEOMETRY HELPERS
// ════════════════════════════════════════════════════════

global.HG.fn.isInRegion = function (x, y, z) {
    var r = global.HG.region;
    if (!r) return false;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    return x >= r.minX && x <= r.maxX
        && y >= r.minY && y <= r.maxY
        && z >= r.minZ && z <= r.maxZ;
};

global.HG.fn.regionFromCorners = function (c1, c2) {
    return {
        minX: Math.min(Math.floor(c1.x), Math.floor(c2.x)),
        minY: Math.min(Math.floor(c1.y), Math.floor(c2.y)),
        minZ: Math.min(Math.floor(c1.z), Math.floor(c2.z)),
        maxX: Math.max(Math.floor(c1.x), Math.floor(c2.x)),
        maxY: Math.max(Math.floor(c1.y), Math.floor(c2.y)),
        maxZ: Math.max(Math.floor(c1.z), Math.floor(c2.z))
    };
};

// ════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ════════════════════════════════════════════════════════

function posKey(x, y, z) {
    return Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z);
}

function isOp(player) {
    if (player == null) return false;
    try { if (player.hasPermissions) return player.hasPermissions(2); } catch (e) {}
    try { return player.server.getPlayerList().isOp(player.gameProfile); } catch (e) {}
    return false;
}

function getSoundGroup(blockId) {
    if (!blockId) return 'stone';
    blockId = String(blockId).toLowerCase();
    if (blockId.indexOf('wood') !== -1 || blockId.indexOf('planks') !== -1 || blockId.indexOf('log') !== -1 || blockId.indexOf('fence') !== -1 || blockId.indexOf('door') !== -1) {
        return 'wood';
    }
    if (blockId.indexOf('grass') !== -1 || blockId.indexOf('dirt') !== -1) {
        return 'grass';
    }
    if (blockId.indexOf('sand') !== -1) {
        return 'sand';
    }
    if (blockId.indexOf('gravel') !== -1) {
        return 'gravel';
    }
    if (blockId.indexOf('wool') !== -1 || blockId.indexOf('carpet') !== -1) {
        return 'wool';
    }
    if (blockId.indexOf('glass') !== -1) {
        return 'glass';
    }
    return 'stone';
}

function isHoldingSelector(item) {
    if (!item || item.empty) return false;
    // Must be a stick
    var id = '';
    try { id = String(item.id || item.getId() || ''); } catch (e) {}
    if (id.indexOf('stick') === -1) return false;
    // Must have "Region Selector" in its NBT or display name
    try { if (item.nbt && item.nbt.toString().indexOf('Region Selector') !== -1) return true; } catch (e) {}
    try {
        var name = '';
        if      (item.getHoverName)   { var n  = item.getHoverName();   name = n.getString ? n.getString() : String(n); }
        else if (item.getName)        { var n2 = item.getName();        name = n2.getString ? n2.getString() : String(n2); }
        else if (item.getDisplayName) { var n3 = item.getDisplayName(); name = n3.getString ? n3.getString() : String(n3); }
        if (name.indexOf('Region Selector') !== -1) return true;
    } catch (e) {}
    return false;
}

function tell(server, username, msg) {
    server.runCommandSilent('tellraw ' + username + ' {"text":"' + msg + '","italic":false}');
}

// ════════════════════════════════════════════════════════
//  CORNER SELECTION — Right-click = Corner 1
// ════════════════════════════════════════════════════════

BlockEvents.rightClicked(function (event) {
    var player = event.player;
    if (player == null) return;
    if (!isOp(player)) return;
    if (!isHoldingSelector(player.mainHandItem)) return;

    var bx = Math.floor(event.block.x);
    var by = Math.floor(event.block.y);
    var bz = Math.floor(event.block.z);
    var uuid = player.uuid.toString();

    if (!global.HG.regionSel[uuid]) global.HG.regionSel[uuid] = {};
    global.HG.regionSel[uuid].c1 = { x: bx, y: by, z: bz };

    tell(player.server, player.username,
        '§b[HG Region] §fCorner 1 §7→ §f(' + bx + ', ' + by + ', ' + bz + ')');
    console.info('[HG Protection] ' + player.username + ' set C1 at ' + bx + ',' + by + ',' + bz);
    event.cancel();
});

// ════════════════════════════════════════════════════════
//  CORNER SELECTION — Left-click = Corner 2
// ════════════════════════════════════════════════════════

BlockEvents.leftClicked(function (event) {
    var player = event.player;
    if (player == null) return;
    if (!isOp(player)) return;
    if (!isHoldingSelector(player.mainHandItem)) return;

    var bx = Math.floor(event.block.x);
    var by = Math.floor(event.block.y);
    var bz = Math.floor(event.block.z);
    var uuid = player.uuid.toString();

    if (!global.HG.regionSel[uuid]) global.HG.regionSel[uuid] = {};
    global.HG.regionSel[uuid].c2 = { x: bx, y: by, z: bz };

    tell(player.server, player.username,
        '§b[HG Region] §fCorner 2 §7→ §f(' + bx + ', ' + by + ', ' + bz +
        '). §aRun /hg region confirm to save!');
    console.info('[HG Protection] ' + player.username + ' set C2 at ' + bx + ',' + by + ',' + bz);
    event.cancel();
});

// ════════════════════════════════════════════════════════
//  BLOCK BREAK PROTECTION
// ════════════════════════════════════════════════════════

BlockEvents.broken(function (event) {
    if (!global.HG.region) return;

    var bx = Math.floor(event.block.x);
    var by = Math.floor(event.block.y);
    var bz = Math.floor(event.block.z);

    if (!global.HG.fn.isInRegion(bx, by, bz)) return;

    var key = posKey(bx, by, bz);
    var player = event.player;

    // If it was a tracked block, delete the tracking key upon break
    if (global.HG.placed[key] !== undefined) {
        if (player == null || isOp(player)) {
            delete global.HG.placed[key];
            if (global.HG.fluidBlocks[key] !== undefined) delete global.HG.fluidBlocks[key];
            return;
        }
        // For survival players, only allow breaking if they placed it themselves (value !== -1)
        if (global.HG.placed[key] !== -1) {
            delete global.HG.placed[key];
            if (global.HG.fluidBlocks[key] !== undefined) delete global.HG.fluidBlocks[key];
            console.info('[HG Protection] Allowed break of player-placed block at ' + key + ' by ' + player.username);
            return;
        }
    } else {
        if (player == null || isOp(player)) {
            if (global.HG.fluidBlocks[key] !== undefined) delete global.HG.fluidBlocks[key];
            return;
        }
    }

    // For survival players, allow breaking fluid-related and generated mix blocks ONLY if they are currently tracked as decaying fluid blocks!
    var blockId = event.block.id.toString();
    if (blockId === 'minecraft:cobblestone' || 
        blockId === 'minecraft:obsidian' || 
        blockId === 'minecraft:stone' ||
        blockId === 'minecraft:basalt' ||
        blockId === 'minecraft:water' || 
        blockId === 'minecraft:lava') {
        
        if (global.HG.fluidBlocks[key] !== undefined) {
            delete global.HG.fluidBlocks[key];
            console.info('[HG Protection] Allowed break of fluid/mix block ' + blockId + ' at ' + key + ' by ' + player.username);
            return;
        }
    }

    // Deny breaking original/protected block
    event.cancel();
    tell(player.server, player.username, '§cThis block is protected.');

    // Show block-crack particles and play a dig sound at the target position
    try {
        player.server.runCommandSilent(
            'particle block ' + blockId + ' ' +
            (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) +
            ' 0.3 0.3 0.3 0.05 20 force ' + player.username
        );
        player.server.runCommandSilent(
            'playsound minecraft:block.' + getSoundGroup(blockId) + '.hit block ' +
            player.username + ' ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 1 0.8'
        );
    } catch (particleErr) {
        // Fallback: generic stone hit sound
        try {
            player.server.runCommandSilent(
                'playsound minecraft:block.stone.hit block ' +
                player.username + ' ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 1 0.8'
            );
        } catch (e) {}
    }

    console.info('[HG Protection] Blocked break at ' + key + ' by ' + player.username);
});

// Prevent non-OP players from placing water or lava buckets inside the protection region,
// and track non-OP fluid placements outside so any flow into the region can be decayed.
BlockEvents.rightClicked(function (event) {
    var player = event.player;
    if (player == null) return;
    if (isOp(player)) return;

    var item = event.item;
    if (item && (item.id === 'minecraft:water_bucket' || item.id === 'minecraft:lava_bucket')) {
        var bx = Math.floor(event.block.x);
        var by = Math.floor(event.block.y);
        var bz = Math.floor(event.block.z);

        if (global.HG.fn.isInRegion(bx, by, bz)) {
            event.cancel();
            tell(player.server, player.username, '§cYou cannot place fluids inside the spawn protection region.');
            return;
        }

        // Calculate targeted fluid placement coordinate
        var targetX = bx;
        var targetY = by;
        var targetZ = bz;
        var facing = event.facing;
        if (facing) {
            var dirStr = facing.toString().toLowerCase();
            if      (dirStr === 'up')    targetY += 1;
            else if (dirStr === 'down')  targetY -= 1;
            else if (dirStr === 'north') targetZ -= 1;
            else if (dirStr === 'south') targetZ += 1;
            else if (dirStr === 'west')  targetX -= 1;
            else if (dirStr === 'east')  targetX += 1;
        }

        var key = targetX + ',' + targetY + ',' + targetZ;
        global.HG.placed[key] = 'fluid';
        console.info('[HG Protection] Non-OP fluid placement tracked at ' + key);
    }
});

// ════════════════════════════════════════════════════════
//  PLACED BLOCK TRACKING + AUTO-REMOVAL (scheduleInTicks)
// ════════════════════════════════════════════════════════

BlockEvents.placed(function (event) {
    if (!global.HG.region) return;

    var player = event.player;
    if (player == null) return;

    var bx = Math.floor(event.block.x);
    var by = Math.floor(event.block.y);
    var bz = Math.floor(event.block.z);

    if (!global.HG.fn.isInRegion(bx, by, bz)) return;

    var key = posKey(bx, by, bz);

    if (isOp(player)) {
        // Mark as placed by OP, so it is skipped by the fluid & mix auto-removal tracker and never auto-removed
        global.HG.placed[key] = -1;
        return;
    }

    // Capture dimension string for the execute-in command
    var dim = 'minecraft:overworld';
    try { dim = String(event.level.dimension); } catch (e) {}

    // Store the current tick as a unique placement ID.
    // This lets the scheduled callback detect if the block was broken and
    // re-placed at the same spot — and skip the removal for the old timer.
    var placedAt = global.HG.tick || 0;
    global.HG.placed[key] = placedAt;

    console.info('[HG Protection] Placed block tracked at ' + key + ' (dim=' + dim + ', id=' + placedAt + ') — removing in ' + PLACED_LIFETIME_TICKS + ' ticks');

    // Use scheduleInTicks for reliable 5-second removal
    var srv = global.HG._srv;
    if (srv) {
        var pos = new BlockPos(bx, by, bz);
        var breakerId = global.HG.breakerCounter;
        global.HG.breakerCounter = breakerId + 1;

        // Stage 2 (40 ticks / 2s): crack stage 2, small smoke puff, hit sound
        srv.scheduleInTicks(40, function () {
            if (global.HG.placed[key] === placedAt) {
                var level = srv.getLevel(dim);
                if (level) {
                    level.destroyBlockProgress(breakerId, pos, 2);
                    var block = level.getBlock(bx, by, bz);
                    if (block && !block.air) {
                        srv.runCommandSilent('execute in ' + dim + ' run particle minecraft:smoke ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.2 0.2 0.2 0.01 5 force @a');
                        srv.runCommandSilent('execute in ' + dim + ' run playsound minecraft:block.' + getSoundGroup(block.id.toString()) + '.hit block @a ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.6 0.6');
                    }
                }
            }
        });

        // Stage 4 (80 ticks / 4s): crack stage 4, small smoke puff, hit sound
        srv.scheduleInTicks(80, function () {
            if (global.HG.placed[key] === placedAt) {
                var level = srv.getLevel(dim);
                if (level) {
                    level.destroyBlockProgress(breakerId, pos, 4);
                    var block = level.getBlock(bx, by, bz);
                    if (block && !block.air) {
                        srv.runCommandSilent('execute in ' + dim + ' run particle minecraft:smoke ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.2 0.2 0.2 0.01 5 force @a');
                        srv.runCommandSilent('execute in ' + dim + ' run playsound minecraft:block.' + getSoundGroup(block.id.toString()) + '.hit block @a ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.6 0.6');
                    }
                }
            }
        });

        // Stage 6 (120 ticks / 6s): crack stage 6, small smoke puff, hit sound
        srv.scheduleInTicks(120, function () {
            if (global.HG.placed[key] === placedAt) {
                var level = srv.getLevel(dim);
                if (level) {
                    level.destroyBlockProgress(breakerId, pos, 6);
                    var block = level.getBlock(bx, by, bz);
                    if (block && !block.air) {
                        srv.runCommandSilent('execute in ' + dim + ' run particle minecraft:smoke ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.2 0.2 0.2 0.01 5 force @a');
                        srv.runCommandSilent('execute in ' + dim + ' run playsound minecraft:block.' + getSoundGroup(block.id.toString()) + '.hit block @a ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.6 0.6');
                    }
                }
            }
        });

        // Stage 8 (160 ticks / 8s): crack stage 8, small smoke puff, hit sound
        srv.scheduleInTicks(160, function () {
            if (global.HG.placed[key] === placedAt) {
                var level = srv.getLevel(dim);
                if (level) {
                    level.destroyBlockProgress(breakerId, pos, 8);
                    var block = level.getBlock(bx, by, bz);
                    if (block && !block.air) {
                        srv.runCommandSilent('execute in ' + dim + ' run particle minecraft:smoke ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.2 0.2 0.2 0.01 5 force @a');
                        srv.runCommandSilent('execute in ' + dim + ' run playsound minecraft:block.' + getSoundGroup(block.id.toString()) + '.hit block @a ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.6 0.6');
                    }
                }
            }
        });

        // Stage 10 (200 ticks / 10s): remove block, clear progress, play break effects
        srv.scheduleInTicks(PLACED_LIFETIME_TICKS, function () {
            if (global.HG.placed[key] === placedAt) {
                delete global.HG.placed[key];
                try {
                    var level = srv.getLevel(dim);
                    if (level) {
                        level.destroyBlockProgress(breakerId, pos, -1);
                        var block = level.getBlock(bx, by, bz);
                        if (block && !block.air) {
                            var blockId = block.id.toString();
                            
                            // Spawn block break particles
                            srv.runCommandSilent(
                                'execute in ' + dim + ' run particle block ' + blockId + ' ' +
                                (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) +
                                ' 0.3 0.3 0.3 0.05 20 force @a'
                            );
                            // Play block break sound
                            srv.runCommandSilent(
                                'execute in ' + dim + ' run playsound minecraft:block.' + 
                                getSoundGroup(blockId) + '.break block @a ' +
                                (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 1 0.8'
                            );
                        }
                    }
                    srv.runCommandSilent(
                        'execute in ' + dim + ' run setblock ' +
                        bx + ' ' + by + ' ' + bz + ' minecraft:air'
                    );
                    console.info('[HG Protection] Auto-removed block at ' + key);
                } catch (err) {
                    console.error('[HG Protection] Failed to remove block at ' + key + ': ' + err);
                }
            }
        });
    } else {
        console.warn('[HG Protection] _srv not yet available; block at ' + key + ' will NOT auto-remove.');
    }
});

// ════════════════════════════════════════════════════════
//  FLUID & MIX AUTO-REMOVAL (runs every 1 second)
// ════════════════════════════════════════════════════════

if (global.HG.fluidBlocks === undefined) global.HG.fluidBlocks = {};

ServerEvents.tick(function (event) {
    var tickCount = global.HG.tick || 0;
    if (tickCount % 20 !== 0) return; // run every 1 second (20 ticks)

    var srv = event.server;
    if (!srv || !global.HG.region) return;

    var players = srv.getPlayerList().getPlayers();
    var scanBlocks = ['minecraft:water', 'minecraft:lava'];
    var decayBlocks = ['minecraft:water', 'minecraft:lava', 'minecraft:cobblestone', 'minecraft:obsidian', 'minecraft:stone', 'minecraft:basalt'];
    var r = global.HG.region;

    // 1. Scan around active players inside/near protected region
    for (var i = 0; i < players.size(); i++) {
        var player = players.get(i);
        if (!player) continue;

        var px = Math.floor(player.x);
        var py = Math.floor(player.y);
        var pz = Math.floor(player.z);

        // Perform bounding box overlap check between player's 31x15x31 scan area and the region
        if (px + 15 < r.minX || px - 15 > r.maxX ||
            py + 7 < r.minY  || py - 7 > r.maxY ||
            pz + 15 < r.minZ || pz - 15 > r.maxZ) {
            continue;
        }

        var dim = 'minecraft:overworld';
        try { dim = String(player.level.dimension); } catch (e) {}

        var level = srv.getLevel(dim);
        if (!level) continue;

        // Optimize: Only loop within the intersection of player's scan area and the protection region bounds
        // This reduces the iteration count from 14,415 to only the overlapping region coordinates (typically < 100)
        var minX = Math.max(px - 15, r.minX);
        var maxX = Math.min(px + 15, r.maxX);
        var minY = Math.max(py - 7, r.minY);
        var maxY = Math.min(py + 7, r.maxY);
        var minZ = Math.max(pz - 15, r.minZ);
        var maxZ = Math.min(pz + 15, r.maxZ);

        for (var bx = minX; bx <= maxX; bx++) {
            for (var by = minY; by <= maxY; by++) {
                for (var bz = minZ; bz <= maxZ; bz++) {
                    var key = posKey(bx, by, bz);

                    // Skip if already tracked by player placement, fluid tracker, or if it is a locked original/decorative fluid
                    if (global.HG.placed[key] !== undefined || 
                        global.HG.fluidBlocks[key] !== undefined ||
                        global.HG.originalFluids[key] !== undefined) continue;

                    var block = level.getBlock(bx, by, bz);
                    if (block && scanBlocks.indexOf(String(block.id)) !== -1) {
                        // ONLY track this fluid block if it is connected to a non-OP player-placed fluid or an active fluid decay coordinate
                        var isConnectedToNonOp = false;
                        var neighbors = [
                            posKey(bx + 1, by, bz),
                            posKey(bx - 1, by, bz),
                            posKey(bx, by + 1, bz),
                            posKey(bx, by - 1, bz),
                            posKey(bx, by, bz + 1),
                            posKey(bx, by, bz - 1)
                        ];
                        for (var n = 0; n < neighbors.length; n++) {
                            var nKey = neighbors[n];
                            if (global.HG.placed[nKey] === 'fluid' || global.HG.fluidBlocks[nKey] !== undefined) {
                                isConnectedToNonOp = true;
                                break;
                            }
                        }

                        if (!isConnectedToNonOp) continue;

                        // Mark for removal in 10 seconds (10 runs of the 1s loop)
                        var breakerId = global.HG.breakerCounter;
                        global.HG.breakerCounter = breakerId + 1;
                        global.HG.fluidBlocks[key] = {
                            ticksLeft: 10,
                            dimension: dim,
                            breakerId: breakerId
                        };
                    }
                }
            }
        }
    }

    // 2. Process active removal countdowns
    for (var key in global.HG.fluidBlocks) {
        var entry = global.HG.fluidBlocks[key];
        var parts = key.split(',');
        var bx = parseInt(parts[0]);
        var by = parseInt(parts[1]);
        var bz = parseInt(parts[2]);
        var dim = entry.dimension || 'minecraft:overworld';
        var breakerId = entry.breakerId;
        var pos = new BlockPos(bx, by, bz);

        var level = srv.getLevel(dim);
        if (!level) continue;

        var block = level.getBlock(bx, by, bz);

        // Check if block is still a fluid/mix type before removing or updating decay progress
        if (!block || decayBlocks.indexOf(String(block.id)) === -1) {
            // Clean up and reset block progress
            try {
                if (breakerId !== undefined) {
                    level.destroyBlockProgress(breakerId, pos, -1);
                }
            } catch (e) {}
            delete global.HG.fluidBlocks[key];
            continue;
        }

        if (entry.ticksLeft <= 1) {
            delete global.HG.fluidBlocks[key];
            try {
                if (breakerId !== undefined) {
                    level.destroyBlockProgress(breakerId, pos, -1);
                }
                var blockId = block.id.toString();
                // Spawn block break particles
                srv.runCommandSilent(
                    'execute in ' + dim + ' run particle block ' + blockId + ' ' +
                    (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) +
                    ' 0.3 0.3 0.3 0.05 20 force @a'
                );
                // Play block break sound
                srv.runCommandSilent(
                    'execute in ' + dim + ' run playsound minecraft:block.' + 
                    getSoundGroup(blockId) + '.break block @a ' +
                    (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 1 0.8'
                );
                srv.runCommandSilent('execute in ' + dim + ' run setblock ' + bx + ' ' + by + ' ' + bz + ' minecraft:air');
            } catch (err) {
                console.error('[HG Protection] Failed to remove fluid block at ' + key + ': ' + err);
            }
        } else {
            entry.ticksLeft = entry.ticksLeft - 1;

            // Decay effects at 2s (ticksLeft = 8), 4s (ticksLeft = 6), 6s (ticksLeft = 4), 8s (ticksLeft = 2)
            var currentTick = entry.ticksLeft;
            if (currentTick === 8 || currentTick === 6 || currentTick === 4 || currentTick === 2) {
                var progress = 10 - currentTick; // 2, 4, 6, 8 progress crack stage
                try {
                    if (breakerId !== undefined) {
                        level.destroyBlockProgress(breakerId, pos, progress);
                    }
                    var blockId = block.id.toString();
                    srv.runCommandSilent('execute in ' + dim + ' run particle minecraft:smoke ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.2 0.2 0.2 0.01 5 force @a');
                    srv.runCommandSilent('execute in ' + dim + ' run playsound minecraft:block.' + getSoundGroup(blockId) + '.hit block @a ' + (bx + 0.5) + ' ' + (by + 0.5) + ' ' + (bz + 0.5) + ' 0.6 0.6');
                } catch (e) {
                    console.error('[HG Protection] Error playing decay effect at ' + key + ': ' + e);
                }
            }
        }
    }
});

// ════════════════════════════════════════════════════════
//  SERVER LOAD — reset runtime state, reload persisted region
// ════════════════════════════════════════════════════════

ServerEvents.loaded(function (event) {
    global.HG.placed    = {};
    global.HG.fluidBlocks = {};
    global.HG.regionSel = {};
    global.HG.fn.loadRegion();
    global.HG.fn.loadOriginalFluids();
    console.info('[HG Protection] Protection loaded. Region active: ' + (global.HG.region !== null));
});

// Prevent all explosions inside or near the protected region from breaking blocks or dealing damage
LevelEvents.beforeExplosion(event => {
    if (!global.HG.region) return;
    
    // Check if the explosion is within the protected region (with an 8-block safety margin to prevent edge damage)
    var margin = 8;
    var rx = typeof event.getX === 'function' ? event.getX() : event.x;
    var ry = typeof event.getY === 'function' ? event.getY() : event.y;
    var rz = typeof event.getZ === 'function' ? event.getZ() : event.z;
    
    var r = global.HG.region;
    var inExplosionZone = rx >= (r.minX - margin) && rx <= (r.maxX + margin)
                       && ry >= (r.minY - margin) && ry <= (r.maxY + margin)
                       && rz >= (r.minZ - margin) && rz <= (r.maxZ + margin);
                       
    if (inExplosionZone) {
        event.cancel();
        console.info('[HG Protection] Cancelled explosion inside spawn region at (' + Math.floor(rx) + ', ' + Math.floor(ry) + ', ' + Math.floor(rz) + ')');
    }
});
