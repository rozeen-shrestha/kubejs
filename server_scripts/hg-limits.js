// ================================================================
//  HUNGER GAMES — Item Limits (Spill Excess)
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Limits the maximum amount of specific items a player can hold.
//  Excess items are spilled on the ground with a pickup delay.
// ================================================================

// Define your item limits here (Item ID: Max Limit)
const ITEM_LIMITS = {
    'minecraft:golden_apple': 3,
    'minecraft:ender_pearl': 16
    // You can easily add more items here, e.g.:
    // 'minecraft:enchanted_golden_apple': 1,
};

PlayerEvents.inventoryChanged(event => {
    let player = event.player;
    if (!player) return;

    // Bypass check: Operators (OPs) or players with 'bypass_limit' / 'limit_bypass' tag bypass limits
    try {
        if (player.hasPermissions(2) || player.hasPermission(2) || player.tags.contains('bypass_limit') || player.tags.contains('limit_bypass')) return;
    } catch(e) {
        try {
            if (player.isOp()) return;
        } catch(err) {}
    }

    // Loop through the configured item limits
    for (let itemId in ITEM_LIMITS) {
        let limit = ITEM_LIMITS[itemId];
        let currentCount = player.inventory.count(itemId);

        if (currentCount > limit) {
            let excess = currentCount - limit;

            // 1. Remove the excess items from the player's inventory
            player.server.runCommandSilent('clear ' + player.username + ' ' + itemId + ' ' + excess);

            // 2. Spawn the excess items on the ground with a 40-tick (2-second) pickup delay
            // This prevents an infinite pickup-drop loop since the player is standing on the spot.
            player.server.runCommandSilent('execute at ' + player.username + ' run summon item ~ ~0.5 ~ {Item:{id:"' + itemId + '",Count:' + excess + 'b},PickupDelay:40}');

            // 3. Send action bar warning to the player
            try {
                let itemName = itemId.replace('minecraft:', '').replace(/_/g, ' ');
                // Title case formatting
                itemName = itemName.replace(/(^\w|\s\w)/g, m => m.toUpperCase());

                let msg = '§cOnly ' + limit + ' ' + itemName + '(s) allowed.';
                player.server.runCommandSilent('title ' + player.username + ' actionbar ' + JSON.stringify({ text: msg }));
            } catch (msgErr) { }
        }
    }
});
