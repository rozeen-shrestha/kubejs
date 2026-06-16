// ================================================================
//  HUNGER GAMES — Restricted Items Startup Script
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Removes restricted items from creative tabs during startup.
// ================================================================

StartupEvents.modifyCreativeTab('minecraft:combat', event => {
    event.remove('minecraft:shield');
});

StartupEvents.modifyCreativeTab('minecraft:tools_and_utilities', event => {
    event.remove('minecraft:bundle');
    event.remove('minecraft:brewing_stand');
});

StartupEvents.modifyCreativeTab('minecraft:functional_blocks', event => {
    event.remove('minecraft:brewing_stand');
});

StartupEvents.modifyCreativeTab('minecraft:food_and_drinks', event => {
    event.remove('minecraft:potion');
    event.remove('minecraft:splash_potion');
    event.remove('minecraft:lingering_potion');
});
