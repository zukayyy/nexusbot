import { watchFile, unwatchFile } from 'fs';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// ============ BOT SETTINGS ============
global.pairingNumber = 628xxxxxxxxxx; // Nomor WA kamu (tanpa +)
global.owner = [['628xxxxxxxxxx', 'YourName', true]]; // [nomor, nama, isMod]
global.mods = [];

global.namebot = 'NexusBOT - MD';
global.author = 'YourName';

global.wait = 'Loading...';
global.eror = 'Terjadi Kesalahan...';

// ============ PAKASIR (Premium billing) ============
global.pakasir = {
	slug: 'your-slug',
	apikey: 'your-apikey',
	expired: 30, // dalam menit
};

// ============ STICKER ============
global.stickpack = 'Created By';
global.stickauth = namebot;

// ============ RPG / LEVELLING ============
global.multiplier = 38; // Semakin tinggi = semakin susah naik level

// ============ EMOJI RPG ============
global.rpg = {
	emoticon(string) {
		string = string.toLowerCase();
		let emot = {
			level: '📊', limit: '🎫', health: '❤️', stamina: '🔋',
			exp: '✨', money: '💹', bank: '🏦', potion: '🥤',
			diamond: '💎', common: '📦', uncommon: '🛍️', mythic: '🎁',
			legendary: '🗃️', superior: '💼', pet: '🔖', trash: '🗑',
			armor: '🥼', sword: '⚔️', pickaxe: '⛏️', fishingrod: '🎣',
			wood: '🪵', rock: '🪨', string: '🕸️', horse: '🐴',
			cat: '🐱', dog: '🐶', fox: '🦊', petFood: '🍖',
			iron: '⛓️', gold: '🪙', emerald: '❇️', upgrader: '🧰',
		};
		let results = Object.keys(emot)
			.map((v) => [v, new RegExp(v, 'gi')])
			.filter((v) => v[1].test(string));
		if (!results.length) return '';
		else return emot[results[0][0]];
	},
};

// ============ AUTO RELOAD CONFIG ============
let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
	unwatchFile(file);
	console.log(chalk.redBright("Update 'config.js'"));
	import(`${file}?update=${Date.now()}`);
});
