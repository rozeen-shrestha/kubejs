// ================================================================ //
// HUNGER GAMES — Custom Chat GUI Control Panel                      //
// KubeJS 6 / Fabric / Minecraft 1.20.1                             //
// ================================================================ //

// Safety: ensure global state exists regardless of load order
if (!global.HG) {
    global.HG = {
        cfg: {
            prefix: '§6[HG]',
            assignMode: 'members',
            freezeTime: 30,
            graceTime: 60,
            wandItemId: 'minecraft:blaze_rod',
            wandName: 'HG Spawn Wand'
        },
        game: {
            running: false,
            countdownActive: false,
            started: false
        },
        grace: false,
        pvp: false,
        nether: {
            locked: false
        },
        alive: {},
        spawns: {},
        tick: 0
    };
}
if (!global.HG.fn) {
    global.HG.fn = {};
}

/**
 * Open/Print the custom chat GUI control panel.
 */
global.HG.fn.openPanel = function (server, player) {
    try {
        var HG = global.HG;
        var aliveCount = HG.fn.aliveCount ? HG.fn.aliveCount() : 0;

        // Header
        player.tell(Text.gold("§6§l━ HG Admin Control Panel ━━━━━━━━"));

        // Statuses
        let gameText = HG.game.running ? Text.green("Running") : Text.red("Stopped");
        let netherText = HG.nether.locked ? Text.red("Locked") : Text.green("Open");
        player.tell([
            Text.yellow("  Game: "), gameText, Text.darkGray("  |  "),
            Text.yellow("Nether: "), netherText
        ]);

        let pvpText = HG.pvp ? Text.green("Enabled") : Text.red("Disabled");
        let graceText = HG.grace ? Text.green("Active") : Text.red("Inactive");
        player.tell([
            Text.yellow("  PvP: "), pvpText, Text.darkGray("  |  "),
            Text.yellow("Grace: "), graceText
        ]);

        player.tell([
            Text.yellow("  Tributes Alive: "), Text.lightPurple(aliveCount.toString())
        ]);

        player.tell(Text.darkGray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

        // Actions Row 1 (Core Operations)
        player.tell(Text.gold(" §l[ CORE CONTROLS ]"));
        player.tell([
            Text.string("  "),
            Text.green("[Assign]").click("/hgaction assign").hover("§aClick to Assign Tributes\n§7Maps players to their starting pedestals."),
            Text.string("  "),
            Text.aqua("[Teleport]").click("/hgaction teleport").hover("§bClick to Teleport Tributes\n§7Moves tributes to spawns and freezes them."),
            Text.string("  "),
            Text.yellow("[Start]").click("/hgaction start").hover("§eClick to Start Countdown\n§7Initiates the 10-second countdown.")
        ]);

        // Actions Row 2 (Toggles)
        player.tell(Text.gold(" §l[ CONFIG & TOGGLES ]"));
        player.tell([
            Text.string("  "),
            Text.green("[Grace]").click("/hgaction grace").hover("§aClick to Toggle Grace Period"),
            Text.string("  "),
            Text.red("[PvP]").click("/hgaction pvp").hover("§cClick to Toggle PvP State"),
            Text.string("  "),
            Text.darkPurple("[Nether]").click("/hgaction nether").hover("§dClick to Toggle Nether Access")
        ]);

        // Actions Row 3 (Extra Actions)
        player.tell(Text.gold(" §l[ AUTOMATION & TOOLS ]"));
        player.tell([
            Text.string("  "),
            Text.lightPurple("[Auto Run]").click("/hgaction auto").hover("§5Click to Run Automated Game Sequence\n§7Performs Assign -> Teleport -> Countdown."),
            Text.string("  "),
            Text.aqua("[Airdrop]").click("/hgaction airdrop").hover("§dClick to Trigger Airdrop\n§7Spawns an airdrop chest at random coordinates."),
            Text.string("  "),
            Text.gold("[Wand]").click("/hgaction wand").hover("§6Click to Get Spawn Wand\n§7Gives the spawn editor blaze rod tool.")
        ]);
        player.tell([
            Text.string("  "),
            Text.darkRed("[Reset Game]").click("/hgaction reset").hover("§4Click to Reset Game\n§7Stops the game and cleans up the arena.")
        ]);

        // Refresh Button
        player.tell(Text.darkGray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
        player.tell([
            Text.string("  "),
            Text.gray("🔄 ").append(Text.gray("Click to Refresh Panel").underlined().click("/hgaction panel").hover("§eUpdate statuses in chat"))
        ]);

        // Footer
        player.tell(Text.darkGray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    } catch (e) {
        console.error('[HG GUI Error] Failed to print Chat GUI: ' + e);
        player.tell(Text.red('Failed to print HG Chat Control Panel. Check console.'));
    }
};

/**
 * Helper to get the player who ran the command safely in KubeJS 6 Brigadier context
 */
function getPlayer(ctx) {
    try {
        if (ctx.source.player) return ctx.source.player;
        if (ctx.source.playerOrException) return ctx.source.playerOrException;
        if (ctx.source.getPlayer) return ctx.source.getPlayer();
    } catch (e) {}
    try {
        if (ctx.source.entity) return ctx.source.entity;
    } catch (e) {}
    return null;
}

/**
 * Execute the corresponding game operation action.
 */
function runAction(player, action) {
    var server = player.server;
    var HG = global.HG;

    console.info('[HG GUI Action] Player ' + player.username + ' executing action: ' + action);

    try {
        switch (action) {
            case "assign":
                HG.fn.assign(server, HG.cfg.assignMode, player);
                break;
            case "teleport":
                HG.fn.teleportPlayers(server, player);
                break;
            case "start":
                HG.fn.startCountdown(server, player);
                break;
            case "wand":
                HG.fn.giveWand(server, player);
                break;
            case "reset":
                HG.fn.resetGame(server, player);
                break;
            case "grace":
                if (HG.grace) {
                    HG.fn.endGrace(server);
                } else {
                    HG.fn.startGrace(server);
                }
                break;
            case "pvp":
                if (HG.fn.togglePvP) {
                    HG.fn.togglePvP(server);
                } else {
                    HG.pvp = !HG.pvp;
                    HG.fn.broadcast(server, HG.cfg.prefix + (HG.pvp ? ' §aPvP is now enabled!' : ' §cPvP is now disabled!'));
                }
                break;
            case "nether":
                if (HG.nether.locked) {
                    HG.nether.locked = false;
                    HG.fn.broadcast(server, HG.cfg.prefix + ' §aThe Nether is now open.');
                } else {
                    HG.fn.lockNether(server);
                }
                break;
            case "auto":
                HG.fn.autoRun(server, player);
                break;
            case "airdrop":
                server.runCommandSilent('airdrop');
                break;
        }
    } catch (e) {
        console.error('[HG GUI Action Error] Failed to execute ' + action + ': ' + e);
        if (e.stack) {
            console.error(e.stack);
        }
        player.tell(Text.red('Action failed: ' + e.toString()));
    }

    // Refresh the panel after 1 tick to show the updated status
    server.scheduleInTicks(1, function () {
        try {
            global.HG.fn.openPanel(server, player);
        } catch (e) {}
    });
}

/**
 * Register custom commands in KubeJS 6 Command Registry
 */
ServerEvents.commandRegistry(event => {
    const { commands: Commands } = event;

    // Base '/hgaction <subcommand>' command (Requires permission level 2)
    let baseCommand = Commands.literal('hgaction')
        .requires(src => src.hasPermission(2));

    let actions = ["assign", "teleport", "start", "wand", "reset", "grace", "pvp", "nether", "auto", "airdrop", "panel"];

    actions.forEach(action => {
        baseCommand = baseCommand.then(
            Commands.literal(action)
                .executes(ctx => {
                    try {
                        let player = getPlayer(ctx);
                        if (player) {
                            if (action === "panel") {
                                global.HG.fn.openPanel(ctx.source.server, player);
                            } else {
                                runAction(player, action);
                            }
                        } else {
                            console.warn('[HG GUI Commands] Executed hgaction ' + action + ' but player was not found.');
                        }
                    } catch (cmdErr) {
                        console.error('[HG GUI Commands] Error in hgaction ' + action + ': ' + cmdErr);
                    }
                    return 1;
                })
        );
    });

    event.register(baseCommand);

    // Register a simplified '/hg' shortcut command to open the panel
    event.register(
        Commands.literal('hg')
            .requires(src => src.hasPermission(2))
            .executes(ctx => {
                try {
                    let player = getPlayer(ctx);
                    if (player) {
                        global.HG.fn.openPanel(ctx.source.server, player);
                    } else {
                        console.warn('[HG GUI Commands] Executed hg but player was not found.');
                    }
                } catch (cmdErr) {
                    console.error('[HG GUI Commands] Error in hg: ' + cmdErr);
                }
                return 1;
            })
    );
});