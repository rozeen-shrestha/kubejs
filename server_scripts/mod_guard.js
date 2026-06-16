// ══════════════════════════════════════════════════════════════════════════
//  MODGUARD: Strict Client Mod Enforcement Script (With Timeout)
//  Enforces that players can only connect with a specific list of 20 client mods.
//  If a player has even one extra mod, they are kicked.
//  If a player does not have the ClientID mod, they are kicked after 5 seconds.
//  Operators (OPs) are automatically bypassed.
// ══════════════════════════════════════════════════════════════════════════

// Set of approved mod IDs (including core APIs, main mods, and library dependencies)
const ALLOWED_MODS = new Set([
    // Core & Loader Internals
    'minecraft',
    'java',
    'fabricloader',
    'mixinextras',

    // Main 20 Allowed Mods (as requested)
    'appleskin',
    'architectury',
    'clientid',
    'cloth-config',
    'cloth_config',
    'collective',
    'dark-loading-screen',
    'dark_loading_screen',
    'entityculling',
    'fabric-api',
    'ferritecore',
    'fullbrightnesstoggle',
    'immediatelyfast',
    'iris',
    'kubejs',
    'libraryferret',
    'lithium',
    'mousetweaks',
    'rhino',
    'sodium',
    'sodium-extra',
    'yet_another_config_lib_v3',
    'yet_another_config_lib',
    'yacl',

    // Allowed Transitive/Library Dependencies of the 20 Mods
    'caffeineconfig',
    'cloth-basic-math',
    'io_github_douira_glsl-transformer',
    'net_lenni0451_reflect',
    'org_anarres_jcpp',
    'org_antlr_antlr4-runtime',
    'org_quiltmc_parsers_gson',
    'org_quiltmc_parsers_json',
    'transition',
    'trender',
    'omega-config',
    'org_reflections_reflections',

    // Simple Voice Chat Mod
    'voicechat',
    'voicechat_api',

    // Zoomify and Kotlin Language Loader
    'zoomify',
    'fabric-language-kotlin'
]);

/**
 * Checks if a given mod ID is permitted on the client.
 * @param {string} modId 
 * @returns {boolean}
 */
function isModAllowed(modId) {
    if (!modId) return false;
    let id = String(modId).toLowerCase();

    // Direct matches
    if (ALLOWED_MODS.has(id)) return true;

    // Match any Fabric API submodule (e.g. fabric-api-base, fabric-lifecycle-events-v1)
    if (id.startsWith('fabric-') || id.startsWith('fabric_')) return true;

    // Match twelvemonkeys libraries used by YACL
    if (id.startsWith('com_twelvemonkeys_')) return true;

    // Match Kotlin and Kotlinx language/library submodules (Zoomify dependencies)
    if (id.startsWith('org_jetbrains_kotlin') || id.startsWith('com_akuleshov7_')) return true;

    return false;
}

// Global cache for verified players (persisted across ticks)
global.verifiedModsChecked = global.verifiedModsChecked || {};

// ════════════════════════════════════
//  CONNECTION & TIMEOUT HANDLING
// ════════════════════════════════════

PlayerEvents.loggedIn(function (event) {
    let player = event.player;
    let username = player.username;
    let uuid = player.uuid.toString();

    console.info('[ModGuard] Player ' + username + ' (' + uuid + ') connected. Starting 5-second mod validation timer.');

    // Schedule a 5-second check (100 ticks) to ensure they have the ClientID mod
    let server = player.server;
    server.scheduleInTicks(100, function () {
        // Verify player is still online
        let onlinePlayer = null;
        for (let p of server.players) {
            if (p.uuid.toString() === uuid) {
                onlinePlayer = p;
                break;
            }
        }
        if (!onlinePlayer) return;

        // Check if player is an operator (OP) now (OP status is guaranteed to be loaded by now)
        let isOp = false;
        try {
            if (onlinePlayer.hasPermissions) {
                isOp = onlinePlayer.hasPermissions(2);
            }
        } catch (e) {
            console.error('[ModGuard] Error checking OP status for ' + username + ' in scheduler: ' + e);
        }

        if (isOp) {
            console.info('[ModGuard] Operator ' + username + ' bypassed timeout check.');
            return;
        }

        // If they haven't sent a valid mod list by now, kick them
        if (!global.verifiedModsChecked[uuid]) {
            console.warn('[ModGuard] Kicking ' + username + ' (Access Denied) - Reason: Failed mod validation timeout (ClientID mod missing on client or handshake timed out).');
            onlinePlayer.kick('§cAccess Denied');
        }
    });
});

// Clean up player cache on disconnect
PlayerEvents.loggedOut(function (event) {
    let player = event.player;
    let uuid = player.uuid.toString();

    if (global.verifiedModsChecked) {
        delete global.verifiedModsChecked[uuid];
    }
});

// Cache class lookups to avoid expensive reflection calls on every tick
var cachedClientID = null;
var cachedArrayList = null;
var classLoadAttempted = false;

function loadModGuardClasses() {
    if (classLoadAttempted) {
        return cachedClientID !== null && cachedArrayList !== null;
    }
    classLoadAttempted = true;
    try {
        cachedClientID = Java.loadClass('com.novinitygames.clientid.ClientID');
        cachedArrayList = Java.loadClass('java.util.ArrayList');
    } catch (e) {
        console.error('[ModGuard] Failed to load required classes: ' + e);
    }
    return cachedClientID !== null && cachedArrayList !== null;
}

ServerEvents.tick(function (event) {
    if (!loadModGuardClasses()) return;

    let server = event.server;
    let ClientID = cachedClientID;
    let ArrayList = cachedArrayList;

    if (!ClientID.modLists) return;

    // Ensure cache is initialized
    global.verifiedModsChecked = global.verifiedModsChecked || {};

    let players = server.players;
    for (let player of players) {
        let username = player.username;
        let uuid = player.uuid.toString();

        // 1. Skip OPs
        let isOp = false;
        try {
            if (player.hasPermissions) {
                isOp = player.hasPermissions(2);
            }
        } catch (e) { }
        if (isOp) continue;

        // 2. Skip if already verified in this session
        if (global.verifiedModsChecked[uuid]) continue;

        // 3. Verify mods list if received from the client mod
        if (ClientID.modLists.containsKey(player)) {
            let modsList = ClientID.modLists.get(player);
            if (modsList) {
                let extraMods = [];
                let cleanList = new ArrayList(modsList);
                for (let i = 0; i < cleanList.size(); i++) {
                    let modId = String(cleanList.get(i));
                    if (!isModAllowed(modId)) {
                        extraMods.push(modId);
                    }
                }

                if (extraMods.length > 0) {
                    console.warn('[ModGuard] Kicking ' + username + ' (Access Denied) - Reason: Client is running unauthorized mods: ' + extraMods.join(', '));

                    global.verifiedModsChecked[uuid] = 'kicked';

                    server.scheduleInTicks(1, function () {
                        player.kick('§cAccess Denied');
                    });
                } else {
                    console.info('[ModGuard] Player ' + username + ' successfully verified (no unauthorized mods).');
                    global.verifiedModsChecked[uuid] = true;
                }
            } else {
                console.warn('[ModGuard] Player ' + username + ' has ClientID entry but the mods list is null/empty.');
            }
        }
    }
});
