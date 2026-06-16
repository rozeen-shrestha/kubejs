// ================================================================
//  HUNGER GAMES — Anti-Bundle Script
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Completely removes bundles from the game:
//  - Removes the crafting recipe.
//  - Instantly clears bundles from player inventories if obtained
//    via commands, creative mode, or chest looting.
// ================================================================

// 1. Remove the crafting recipe
ServerEvents.recipes(event => {
    event.remove({ output: 'minecraft:bundle' });
});

// Helper function to safely clear bundles
function checkAndClearBundles(player) {
    if (!player) return;
    try {
        // Run command silent to clear all bundles from inventory
        player.server.runCommandSilent('clear ' + player.username + ' minecraft:bundle');
    } catch(e) {}
}

// 2. Clear bundles on login
PlayerEvents.loggedIn(event => {
    checkAndClearBundles(event.player);
});

// 3. Clear bundles when inventory updates (covers creative, commands, chests)
PlayerEvents.inventoryChanged(event => {
    let item = event.item;
    if (item && item.id === 'minecraft:bundle') {
        checkAndClearBundles(event.player);
    }
});

// 4. Clear bundles when picked up from ground
ItemEvents.pickedUp(event => {
    let item = event.item;
    if (item && item.id === 'minecraft:bundle') {
        checkAndClearBundles(event.player);
    }
});
