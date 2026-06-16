// ================================================================
//  HUNGER GAMES — Airdrop Event System
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-airdrop.sk
//
//  Glowing ghasts descend from y=200, dropping loot chests on landing.
//  Supports multiple concurrent airdrops.
// ================================================================

// Safety: ensure global state exists regardless of load order
if (!global.HG) global.HG = { cfg: { prefix: '§6[HG]' }, game: { running: false }, nether: { locked: false }, alive: {}, spawns: {}, tick: 0 };
if (!global.HG.fn) global.HG.fn = {};
if (global.HG.airdrops === undefined) global.HG.airdrops = [];

var IntegerArgumentType_AD = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType');

// ════════════════════════════════════
//  LAUNCH AIRDROP
// ════════════════════════════════════

global.HG.fn.launchAirdrop = function(server, x, z, worldId) {
    var HG = global.HG;

    // Round coordinates
    x = Math.floor(x);
    z = Math.floor(z);
    var wId = worldId || 'minecraft:overworld';

    // Generate unique ID tag
    var uniqueId = 'hg_ad_' + Math.floor(Math.random() * 1000000);

    // Summon a glowing, invulnerable ghast at y=200 with NoGravity + NoAI
    // Tagged specifically with hg_airdrop AND its unique ID
    server.runCommandSilent(
        'summon ghast ' + x + ' 200 ' + z +
        ' {Tags:["hg_airdrop","' + uniqueId + '"],' +
        'NoGravity:1b,NoAI:1b,Silent:1b,Invulnerable:1b,' +
        'CustomName:\'{"text":"§dAIRDROP","italic":false}\',' +
        'CustomNameVisible:1b,Glowing:1b,' +
        'Attributes:[{Name:"generic.max_health",Base:2000.0}],' +
        'Health:2000.0f}'
    );

    // Push into active tracker
    global.HG.airdrops.push({
        tag: uniqueId,
        x: x,
        z: z,
        y: 200,
        world: wId
    });

    HG.fn.broadcast(server, HG.cfg.prefix + ' §dAirdrop incoming at §f' + x + '§7, §f' + z + '§7.');
};

// ════════════════════════════════════
//  FALL DETECTION (tick-based)
// ════════════════════════════════════

ServerEvents.tick(function(event) {
    var HG = global.HG;
    if (!HG.airdrops || HG.airdrops.length === 0) return;

    var server = event.server;

    // Run every 4 ticks (~5 blocks/sec descent speed)
    if (HG.tick % 4 !== 0) return;

    for (var i = HG.airdrops.length - 1; i >= 0; i--) {
        var ad = HG.airdrops[i];

        // Guard: check if the specific ghast entity still exists in the world
        var ghastExists = server.runCommandSilent(
            'execute if entity @e[tag=' + ad.tag + ',limit=1]'
        );
        if (ghastExists === 0) {
            // Remove from tracking if killed/deleted
            HG.airdrops.splice(i, 1);
            continue;
        }

        // Move ghast down by 1 block
        ad.y -= 1;

        // Teleport the specific ghast entity
        server.runCommandSilent(
            'tp @e[tag=' + ad.tag + ',limit=1] ' +
            ad.x + ' ' + ad.y + ' ' + ad.z
        );

        // Safety: abort if below y=0
        if (ad.y <= 0) {
            server.runCommandSilent('kill @e[tag=' + ad.tag + ']');
            HG.airdrops.splice(i, 1);
            HG.fn.landAirdrop(server, ad.x, 1, ad.z, ad.world);
            continue;
        }

        // Only start ground-checking after descending at least 5 blocks
        if (ad.y > 195) continue;

        // Check if the block at the ghast's position is solid (hit solid block/ground)
        // Optimize: Use direct level.getBlock calls instead of 6 heavy server commands per tick
        var level = server.getLevel(ad.world);
        if (!level) continue;

        var block = level.getBlock(ad.x, ad.y, ad.z);
        var blockId = block ? block.id.toString() : 'minecraft:air';
        var isAir = (blockId === 'minecraft:air' || blockId === 'minecraft:cave_air' || blockId === 'minecraft:void_air');
        var isWater = (blockId === 'minecraft:water');

        var isSolidGround = (!isAir && !isWater);
        var solidBelow = false;

        if (!isSolidGround) {
            var blockBelow = level.getBlock(ad.x, ad.y - 1, ad.z);
            var blockBelowId = blockBelow ? blockBelow.id.toString() : 'minecraft:air';
            var belowAir = (blockBelowId === 'minecraft:air' || blockBelowId === 'minecraft:cave_air' || blockBelowId === 'minecraft:void_air');
            var belowWater = (blockBelowId === 'minecraft:water');
            solidBelow = (!belowAir && !belowWater);
        }

        // Landing condition: either inside a solid block, or standing on solid ground
        if (isSolidGround || solidBelow) {
            // Kill the ghast
            server.runCommandSilent('kill @e[tag=' + ad.tag + ']');
            HG.airdrops.splice(i, 1);
            HG.fn.landAirdrop(server, ad.x, ad.y, ad.z, ad.world);
        }
    }
});

// ════════════════════════════════════
//  LANDING — Place chest with loot
// ════════════════════════════════════

global.HG.fn.landAirdrop = function(server, x, y, z, worldId) {
    var HG = global.HG;

    // Walk down to find ground (check up to 15 blocks below)
    // Optimize: Use direct level.getBlock calls instead of 15 commands in a loop
    var groundY = y;
    var level = server.getLevel(worldId);
    if (level) {
        for (var dy = 0; dy >= -15; dy--) {
            var block = level.getBlock(x, y + dy, z);
            if (block && block.id.toString() !== 'minecraft:air') {
                // Found solid block! Place chest 1 block above it
                groundY = y + dy + 1;
                break;
            }
        }
    }

    // Summon an end_crystal 2 blocks under the chest (completely buried and unreachable by hits)
    // with a beam targeting the sky (Y=255)
    server.runCommandSilent(
        'summon end_crystal ' + x + ' ' + (groundY - 2) + ' ' + z +
        ' {Tags:["hg_ad_beam"],ShowBottom:0b,Invulnerable:1b,BeamTarget:{X:' + x + ',Y:255,Z:' + z + '}}'
    );

    // Set the block directly below the chest to blackstone to seal the crystal underground
    server.runCommandSilent(
        'execute in ' + worldId + ' run setblock ' + x + ' ' + (groundY - 1) + ' ' + z + ' minecraft:blackstone replace'
    );

    // Place chest at ground level (groundY)
    server.runCommandSilent(
        'execute in ' + worldId + ' run setblock ' + x + ' ' + groundY + ' ' + z + ' minecraft:chest replace'
    );

    // Decay the ground around the chest (circular radius of 3.5 blocks)
    var darkBlocks = ['minecraft:sculk', 'minecraft:blackstone', 'minecraft:soul_soil', 'minecraft:crying_obsidian', 'minecraft:basalt'];

    for (var dx = -3; dx <= 3; dx++) {
        for (var dz = -3; dz <= 3; dz++) {
            var dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 3.5) continue; // Circular radius boundary

            var rx = x + dx;
            var rz = z + dz;
            if (rx === x && rz === z) continue; // Don't replace the chest block itself

            // Find the surface Y coordinate
            // Optimize: Use direct level.getBlock calls instead of up to 490 commands in double loops!
            var ry = groundY - 1;
            if (level) {
                for (var dy = 1; dy >= -3; dy--) {
                    var block = level.getBlock(rx, groundY + dy, rz);
                    if (block && block.id.toString() !== 'minecraft:air') {
                        var blockAbove = level.getBlock(rx, groundY + dy + 1, rz);
                        if (blockAbove && blockAbove.id.toString() === 'minecraft:air') {
                            ry = groundY + dy;
                            break;
                        }
                    }
                }
            }

            // Pick a corrupted block based on distance (closer = more sculk/crying obsidian, further = blackstone/basalt)
            var rand = Math.random();
            var blockToPlace = 'minecraft:blackstone';

            if (dist <= 1.5) {
                if (rand < 0.4) blockToPlace = 'minecraft:sculk';
                else if (rand < 0.7) blockToPlace = 'minecraft:crying_obsidian';
                else blockToPlace = 'minecraft:blackstone';
            } else if (dist <= 2.5) {
                if (rand < 0.3) blockToPlace = 'minecraft:sculk';
                else if (rand < 0.6) blockToPlace = 'minecraft:blackstone';
                else if (rand < 0.8) blockToPlace = 'minecraft:soul_soil';
                else blockToPlace = 'minecraft:basalt';
            } else {
                if (rand < 0.6) blockToPlace = 'minecraft:blackstone';
                else blockToPlace = 'minecraft:basalt';
            }

            // Place the corrupted block
            server.runCommandSilent('execute in ' + worldId + ' run setblock ' + rx + ' ' + ry + ' ' + rz + ' ' + blockToPlace + ' replace');
        }
    }

    // Small delay to let the chest register, then fill with loot
    server.scheduleInTicks(2, function() {
        // Fill chest with loot using item replace
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.4 with minecraft:diamond 2');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.13 with minecraft:golden_apple 3');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.22 with minecraft:iron_ingot 16');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.10 with minecraft:cooked_beef 8');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.16 with minecraft:arrow 32');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.1 with minecraft:bow 1');
        server.runCommandSilent('item replace block ' + x + ' ' + groundY + ' ' + z + ' container.25 with minecraft:iron_sword 1');
    });

    // Explosion sound
    server.runCommandSilent(
        'execute in ' + worldId + ' run playsound minecraft:entity.generic.explode master @a ' +
        x + ' ' + groundY + ' ' + z + ' 1.5 0.7'
    );

    // Celebration fireworks (12 rockets, staggered)
    for (var i = 0; i < 12; i++) {
        (function(index) {
            server.scheduleInTicks(index * 4, function() {
                var fx = x + Math.floor(Math.random() * 7) - 3;
                var fz = z + Math.floor(Math.random() * 7) - 3;
                server.runCommandSilent(
                    'execute in ' + worldId + ' run summon firework_rocket ' +
                    fx + ' ' + groundY + ' ' + fz +
                    ' {LifeTime:10,Fireworks:{Flight:0b,Explosions:[{' +
                    'Type:1,Flicker:1b,Trail:1b,' +
                    'Colors:[I;16711680,16753920,16776960],' +
                    'FadeColors:[I;16777215]}]}}'
                );
            });
        })(i);
    }

    // Launch sound
    server.scheduleInTicks(4, function() {
        server.runCommandSilent(
            'execute in ' + worldId + ' run playsound minecraft:entity.firework_rocket.launch master @a ' +
            x + ' ' + groundY + ' ' + z + ' 1 0.8'
        );
    });

    // Broadcast landing message
    HG.fn.broadcast(server, HG.cfg.prefix + ' §dAirdrop landed. Loot chest at §f' + x + ', ' + groundY + ', ' + z + '§7.');
};

// ════════════════════════════════════
//  /airdrop COMMAND
// ════════════════════════════════════

ServerEvents.commandRegistry(function(event) {
    var C = event.commands;

    event.register(
        C.literal('airdrop')
            .requires(function(src) { return src.hasPermission(2); })

            // /airdrop spawn — launch at player's location
            .then(C.literal('spawn').executes(function(ctx) {
                var p;
                try { p = ctx.source.playerOrException; } catch(e) { return 0; }
                var server = ctx.source.getServer();
                var worldId = p.level.dimension.toString();
                global.HG.fn.launchAirdrop(server, p.x, p.z, worldId);
                return 1;
            }))
            .then(C.literal('launch').executes(function(ctx) {
                var p;
                try { p = ctx.source.playerOrException; } catch(e) { return 0; }
                var server = ctx.source.getServer();
                var worldId = p.level.dimension.toString();
                global.HG.fn.launchAirdrop(server, p.x, p.z, worldId);
                return 1;
            }))

            // /airdrop at <x> <z> — launch at specific coordinates
            .then(C.literal('at')
                .then(C.argument('x', IntegerArgumentType_AD.integer())
                    .then(C.argument('z', IntegerArgumentType_AD.integer())
                        .executes(function(ctx) {
                            var p;
                            try { p = ctx.source.playerOrException; } catch(e) { return 0; }
                            var server = ctx.source.getServer();
                            var ax = IntegerArgumentType_AD.getInteger(ctx, 'x');
                            var az = IntegerArgumentType_AD.getInteger(ctx, 'z');
                            var worldId = p.level.dimension.toString();
                            global.HG.fn.launchAirdrop(server, ax, az, worldId);
                            return 1;
                        })
                    )
                )
            )

            // /airdrop (no args) — launch at player's location
            .executes(function(ctx) {
                var p;
                try { p = ctx.source.playerOrException; } catch(e) { return 0; }
                var server = ctx.source.getServer();
                var worldId = p.level.dimension.toString();
                global.HG.fn.launchAirdrop(server, p.x, p.z, worldId);
                return 1;
            })
    );
});

// ════════════════════════════════════
//  CLEANUP BEAM ON CHEST BREAK & RELOAD
// ════════════════════════════════════

BlockEvents.broken(event => {
    if (event.block.id === 'minecraft:chest') {
        event.server.runCommandSilent(
            'execute in ' + event.level.dimension.toString() +
            ' run kill @e[type=end_crystal,tag=hg_ad_beam,x=' + event.block.x + ',y=' + event.block.y + ',z=' + event.block.z + ',distance=..3]'
        );
    }
});

// Cleanup any leftover beams from previous runs on load
ServerEvents.loaded(event => {
    event.server.runCommandSilent('kill @e[tag=hg_ad_beam]');
});

// Prevent airdrop end crystals from taking any damage (so they can't be exploded by hits, projectiles, or other explosions)
EntityEvents.hurt(event => {
    let entity = event.entity;
    if (entity && entity.type === 'minecraft:end_crystal') {
        try {
            if (entity.tags.contains('hg_ad_beam')) {
                event.cancel();
            }
        } catch (e) {
            try {
                if (entity.getTags().contains('hg_ad_beam')) {
                    event.cancel();
                }
            } catch (err) {}
        }
    }
});

// Prevent airdrop end crystals from exploding (cancelling explosion damage to blocks/entities)
LevelEvents.beforeExplosion(event => {
    let exploder = event.exploder || (event.explosion && event.explosion.sourceEntity);
    if (exploder && exploder.type === 'minecraft:end_crystal') {
        event.cancel();
    }
});
