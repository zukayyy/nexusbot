// Worker thread — loads user config then starts bot core
import { pathToFileURL } from 'url';

const configPath = process.env.NEXUSMD_CONFIG;
const userCwd = process.env.NEXUSMD_CWD || process.cwd();

if (!configPath) {
	console.error('[nexusmd] ❌ NEXUSMD_CONFIG env not set');
	process.exit(1);
}

// Load user config (sets globals like pairingNumber, owner, namebot, etc)
await import(pathToFileURL(configPath).href);

// Now start the bot core (main.js reads globals set by config)
await import('./main.js');
