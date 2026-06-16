// ================================================================
//  HUNGER GAMES — Custom Block Loot Tables
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Increases the apple drop rates from oak and dark oak leaves.
// ================================================================

ServerEvents.blockLootTables(event => {
    let HG = global.HG;
    let chance = 0.1; // default 10% additional chance

    // Try to retrieve the value from global configuration
    if (HG && HG.cfg && HG.cfg.appleDropChance !== undefined) {
        chance = HG.cfg.appleDropChance;
    }

    // Safety clamps
    if (chance < 0) chance = 0;
    if (chance > 1) chance = 1;
    if (chance <= 0) return;

    // Add extra apple drops to oak leaves loot table
    event.modifyBlock('minecraft:oak_leaves', table => {
        table.addPool(pool => {
            pool.addItem('minecraft:apple')
                .randomChance(chance);
        });
    });

    // Add extra apple drops to dark oak leaves loot table
    event.modifyBlock('minecraft:dark_oak_leaves', table => {
        table.addPool(pool => {
            pool.addItem('minecraft:apple')
                .randomChance(chance);
        });
    });
});
