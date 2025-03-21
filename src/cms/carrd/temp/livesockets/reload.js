(function() {
// Retrieve and parse the JSON configuration.
const configScript = document.getElementById('reload-config-data');
let configs = [];

if (configScript) {
try {
const configJSON = JSON.parse(configScript.textContent);
if (configJSON && Array.isArray(configJSON.configs)) {
configs = configJSON.configs;
} else {
console.error('Invalid configuration: Expected a "configs" array.');
}
} catch (error) {
console.error('Error parsing reload configuration JSON:', error);
}
} else {
console.error('No configuration element with id "reload-config-data" found.');
}

// Object to store the last hash of each script's content.
const lastHashes = {};

// A simple hash function for strings.
function simpleHash(str) {
let hash = 0;
if (str.length === 0) return hash;
for (let i = 0; i < str.length; i++) {
const char = str.charCodeAt(i);
hash = ((hash << 5) - hash) + char;
hash |= 0; // Convert to 32bit integer
}
return hash;
}

// Default cleanup function: If defined, call window[scriptId + "Cleanup"] before reloading.
function performCleanup(scriptId) {
const cleanupFn = window[scriptId + "Cleanup"];
if (typeof cleanupFn === "function") {
try {
cleanupFn();
console.info(`Cleanup for ${scriptId} executed.`);
} catch (e) {
console.error(`Error during cleanup for ${scriptId}:`, e);
}
}
}

// Default initialization function: If defined, call window[scriptId + "Init"] after reloading.
function performInitialization(scriptId) {
const initFn = window[scriptId + "Init"];
if (typeof initFn === "function") {
try {
initFn();
console.info(`Initialization for ${scriptId} executed.`);
} catch (e) {
console.error(`Error during initialization for ${scriptId}:`, e);
}
}
}

// Function to update a non-module script by fetching its source and evaluating it.
async function updateScript(scriptId) {
const scriptEl = document.getElementById(scriptId);
if (!scriptEl) {
console.error(`No script found with id "${scriptId}"`);
return;
}
// Remove existing query parameters.
const baseUrl = scriptEl.src.split('?')[0];
const url = `${baseUrl}?v=${Date.now()}`;

try {
// Fetch updated script text.
const response = await fetch(url);
if (!response.ok) {
throw new Error(`Network response was not ok for ${url}`);
}
const newCode = await response.text();
// Compute hash and compare.
const newHash = simpleHash(newCode);
if (lastHashes[scriptId] === newHash) {
console.info(`No changes detected for ${scriptId}.`);
return; // No change detected.
}
// Update the stored hash.
lastHashes[scriptId] = newHash;

// Call cleanup before applying new code.
performCleanup(scriptId);

// Evaluate the new code in global context.
eval(newCode);
console.info(`Updated script ${scriptId} at ${new Date().toLocaleTimeString()}`);

// Optionally, call an initialization function after update.
performInitialization(scriptId);
} catch (err) {
console.error(`Error updating script "${scriptId}":`, err);
}
}

// Function to update an ES module using dynamic import.
async function updateModule(scriptId, modulePath) {
// Construct URL with cache-busting.
const url = `${modulePath}?v=${Date.now()}`;
try {
// Call cleanup before reloading.
performCleanup(scriptId);

const newModule = await import(url);
console.info(`Module ${scriptId} updated at ${new Date().toLocaleTimeString()}`);

// Optionally, if the module exports an init function, call it.
if (newModule && typeof newModule.init === "function") {
newModule.init();
}
// Call initialization callback.
performInitialization(scriptId);
} catch (err) {
console.error(`Error updating module "${scriptId}" from ${url}:`, err);
}
}

// Set up an interval for each configuration entry.
configs.forEach(({ id, time, module: isModule, src }) => {
if (id && typeof time === 'number') {
setInterval(() => {
if (isModule) {
// For modules, 'src' should be provided in the config.
if (!src) {
console.error(`Module configuration for ${id} requires a "src" property.`);
return;
}
updateModule(id, src);
} else {
updateScript(id);
}
}, time * 1000);
} else {
console.error('Invalid configuration entry:', { id, time });
}
});
})();
