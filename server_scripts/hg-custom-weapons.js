// ================================================================
//  HUNGER GAMES — Custom Weapons (Flaming Khukuri)
//  KubeJS 6 / Fabric / Minecraft 1.20.1
//  
//  Adds the Flaming Khukuri and Compressed Blaze Rod recipes,
//  and custom combat damage effects.
// ================================================================

// 1. Register recipes
ServerEvents.recipes(event => {
    // Recipe: 3x3 Blaze Rods -> 1 Compressed Blaze Rod (with Enchantment Glow and Custom NBT)
    event.shaped(
        Item.of('minecraft:blaze_rod', {
            display: {
                Name: '{"text":"Compressed Blaze Rod","color":"gold","bold":true,"italic":false}',
            },
            CompressedBlazeRod: 1,
            Enchantments: [] // Adds the enchanted glint without actual enchantments
        }),
        [
            'BBB',
            'BBB',
            'BBB'
        ],
        {
            B: 'minecraft:blaze_rod'
        }
    ).id('hungergames:compressed_blaze_rod');

    // Recipe: Flaming Khukuri using Magma Cream, Blaze Rods, Netherite Sword, and Leather
    event.shaped(
        Item.of('minecraft:netherite_sword', 1, '{display:{Name:\'{"text":"Flaming Khukuri","color":"gold","bold":true,"italic":false}\'},CustomWeapon:"flaming_khukuri",CustomModelData:1,Unbreakable:1b,InInventory:0,AttributeModifiers:[{AttributeName:"generic.attack_damage",Name:"Weapon modifier",Amount:9.0d,Operation:0,UUID:[I;-885041709,1683771192,-1533574861,-1657510449],Slot:"mainhand"},{AttributeName:"generic.attack_speed",Name:"Weapon modifier",Amount:-2.4d,Operation:0,UUID:[I;-98353636,1098926181,-1340416820,-1396282157],Slot:"mainhand"}]}'),
        [
            ' M ',
            'BSB',
            ' L '
        ],
        {
            M: 'minecraft:magma_cream',
            B: 'minecraft:blaze_rod',
            S: 'minecraft:netherite_sword',
            L: 'minecraft:leather'
        }
    ).id('hungergames:flaming_khukuri');

    // Recipe: Sherpa's Pickaxe
    event.shaped(
        Item.of('minecraft:diamond_pickaxe', {
            display: {
                Name: '{"text":"Sherpa\'s Pickaxe","color":"aqua","bold":true,"italic":false}',
                Lore: [
                    '[{"text":"Auto-smelts mined ores and grants furnace EXP.","color":"gray","italic":false}]',
                    '[{"text":"Has a chance to find bonus smelted ores!","color":"gold","italic":false}]'
                ]
            },
            CustomTool: 'sherpa_pickaxe',
            CustomModelData: 1,
            Unbreakable: 1
        }),
        [
            'DDI',
            ' S ',
            ' I '
        ],
        {
            D: 'minecraft:diamond',
            I: 'minecraft:iron_ingot',
            S: 'minecraft:stick'
        }
    ).id('hungergames:sherpas_pickaxe');
});

// 2. Combat effects (natively sets victim on fire for 7 seconds, allowing the weapon to be enchanted normally)
EntityEvents.hurt(event => {
    let attacker = event.source.actual || event.attacker;
    if (!attacker) return;

    // Check if the attacker is holding the Flaming Khukuri
    var weapon;
    try {
        weapon = attacker.mainHandItem || (attacker.getMainHandItem ? attacker.getMainHandItem() : null);
    } catch (e) {
        weapon = null;
    }

    if (weapon && weapon.id === 'minecraft:netherite_sword' && weapon.nbt && weapon.nbt.toString().includes('flaming_khukuri')) {
        // Set victim on fire (7 seconds = 140 ticks)
        try {
            event.entity.setRemainingFireTicks(140);
        } catch (e) {
            try {
                event.entity.setSecondsOnFire(7);
            } catch (e2) {
                console.error("[HG Custom Weapons] Failed to set victim on fire: " + e2);
            }
        }
    }
});

// ================================================================
//  3. Crafting Grid Count Enforcement & Inventory Tagging
// ================================================================

global.playerCraftingData = global.playerCraftingData || {};

ServerEvents.tick(event => {
    let server = event.server;
    let players = server.players;
    let ItemStack = Java.loadClass('net.minecraft.world.item.ItemStack');

    for (let player of players) {
        let uuid = player.uuid.toString();
        let menu = player.containerMenu;

        // A. Handle Crafting Grid Count Enforcement
        if (menu && menu.class.name.includes('CraftingMenu')) {
            let outputSlot = menu.getSlot(0);
            if (outputSlot) {
                let outputItem = outputSlot.getItem();
                let isKhukuri = outputItem && 
                                outputItem.id === 'minecraft:netherite_sword' && 
                                outputItem.nbt && 
                                outputItem.nbt.toString().includes('flaming_khukuri');

                if (isKhukuri) {
                    let slotM = menu.getSlot(2).getItem();
                    let slotB1 = menu.getSlot(4).getItem();
                    let slotS = menu.getSlot(5).getItem();
                    let slotB2 = menu.getSlot(6).getItem();
                    let slotL = menu.getSlot(8).getItem();

                    let countM = slotM ? slotM.count : 0;
                    let countB1 = slotB1 ? slotB1.count : 0;
                    let countB2 = slotB2 ? slotB2.count : 0;
                    let countL = slotL ? slotL.count : 0;

                    let hasEnoughInputs = (
                        slotM && slotM.id === 'minecraft:magma_cream' && countM >= 4 &&
                        slotB1 && slotB1.id === 'minecraft:blaze_rod' && countB1 >= 8 &&
                        slotB2 && slotB2.id === 'minecraft:blaze_rod' && countB2 >= 8 &&
                        slotL && slotL.id === 'minecraft:leather' && countL >= 16 &&
                        slotS && slotS.id === 'minecraft:netherite_sword'
                    );

                    if (!hasEnoughInputs) {
                        outputSlot.set(ItemStack.EMPTY);
                        menu.broadcastChanges();
                    } else {
                        global.playerCraftingData[uuid] = {
                            craftingKhukuri: true,
                            countM: countM,
                            countB1: countB1,
                            countB2: countB2,
                            countL: countL
                        };
                    }
                } else {
                    let lastState = global.playerCraftingData[uuid];
                    if (lastState && lastState.craftingKhukuri) {
                        delete global.playerCraftingData[uuid];

                        let slotS = menu.getSlot(5).getItem();
                        let countS = slotS ? slotS.count : 0;

                        if (countS === 0) {
                            let slotM = menu.getSlot(2).getItem();
                            let currentCountM = slotM ? slotM.count : 0;
                            let slotB1 = menu.getSlot(4).getItem();
                            let currentCountB1 = slotB1 ? slotB1.count : 0;
                            let slotB2 = menu.getSlot(6).getItem();
                            let currentCountB2 = slotB2 ? slotB2.count : 0;
                            let slotL = menu.getSlot(8).getItem();
                            let currentCountL = slotL ? slotL.count : 0;

                            if (currentCountM === lastState.countM - 1 &&
                                currentCountB1 === lastState.countB1 - 1 &&
                                currentCountB2 === lastState.countB2 - 1 &&
                                currentCountL === lastState.countL - 1) {
                                
                                if (slotM && slotM.id === 'minecraft:magma_cream') {
                                    slotM.shrink(3);
                                }
                                if (slotB1 && slotB1.id === 'minecraft:blaze_rod') {
                                    slotB1.shrink(7);
                                }
                                if (slotB2 && slotB2.id === 'minecraft:blaze_rod') {
                                    slotB2.shrink(7);
                                }
                                if (slotL && slotL.id === 'minecraft:leather') {
                                    slotL.shrink(15);
                                }

                                menu.broadcastChanges();
                            }
                        }
                    }
                }
            }
        } else {
            if (global.playerCraftingData[uuid]) {
                delete global.playerCraftingData[uuid];
            }
        }

        // B. Scan player inventory to mark items
        let inv = player.inventory;
        if (inv) {
            let invSize = inv.containerSize;
            for (let i = 0; i < invSize; i++) {
                let item = inv.getItem(i);
                if (item && item.id === 'minecraft:netherite_sword' && item.nbt && item.nbt.toString().includes('flaming_khukuri')) {
                    let tag = item.getOrCreateTag();
                    if (tag && tag.getInt("InInventory") !== 1) {
                        tag.putInt("InInventory", 1);
                    }
                }
            }
        }
    }
});

// ================================================================
//  4. Prevent Direct Dropping from Crafting Output / Cursor
// ================================================================
ItemEvents.dropped('minecraft:netherite_sword', event => {
    let itemEntity = event.item;
    if (!itemEntity) return;

    let itemStack = itemEntity.item;
    if (itemStack && itemStack.id === 'minecraft:netherite_sword' && itemStack.nbt && itemStack.nbt.toString().includes('flaming_khukuri')) {
        let tag = itemStack.getTag();
        let inInv = tag && tag.getInt("InInventory") === 1;

        if (!inInv) {
            event.cancel();
            event.player.give(itemStack);
            event.player.tell(Text.red("You must put the Flaming Khukuri in your inventory before dropping it!"));
        }
    }
});
