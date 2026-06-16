// ================================================================
//  HUNGER GAMES — Sherpa's Pickaxe auto-smelt helper
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Handles smelting experience drops and random bonus ore drops
//  when mining with Sherpa's Pickaxe.
// ================================================================

BlockEvents.broken(event => {
    const { block, player, server } = event;
    if (!player || !server || !block) return;

    // 1. Skip if creative mode
    try {
        if (player.isCreative() || player.creative) return;
    } catch (e) { }

    // 2. Check if the player is holding Sherpa's Pickaxe
    let item = player.mainHandItem || (typeof player.getMainHandItem === 'function' ? player.getMainHandItem() : null);
    let isSherpa = false;
    if (item) {
        // Support both custom item ID and diamond pickaxe with NBT
        if (item.id === 'kubejs:sherpa_pickaxe') {
            isSherpa = true;
        } else if (item.id === 'minecraft:diamond_pickaxe' && item.nbt) {
            let nbtStr = item.nbt.toString();
            if (nbtStr.includes('sherpa_pickaxe')) {
                isSherpa = true;
            }
        }
    }
    if (!isSherpa) return;

    // Check if the tool has Silk Touch
    let hasSilkTouch = false;
    let fortuneLvl = 0;
    try {
        if (typeof item.getEnchantmentLevel === 'function') {
            hasSilkTouch = item.getEnchantmentLevel('minecraft:silk_touch') > 0;
            fortuneLvl = item.getEnchantmentLevel('minecraft:fortune');
        } else {
            if (item.enchantments) {
                if (item.enchantments.silk_touch) hasSilkTouch = true;
                if (item.enchantments.fortune) fortuneLvl = item.enchantments.fortune;
            }
            if (item.nbt) {
                let nbtStr = item.nbt.toString();
                if (nbtStr.includes('silk_touch')) hasSilkTouch = true;
                let match = nbtStr.match(/id:\s*"minecraft:fortune"\s*,\s*lvl:\s*(\d+)/i) || nbtStr.match(/id:\s*fortune\s*,\s*lvl:\s*(\d+)/i);
                if (match) {
                    fortuneLvl = parseInt(match[1]);
                }
            }
        }
    } catch (e) { }

    if (hasSilkTouch) return; // Silk Touch prevents auto-smelting and bonus drops

    let blockId = block.id;

    // Define smelting XP values for each ore
    let xpMap = {
        'minecraft:iron_ore': 0.7,
        'minecraft:deepslate_iron_ore': 0.7,
        'minecraft:raw_iron_block': 6.3,

        'minecraft:gold_ore': 1.0,
        'minecraft:deepslate_gold_ore': 1.0,
        'minecraft:nether_gold_ore': 1.0,
        'minecraft:raw_gold_block': 9.0,

        'minecraft:copper_ore': 0.7,
        'minecraft:deepslate_copper_ore': 0.7,
        'minecraft:raw_copper_block': 6.3,

        'minecraft:ancient_debris': 2.0
    };

    let bx = block.x;
    let by = block.y;
    let bz = block.z;

    // Check if the broken block is any ore
    let isAnyOre = false;
    try {
        isAnyOre = block.hasTag('minecraft:ores') || blockId.indexOf('ore') !== -1 || blockId === 'minecraft:ancient_debris' || blockId.indexOf('raw_') !== -1;
    } catch (e) {
        isAnyOre = blockId.indexOf('ore') !== -1 || blockId === 'minecraft:ancient_debris' || blockId.indexOf('raw_') !== -1;
    }

    if (!isAnyOre) return;

    let baseXP = xpMap[blockId];
    if (baseXP !== undefined) {
        // Calculate drop count for smelting experience (Fortune affects counts for normal ores)
        let count = 1;
        if (blockId.indexOf('copper') !== -1) {
            count = Math.floor(Math.random() * 4) + 2; // 2-5 base copper drops
        }

        // Apply Fortune scaling
        if (fortuneLvl > 0 && blockId.indexOf('raw') === -1 && blockId !== 'minecraft:ancient_debris') {
            let multiplier = 1;
            let roll = Math.random();
            if (fortuneLvl === 1) {
                if (roll < 0.33) multiplier = 2;
            } else if (fortuneLvl === 2) {
                if (roll < 0.25) multiplier = 2;
                else if (roll < 0.50) multiplier = 3;
            } else if (fortuneLvl >= 3) {
                if (roll < 0.20) multiplier = 2;
                else if (roll < 0.40) multiplier = 3;
                else if (roll < 0.60) multiplier = 4;
            }
            count *= multiplier;
        }

        // Drop equivalent furnace smelting experience
        let totalXp = baseXP * count;
        let xpToDrop = Math.floor(totalXp);
        let remainder = totalXp - xpToDrop;
        if (Math.random() < remainder) {
            xpToDrop += 1;
        }

        if (xpToDrop > 0) {
            try {
                server.runCommandSilent('summon experience_orb ' + bx + ' ' + by + ' ' + bz + ' {Value:' + xpToDrop + '}');
            } catch (e) { }
        }
    }

    // Trigger the bonus RNG drop check since this is an ore mined without Silk Touch
    rollBonusOreDrop(player, server, bx, by, bz);
});

// Helper function to roll for bonus ore drops when mining with Sherpa's Pickaxe (rolled independently)
function rollBonusOreDrop(player, server, bx, by, bz) {
    let dropped = false;
    let HG = global.HG;
    let cfg = (HG && HG.cfg) ? HG.cfg : {};

    let emeraldChance = cfg.sherpaEmeraldChance !== undefined ? cfg.sherpaEmeraldChance : 10.0;
    let diamondChance = cfg.sherpaDiamondChance !== undefined ? cfg.sherpaDiamondChance : 12.0;
    let lapisChance = cfg.sherpaLapisChance !== undefined ? cfg.sherpaLapisChance : 32.0;
    let goldChance = cfg.sherpaGoldChance !== undefined ? cfg.sherpaGoldChance : 40.0;
    let ironChance = cfg.sherpaIronChance !== undefined ? cfg.sherpaIronChance : 60.0;

    // 1. Emerald
    if (emeraldChance > 0 && Math.random() * 100 < emeraldChance) {
        try { server.runCommandSilent('summon item ' + bx + ' ' + by + ' ' + bz + ' {Item:{id:"minecraft:emerald",Count:1b}}'); } catch (e) {}
        dropped = true;
    }
    // 2. Diamond
    if (diamondChance > 0 && Math.random() * 100 < diamondChance) {
        try { server.runCommandSilent('summon item ' + bx + ' ' + by + ' ' + bz + ' {Item:{id:"minecraft:diamond",Count:1b}}'); } catch (e) {}
        dropped = true;
    }
    // 3. Lapis Lazuli
    if (lapisChance > 0 && Math.random() * 100 < lapisChance) {
        try { server.runCommandSilent('summon item ' + bx + ' ' + by + ' ' + bz + ' {Item:{id:"minecraft:lapis_lazuli",Count:1b}}'); } catch (e) {}
        dropped = true;
    }
    // 4. Gold Ingot
    if (goldChance > 0 && Math.random() * 100 < goldChance) {
        try { server.runCommandSilent('summon item ' + bx + ' ' + by + ' ' + bz + ' {Item:{id:"minecraft:gold_ingot",Count:1b}}'); } catch (e) {}
        dropped = true;
    }
    // 5. Iron Ingot
    if (ironChance > 0 && Math.random() * 100 < ironChance) {
        try { server.runCommandSilent('summon item ' + bx + ' ' + by + ' ' + bz + ' {Item:{id:"minecraft:iron_ingot",Count:1b}}'); } catch (e) {}
        dropped = true;
    }

    if (dropped) {
        // Play xp pickup chime sound
        try {
            server.runCommandSilent('playsound minecraft:entity.experience_orb.pickup player ' + player.username + ' ' + bx + ' ' + by + ' ' + bz + ' 0.5 1.5');
        } catch (e) { }
    }
}
