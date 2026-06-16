// ================================================================
//  HUNGER GAMES — Restricted Items Script
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Completely removes restricted items (bundles, shields, brewing stands) from the game:
//  - Removes their crafting recipes.
//  - Instantly clears them from player inventories if obtained.
//  - Prevents interaction with brewing stands (brewing is disabled, but potions found in chests can be used).
// ================================================================

// 1. Remove the crafting recipes
ServerEvents.recipes(event => {
    event.remove({ output: 'minecraft:bundle' });
    event.remove({ output: 'minecraft:shield' });
    event.remove({ output: 'minecraft:brewing_stand' });
});

// Helper function to safely clear restricted items
function checkAndClearRestrictedItems(player) {
    if (!player) return;
    try {
        // Run command silent to clear restricted items from inventory
        player.server.runCommandSilent('clear ' + player.username + ' minecraft:bundle');
        player.server.runCommandSilent('clear ' + player.username + ' minecraft:shield');
        player.server.runCommandSilent('clear ' + player.username + ' minecraft:brewing_stand');
    } catch(e) {}
}

// 2. Clear restricted items on login
PlayerEvents.loggedIn(event => {
    checkAndClearRestrictedItems(event.player);
});

// 3. Clear restricted items when inventory updates (covers creative, commands, chests)
PlayerEvents.inventoryChanged(event => {
    let item = event.item;
    if (item && (
        item.id === 'minecraft:bundle' || 
        item.id === 'minecraft:shield' || 
        item.id === 'minecraft:brewing_stand'
    )) {
        checkAndClearRestrictedItems(event.player);
    }
});

// 4. Clear restricted items when picked up from ground
ItemEvents.pickedUp(event => {
    let item = event.item;
    if (item && (
        item.id === 'minecraft:bundle' || 
        item.id === 'minecraft:shield' || 
        item.id === 'minecraft:brewing_stand'
    )) {
        checkAndClearRestrictedItems(event.player);
    }
});

// 5. Prevent right-clicking/interacting with brewing stands
BlockEvents.rightClicked(event => {
    if (event.block && event.block.id === 'minecraft:brewing_stand') {
        event.cancel();
        let player = event.player;
        if (player) {
            player.server.runCommandSilent('title ' + player.username + ' actionbar {"text":"§cBrewing stands are disabled!"}');
        }
    }
});
