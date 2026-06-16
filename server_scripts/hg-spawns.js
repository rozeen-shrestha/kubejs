// ================================================================
//  HUNGER GAMES — Spawn Point System
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-spawns.sk
//
//  Wand tool: Blaze Rod right-click to set, left-click to remove
//  Particle visualizer when holding the wand
// ================================================================

// Safety: ensure global state exists regardless of load order
if (!global.HG) global.HG = { cfg: { prefix: '§6[HG]', maxSpawns: 50, wandItemId: 'minecraft:blaze_rod', wandName: 'HG Spawn Wand' }, game: { running: false }, spawns: {}, tick: 0 };
if (!global.HG.fn) global.HG.fn = {};

// ════════════════════════════════════
//  RIGHT-CLICK (Sneak = Remove, Stand = Set)
// ════════════════════════════════════

BlockEvents.rightClicked(function(event) {
    var HG = global.HG;
    var player = event.player;
    
    // Robust fallback to retrieve held item
    var item = null;
    try {
        item = event.item;
    } catch(e) {}
    if (!item) {
        try {
            item = player.getHeldItem(event.hand);
        } catch(e) {}
    }
    if (!item) {
        try {
            item = player.mainHandItem;
        } catch(e) {}
    }

    if (!item) return;

    // Check if holding the wand
    if (!HG.fn.isHoldingWand(item)) return;

    // Permission check
    if (!player.op) return;

    // Cancel default block interaction
    event.cancel();

    if (player.isCrouching()) {
        // ── REMOVE NEAREST SPAWN ──
        var closestSlot = -1;
        var closestDist = 999999;
        var px = player.x;
        var py = player.y;
        var pz = player.z;

        Object.keys(HG.spawns).forEach(function(slot) {
            var loc = HG.spawns[slot];
            var dx = px - loc.x;
            var dy = py - loc.y;
            var dz = pz - loc.z;
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < closestDist) {
                closestDist = dist;
                closestSlot = parseInt(slot);
            }
        });

        if (closestSlot < 1) {
            HG.fn.tell(player.server, player,
                HG.cfg.prefix + ' §cNo spawn points found nearby.');
            return;
        }

        delete HG.spawns[closestSlot];
        HG.fn.saveSpawns(player.server);

        HG.fn.tell(player.server, player,
            HG.cfg.prefix + ' §7Removed spawn §f#' + closestSlot +
            ' §7(' + Math.floor(closestDist) + ' blocks away)');
    } else {
        // ── SET NEW SPAWN ──
        var count = HG.fn.spawnCount();
        if (count >= HG.cfg.maxSpawns) {
            HG.fn.tell(player.server, player,
                HG.cfg.prefix + ' §cMax spawn limit (' + HG.cfg.maxSpawns + ') reached!');
            return;
        }

        // Find next open slot
        var slot = 1;
        while (slot <= HG.cfg.maxSpawns) {
            if (!HG.spawns[slot]) break;
            slot++;
        }

        // Set location to center-top of clicked block
        var block = event.block;
        var x = block.x + 0.5;
        var y = block.y + 1;
        var z = block.z + 0.5;
        var world = player.level.dimension.toString();

        HG.spawns[slot] = { x: x, y: y, z: z, world: world };
        HG.fn.saveSpawns(player.server);

        HG.fn.sendActionBar(player.server, player, '§aSpawn §f#' + slot + ' §aset!');
        HG.fn.tell(player.server, player,
            HG.cfg.prefix + ' §7Spawn §f#' + slot + ' §7saved at §f' +
            HG.fn.locString(x, y, z, world));
    }
});

// ════════════════════════════════════
//  SPAWN VISUALIZER (particle effect when holding wand)
// ════════════════════════════════════

ServerEvents.tick(function(event) {
    var HG = global.HG;

    // Run every 20 ticks (1 second)
    if (HG.tick % 20 !== 0) return;

    var server = event.server;

    for (var player of server.players) {
        // Check if player is holding the wand
        var mainHand;
        try {
            mainHand = player.mainHandItem;
        } catch(e) { continue; }

        if (!HG.fn.isHoldingWand(mainHand)) continue; // Fix early return to continue

        // Show particles at each spawn point and find nearest
        var closestSlot = -1;
        var closestDist = 999999;

        Object.keys(HG.spawns).forEach(function(slot) {
            var loc = HG.spawns[slot];

            // Calculate distance
            var dx = player.x - loc.x;
            var dy = player.y - loc.y;
            var dz = player.z - loc.z;
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < closestDist) {
                closestDist = dist;
                closestSlot = parseInt(slot);
            }

            // Only show particles within 64 blocks
            if (dist > 64) return;

            // Show end rod particles at 3 vertical positions
            var bx = Math.floor(loc.x);
            var by = loc.y;
            var bz = Math.floor(loc.z);

            server.runCommandSilent(
                'particle end_rod ' + bx + ' ' + (by - 0.5) + ' ' + bz +
                ' 0 0 0 0 2 force ' + player.username);
            server.runCommandSilent(
                'particle end_rod ' + bx + ' ' + by + ' ' + bz +
                ' 0 0 0 0 2 force ' + player.username);
            server.runCommandSilent(
                'particle end_rod ' + bx + ' ' + (by + 0.5) + ' ' + bz +
                ' 0 0 0 0 2 force ' + player.username);
        });

        // Show nearest spawn info on action bar
        if (closestSlot !== -1 && closestDist <= 30) {
            HG.fn.sendActionBar(server, player,
                '§6Spawn Wand §8| §aNearest Spawn: §f#' + closestSlot +
                ' §7(§f' + Math.floor(closestDist) + 'm away)');
        }
    }
});
