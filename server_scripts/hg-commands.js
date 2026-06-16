// ================================================================
//  HUNGER GAMES — Command Handler
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  Converted from: hg-commands.sk
//
//  /hg (aliases: /hungergames) — all subcommands via Brigadier
// ================================================================

// Safety: ensure global state exists regardless of load order
if (!global.HG) global.HG = { cfg: { prefix: '§6[HG]', maxSpawns: 50, assignMode: 'members' }, game: { running: false }, nether: { locked: false }, spawns: {}, assignment: {}, alive: {}, tick: 0 };
if (!global.HG.fn) global.HG.fn = {};
if (global.HG.originalFluids === undefined) global.HG.originalFluids = {};

// Load Brigadier argument types and Minecraft Component from Java
var IntegerArgumentType = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType');
var StringArgumentType  = Java.loadClass('com.mojang.brigadier.arguments.StringArgumentType');
var Component           = Java.loadClass('net.minecraft.network.chat.Component');

ServerEvents.commandRegistry(function(event) {
    var C = event.commands;
    var HG = global.HG;

    // ── Helper: get the player who ran the command ──
    function getPlayer(ctx) {
        try {
            return ctx.source.playerOrException;
        } catch(e) {
            return null;
        }
    }

    // ── Helper: require player context ──
    function requirePlayer(ctx) {
        var p = getPlayer(ctx);
        if (!p) {
            ctx.source.sendFailure(Text.of('§cThis command must be run by a player.'));
        }
        return p;
    }

    // ── Helper: safe command executor with console and chat logging ──
    function safeExecute(callback) {
        return function(ctx) {
            try {
                return callback(ctx);
            } catch(e) {
                console.error('[HG Command Error] Failed to execute subcommand: ' + e);
                if (e.stack) {
                    console.error(e.stack);
                }
                try {
                    ctx.source.sendFailure(Text.of('§c[HG Error] ' + e.toString()));
                } catch(err) {}
                return 0;
            }
        };
    }

    // ════════════════════════════════════
    //  BUILD /hg COMMAND TREE
    // ════════════════════════════════════

    var hgCmd = C.literal('hg')
        .requires(function(src) { return src.hasPermission(2); })

        // ── HELP ──
        .then(C.literal('help').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            var server = ctx.source.getServer();
            HG.fn.tell(server, p, '');
            HG.fn.tell(server, p, '§6§l━━━ HUNGER GAMES COMMANDS ━━━');
            HG.fn.tell(server, p, '§e/hg setspawn [n]         §8- §7Set spawn at your location');
            HG.fn.tell(server, p, '§e/hg delspawn <n|all>      §8- §7Delete a spawn point');
            HG.fn.tell(server, p, '§e/hg clearspawns           §8- §7Clear all spawn points');
            HG.fn.tell(server, p, '§e/hg listspawns            §8- §7List all spawn points');
            HG.fn.tell(server, p, '§e/hg assign [mode]         §8- §7Assign players (all/members)');
            HG.fn.tell(server, p, '§e/hg assign player <name>  §8- §7Assign a specific player');
            HG.fn.tell(server, p, '§e/hg teleport              §8- §7Teleport & freeze assigned players');
            HG.fn.tell(server, p, '§e/hg start                 §8- §7Start countdown sequence');
            HG.fn.tell(server, p, '§e/hg pvp [on|off]          §8- §7Enable/disable PvP (off is grace)');
            HG.fn.tell(server, p, '§e/hg nether [on|off]       §8- §7Enable/disable Nether access');
            HG.fn.tell(server, p, '§e/hg auto                  §8- §7Auto-run full game sequence');
            HG.fn.tell(server, p, '§e/hg reset                 §8- §7Reset the game');
            HG.fn.tell(server, p, '§e/hg panel                 §8- §7Open the control panel');
            HG.fn.tell(server, p, '§e/hg wand                  §8- §7Get the Spawn Wand');
            HG.fn.tell(server, p, '§b/hg region give            §8- §7Get the Region Selector stick');
            HG.fn.tell(server, p, '§b/hg region confirm         §8- §7Save selected region as spawn zone');
            HG.fn.tell(server, p, '§b/hg region clear           §8- §7Remove the spawn region protection');
            HG.fn.tell(server, p, '§b/hg region info            §8- §7Show current region bounds');
            HG.fn.tell(server, p, '§b/hg region lockfluids      §8- §7Lock decorative fluids near you');
            HG.fn.tell(server, p, '§b/hg region clearfluids     §8- §7Unlock all decorative fluids');
            HG.fn.tell(server, p, '§6§l━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            HG.fn.tell(server, p, '');
            return 1;
        })))

        // ── SETSPAWN [slot] ──
        .then(C.literal('setspawn')
            // With explicit slot number
            .then(C.argument('slot', IntegerArgumentType.integer(1, 50))
                .executes(safeExecute(function(ctx) {
                    var p = requirePlayer(ctx); if (!p) return 0;
                    var server = ctx.source.getServer();
                    var slot = IntegerArgumentType.getInteger(ctx, 'slot');

                    if (slot > HG.cfg.maxSpawns) {
                        HG.fn.tell(server, p, HG.cfg.prefix + ' §cMax spawn limit is ' + HG.cfg.maxSpawns + '.');
                        return 0;
                    }

                    var x = Math.floor(p.x) + 0.5;
                    var y = p.y;
                    var z = Math.floor(p.z) + 0.5;
                    var world = p.level.dimension.toString();

                    HG.spawns[slot] = { x: x, y: y, z: z, world: world };
                    HG.fn.saveSpawns(server);
                    HG.fn.tell(server, p,
                        HG.cfg.prefix + ' §aSpawn §f#' + slot + ' §7set at §f' +
                        HG.fn.locString(x, y, z, world));
                    return 1;
                }))
            )
            // Auto-increment (no slot argument)
            .executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                var count = HG.fn.spawnCount();

                if (count >= HG.cfg.maxSpawns) {
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §cMax spawn limit (' + HG.cfg.maxSpawns + ') reached!');
                    return 0;
                }

                // Find next open slot
                var slot = 1;
                while (slot <= HG.cfg.maxSpawns) {
                    if (!HG.spawns[slot]) break;
                    slot++;
                }

                var x = Math.floor(p.x) + 0.5;
                var y = p.y;
                var z = Math.floor(p.z) + 0.5;
                var world = p.level.dimension.toString();

                HG.spawns[slot] = { x: x, y: y, z: z, world: world };
                HG.fn.saveSpawns(server);
                HG.fn.sendActionBar(server, p, '§aSpawn #' + slot + ' set.');
                HG.fn.tell(server, p,
                    HG.cfg.prefix + ' §aSpawn §f#' + slot + ' §7set at §f' +
                    HG.fn.locString(x, y, z, world));
                return 1;
            }))
        )

        // ── DELSPAWN <slot | all> ──
        .then(C.literal('delspawn')
            .then(C.literal('all').executes(safeExecute(function(ctx) {
                var server = ctx.source.getServer();
                var p = requirePlayer(ctx); if (!p) return 0;
                HG.spawns = {};
                HG.fn.saveSpawns(server);
                HG.fn.tell(server, p, HG.cfg.prefix + ' §aAll spawn points cleared.');
                return 1;
            })))
            .then(C.argument('slot', IntegerArgumentType.integer(1))
                .executes(safeExecute(function(ctx) {
                    var p = requirePlayer(ctx); if (!p) return 0;
                    var server = ctx.source.getServer();
                    var slot = IntegerArgumentType.getInteger(ctx, 'slot');

                    if (!HG.spawns[slot]) {
                        HG.fn.tell(server, p, HG.cfg.prefix + ' §cSpawn #' + slot + ' does not exist.');
                        return 0;
                    }
                    delete HG.spawns[slot];
                    HG.fn.saveSpawns(server);
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §aRemoved spawn §f#' + slot);
                    return 1;
                }))
            )
        )

        // ── CLEARSPAWNS ──
        .then(C.literal('clearspawns').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            var server = ctx.source.getServer();
            HG.spawns = {};
            HG.fn.saveSpawns(server);
            HG.fn.tell(server, p, HG.cfg.prefix + ' §aAll spawn points cleared.');
            return 1;
        })))

        // ── LISTSPAWNS ──
        .then(C.literal('listspawns').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            var server = ctx.source.getServer();
            var count = HG.fn.spawnCount();

            if (count < 1) {
                HG.fn.tell(server, p, HG.cfg.prefix + ' §cNo spawn points set.');
                return 0;
            }

            HG.fn.tell(server, p, '§6§l━━━ SPAWN POINTS (' + count + ') ━━━');
            Object.keys(HG.spawns).sort(function(a, b) { return parseInt(a) - parseInt(b); }).forEach(function(slot) {
                var loc = HG.spawns[slot];
                HG.fn.tell(server, p,
                    '§6#' + slot + ' §8→ §7' + HG.fn.locString(loc.x, loc.y, loc.z, loc.world));
            });
            HG.fn.tell(server, p, '§6§l━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            return 1;
        })))

        // ── ASSIGN ──
        .then(C.literal('assign')
            .then(C.literal('all').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                HG.fn.assign(ctx.source.getServer(), 'all', p);
                return 1;
            })))
            .then(C.literal('members').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                HG.fn.assign(ctx.source.getServer(), 'members', p);
                return 1;
            })))
            .then(C.literal('player')
                .then(C.argument('name', StringArgumentType.word())
                    .executes(safeExecute(function(ctx) {
                        var p = requirePlayer(ctx); if (!p) return 0;
                        var name = StringArgumentType.getString(ctx, 'name');
                        HG.fn.assign(ctx.source.getServer(), name, p);
                        return 1;
                    }))
                )
            )
            // Default: use configured assign mode
            .executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                HG.fn.assign(ctx.source.getServer(), HG.cfg.assignMode, p);
                return 1;
            }))
        )

        // ── TELEPORT ──
        .then(C.literal('teleport').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.teleportPlayers(ctx.source.getServer(), p);
            return 1;
        })))
        .then(C.literal('tp').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.teleportPlayers(ctx.source.getServer(), p);
            return 1;
        })))

        // ── START ──
        .then(C.literal('start').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.startCountdown(ctx.source.getServer(), p);
            return 1;
        })))

        // ── GRACE ──
        .then(C.literal('grace').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            var server = ctx.source.getServer();
            if (HG.grace) {
                HG.fn.endGrace(server);
            } else {
                HG.fn.startGrace(server);
            }
            HG.fn.openPanel(server, p);
            return 1;
        })))

        // ── PVP [on|off] ──
        .then(C.literal('pvp')
            .then(C.literal('on').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                HG.fn.endGrace(server);
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .then(C.literal('off').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                HG.fn.startGrace(server);
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (HG.pvp) {
                    HG.fn.startGrace(server);
                } else {
                    HG.fn.endGrace(server);
                }
                HG.fn.openPanel(server, p);
                return 1;
            }))
        )

        // ── NETHER [on|off] ──
        .then(C.literal('nether')
            .then(C.literal('on').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (HG.nether.locked) {
                    HG.nether.locked = false;
                    HG.fn.broadcast(server, HG.cfg.prefix + ' §aThe Nether is now open.');
                } else {
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §7The Nether is already open.');
                }
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .then(C.literal('off').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                HG.fn.lockNether(server);
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .then(C.literal('disable').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (!HG.nether.locked) {
                    HG.nether.locked = true;
                    HG.fn.broadcast(server, HG.cfg.prefix + ' §cThe Nether is now disabled.');
                } else {
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §7The Nether is already locked.');
                }
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .then(C.literal('disabled').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (!HG.nether.locked) {
                    HG.nether.locked = true;
                    HG.fn.broadcast(server, HG.cfg.prefix + ' §cThe Nether is now disabled.');
                } else {
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §7The Nether is already locked.');
                }
                HG.fn.openPanel(server, p);
                return 1;
            })))
            .executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (HG.nether.locked) {
                    HG.nether.locked = false;
                    HG.fn.broadcast(server, HG.cfg.prefix + ' §aThe Nether is now open.');
                } else {
                    HG.fn.lockNether(server);
                }
                HG.fn.openPanel(server, p);
                return 1;
            }))
        )

        // ── AUTO ──
        .then(C.literal('auto').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.autoRun(ctx.source.getServer(), p);
            return 1;
        })))

        // ── RESET ──
        .then(C.literal('reset').executes(safeExecute(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.resetGame(ctx.source.getServer());
            return 1;
        }))))

        // ── PANEL ──
        .then(C.literal('panel').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.openPanel(ctx.source.getServer(), p);
            return 1;
        })))
        .then(C.literal('gui').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            HG.fn.openPanel(ctx.source.getServer(), p);
            return 1;
        })))

        // ── WAND ──
        .then(C.literal('wand').executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            var server = ctx.source.getServer();
            HG.fn.giveWand(server, p);
            HG.fn.tell(server, p, HG.cfg.prefix + ' §aYou received the Spawn Wand.');
            return 1;
        })))

        // ── LIST (players / spawns) ──
        .then(C.literal('list')
            .then(C.literal('players').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                HG.fn.tell(server, p, '§6§l━━━ HG ASSIGNMENTS ━━━');
                for (var lp of server.players) {
                    var slot = HG.assignment[lp.uuid.toString()];
                    if (slot !== undefined) {
                        HG.fn.tell(server, p, '§6' + lp.username + ' §8→ §7Slot #' + slot);
                    } else {
                        HG.fn.tell(server, p, '§6' + lp.username + ' §8→ §cUnassigned');
                    }
                }
                HG.fn.tell(server, p, '§6§l━━━━━━━━━━━━━━━━━━━━');
                return 1;
            })))
            .then(C.literal('spawns').executes(safeExecute(function(ctx) {
                // Redirect to listspawns
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                var count = HG.fn.spawnCount();
                if (count < 1) {
                    HG.fn.tell(server, p, HG.cfg.prefix + ' §cNo spawn points set.');
                    return 0;
                }
                HG.fn.tell(server, p, '§6§l━━━ SPAWN POINTS (' + count + ') ━━━');
                Object.keys(HG.spawns).sort(function(a, b) { return parseInt(a) - parseInt(b); }).forEach(function(slot) {
                    var loc = HG.spawns[slot];
                    HG.fn.tell(server, p, '§6#' + slot + ' §8→ §7' + HG.fn.locString(loc.x, loc.y, loc.z, loc.world));
                });
                HG.fn.tell(server, p, '§6§l━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                return 1;
            })))
        )

        // ── REGION ──
        .then(C.literal('region')

            // /hg region give — hand the Region Selector to the player
            .then(C.literal('give').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                // Build item using KubeJS Item.of() with NBT — avoids /give command escaping issues
                try {
                    var selectorItem = Item.of('minecraft:stick', 1,
                        '{display:{Name:\'{"text":"§b§lRegion Selector","italic":false}\',Lore:[\'{"text":"§7Right-click = Corner 1","italic":false}\',\'{"text":"§7Left-click = Corner 2","italic":false}\']}}'
                    );
                    p.give(selectorItem);
                    HG.fn.tell(server, p, '§b[HG Region] §7Region Selector given. §aRight-click §7= corner 1, §cLeft-click §7= corner 2.');
                } catch(e) {
                    console.error('[HG Region] Failed to give selector item: ' + e);
                    // Fallback: plain stick with instructions
                    server.runCommandSilent('give ' + p.username + ' minecraft:stick 1');
                    HG.fn.tell(server, p, '§b[HG Region] §7Plain stick given (NBT failed). Rename it to "Region Selector" to use it.');
                }
                return 1;
            })))

            // /hg region confirm — finalise corners into a saved region
            .then(C.literal('confirm').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (!global.HG.regionSel) global.HG.regionSel = {};
                var uuid = p.uuid.toString();
                var sel = global.HG.regionSel[uuid];
                if (!sel || !sel.c1 || !sel.c2) {
                    HG.fn.tell(server, p, '§c[HG Region] §7Set both corners first with the Region Selector stick!');
                    return 0;
                }
                global.HG.region = HG.fn.regionFromCorners(sel.c1, sel.c2);
                HG.fn.saveRegion();
                var r = global.HG.region;
                HG.fn.tell(server, p,
                    '§a[HG Region] §7Region confirmed! §f(' +
                    r.minX + ', ' + r.minY + ', ' + r.minZ + ') §7→ §f(' +
                    r.maxX + ', ' + r.maxY + ', ' + r.maxZ + ')');
                console.info('[HG Protection] Region confirmed by ' + p.username +
                    ': (' + r.minX + ',' + r.minY + ',' + r.minZ + ') → (' +
                    r.maxX + ',' + r.maxY + ',' + r.maxZ + ')');
                return 1;
            })))

            // /hg region clear — wipe the region
            .then(C.literal('clear').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                global.HG.region = null;
                global.HG.regionSel = {};
                global.HG.originalFluids = {};
                if (typeof global.HG.fn.saveOriginalFluids === 'function') {
                    global.HG.fn.saveOriginalFluids();
                }
                HG.fn.saveRegion();
                HG.fn.tell(server, p, '§c[HG Region] §7Region and locked fluids cleared.');
                console.info('[HG Protection] Region cleared by ' + p.username);
                return 1;
            })))

            // /hg region info — display bounds
            .then(C.literal('info').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                if (!global.HG.region) {
                    HG.fn.tell(server, p, '§e[HG Region] §7No region is currently set.');
                } else {
                    var r = global.HG.region;
                    HG.fn.tell(server, p,
                        '§b[HG Region] §7Active: §f(' +
                        r.minX + ', ' + r.minY + ', ' + r.minZ + ') §7→ §f(' +
                        r.maxX + ', ' + r.maxY + ', ' + r.maxZ + ')');
                }
                return 1;
            })))

            // /hg region lockfluids — scan and protect existing fluids around the player
            .then(C.literal('lockfluids').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                
                var px = Math.floor(p.x);
                var py = Math.floor(p.y);
                var pz = Math.floor(p.z);
                
                var dim = p.level.dimension.toString();
                var level = server.getLevel(dim);
                if (!level) {
                    HG.fn.tell(server, p, '§c[HG Region] §7Could not load level.');
                    return 0;
                }
                
                // Scan a 100x40x100 area around the player (50 blocks horizontally, 20 blocks vertically)
                var count = 0;
                var scanRangeH = 50;
                var scanRangeV = 20;
                
                for (var dx = -scanRangeH; dx <= scanRangeH; dx++) {
                    for (var dy = -scanRangeV; dy <= scanRangeV; dy++) {
                        for (var dz = -scanRangeH; dz <= scanRangeH; dz++) {
                            var bx = px + dx;
                            var by = py + dy;
                            var bz = pz + dz;
                            
                            var block = level.getBlock(bx, by, bz);
                            if (block) {
                                var blockId = block.id.toString();
                                if (blockId === 'minecraft:water' || blockId === 'minecraft:lava') {
                                    var key = bx + ',' + by + ',' + bz;
                                    global.HG.originalFluids[key] = true;
                                    count++;
                                }
                            }
                        }
                    }
                }
                
                if (typeof global.HG.fn.saveOriginalFluids === 'function') {
                    global.HG.fn.saveOriginalFluids();
                }
                HG.fn.tell(server, p, '§a[HG Region] §7Scan complete. Locked §f' + count + ' §7fluid blocks around you.');
                return 1;
            })))

            // /hg region clearfluids — unlock/clear all saved fluid protections
            .then(C.literal('clearfluids').executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                global.HG.originalFluids = {};
                if (typeof global.HG.fn.saveOriginalFluids === 'function') {
                    global.HG.fn.saveOriginalFluids();
                }
                HG.fn.tell(server, p, '§c[HG Region] §7All locked fluids cleared.');
                return 1;
            })))

            // /hg region (no subcommand) — show mini-help
            .executes(safeExecute(function(ctx) {
                var p = requirePlayer(ctx); if (!p) return 0;
                var server = ctx.source.getServer();
                HG.fn.tell(server, p, '§b§l[HG Region] §7Subcommands: give | confirm | clear | info | lockfluids | clearfluids');
                return 1;
            }))
        )

        // ── DEFAULT (no subcommand = help) ──
        .executes(safeExecute(function(ctx) {
            var p = requirePlayer(ctx); if (!p) return 0;
            ctx.source.getServer().runCommandSilent('hg help');
            return 1;
        }));

    // Register the main command
    event.register(hgCmd);

    // ── ALIAS: /hungergames → /hg ──
    var hgNode = event.dispatcher.getRoot().getChild('hg');
    if (hgNode) {
        event.register(
            C.literal('hungergames')
                .requires(function(src) { return src.hasPermission(2); })
                .redirect(hgNode)
        );
    }
});
