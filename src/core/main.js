import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
	return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
	return path.dirname(global.__filename(pathURL, true));
};
global.__require = function require(dir = import.meta.url) {
	return createRequire(dir);
};

import fs from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { format } from 'util';
import { parentPort } from 'worker_threads';
import readline from 'readline';
import { makeWASocket, protoType, serialize } from '../lib/simple.js';
import chalk from 'chalk';
import pino from 'pino';
import syntaxerror from 'syntax-error';
import { Low, JSONFile } from 'lowdb';
import { useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from 'baileys';

protoType();
serialize();

// Module's own dir (inside node_modules/nexusmd/src/core)
const __moduleDir = global.__dirname(import.meta.url);
// User's working directory (where they run the bot)
const __userCwd = process.env.NEXUSMD_CWD || process.cwd();

global.prefix = new RegExp('^[' + '‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-'.replace(/[|\\{}[\]()^$+*?.-]/g, '\\$&') + ']');

// ════════════════════════════════════════════════════════════════════════════
//  READLINE HELPER
// ════════════════════════════════════════════════════════════════════════════
function createRL() {
	return readline.createInterface({ input: process.stdin, output: process.stdout });
}
function question(rl, prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

// ════════════════════════════════════════════════════════════════════════════
//  PILIH METODE KONEKSI
// ════════════════════════════════════════════════════════════════════════════
async function selectConnectionMethod() {
	const rl = createRL();

	// Loop sampai input valid (1 atau 2)
	let choice = '';
	while (choice !== '1' && choice !== '2') {
		console.log(chalk.hex('#FFD700').bold('\n  ╔══════════════════════════════╗'));
		console.log(chalk.hex('#FFD700').bold('  ║   PILIH METODE KONEKSI      ║'));
		console.log(chalk.hex('#FFD700').bold('  ╚══════════════════════════════╝\n'));
		console.log(chalk.hex('#00FF88')('  [ 1 ]') + chalk.white(' Pairing Code') + chalk.gray(' (Rekomendasi)'));
		console.log(chalk.hex('#00D4FF')('  [ 2 ]') + chalk.white(' QR Code'));
		console.log('');
		choice = (await question(rl, chalk.hex('#A78BFA').bold('  ➤ Masukkan pilihan (1/2): '))).trim();
		if (choice !== '1' && choice !== '2') {
			console.log(chalk.red('  ✗ Pilihan tidak valid! Masukkan 1 atau 2.'));
		}
	}

	// Jika pairing — minta nomor, loop sampai valid
	let phone = '';
	if (choice === '1') {
		while (true) {
			phone = (await question(rl, chalk.hex('#FF6B9D').bold('  ➤ Masukkan nomor WhatsApp (contoh: 6281234567890): ')))
				.trim()
				.replace(/\D/g, '');

			if (!phone) {
				console.log(chalk.red('  ✗ Nomor tidak boleh kosong!'));
				continue;
			}
			if (phone.length < 10 || phone.length > 15) {
				console.log(chalk.red('  ✗ Nomor tidak valid! Panjang harus 10–15 digit.'));
				continue;
			}
			// Otomatis konversi 08xx → 628xx
			if (phone.startsWith('0')) {
				phone = '62' + phone.slice(1);
				console.log(chalk.hex('#FFD700')(`  ↺ Dikonversi ke format internasional: ${phone}`));
			}
			break;
		}
	}

	rl.close();
	return { usePairing: choice === '1', phone };
}

// ════════════════════════════════════════════════════════════════════════════
//  DATABASE
// ════════════════════════════════════════════════════════════════════════════
global.db = new Low(new JSONFile(join(__userCwd, 'database.json')));

global.loadDatabase = async function loadDatabase() {
	if (global.db.READ)
		return new Promise((resolve) =>
			setInterval(async function () {
				if (!global.db.READ) {
					clearInterval(this);
					resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
				}
			}, 1 * 1000)
		);
	if (global.db.data !== null) return;
	global.db.READ = true;
	await global.db.read().catch(console.error);
	global.db.READ = null;
	global.db.data = {
		users: {},
		chats: {},
		stats: {},
		msgs: {},
		sticker: {},
		settings: {},
		...(global.db.data || {}),
	};
};
loadDatabase();

// ════════════════════════════════════════════════════════════════════════════
//  SETUP KONEKSI
// ════════════════════════════════════════════════════════════════════════════
const sessionsDir = join(__userCwd, 'sessions');
const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
const { version } = await fetchLatestBaileysVersion();

// Hanya tanya metode koneksi kalau sesi belum ada
const isNewSession = !state.creds?.registered;
let usePairing = false;
let pairingPhone = '';

if (isNewSession) {
	const result = await selectConnectionMethod();
	usePairing = result.usePairing;
	pairingPhone = result.phone;
}

const connectionOptions = {
	auth: {
		creds: state.creds,
		keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'fatal', stream: 'store' })),
	},
	version,
	logger: pino({ level: 'silent' }),
	browser: Browsers.ubuntu('Edge'),
	printQRInTerminal: !usePairing,
	generateHighQualityLinkPreview: true,
	syncFullHistory: false,
	shouldSyncHistoryMessage: () => false,
	markOnlineOnConnect: true,
	connectTimeoutMs: 60_000,
	keepAliveIntervalMs: 30_000,
	retryRequestDelayMs: 250,
	maxMsgRetryCount: 5,
};

global.conn = makeWASocket(connectionOptions);

if (fs.existsSync(join(sessionsDir, 'creds.json')) && !conn.authState.creds.registered) {
	console.log(chalk.yellow('-- WARNING: creds.json is broken, please delete sessions and restart --'));
	process.exit(0);
}

// ════════════════════════════════════════════════════════════════════════════
//  PAIRING CODE
// ════════════════════════════════════════════════════════════════════════════
if (isNewSession && usePairing && pairingPhone) {
	setTimeout(async () => {
		try {
			let code = await conn.requestPairingCode(pairingPhone);
			code = code?.replace(/[^A-Z0-9]/gi, '').toUpperCase();
			code = code?.match(/.{1,4}/g)?.join('-') || code;

			console.log('\n' + chalk.hex('#FFD700').bold('  ╔══════════════════════════════════════╗'));
			console.log(chalk.hex('#FFD700').bold('  ║') + chalk.white('        PAIRING CODE ANDA               ') + chalk.hex('#FFD700').bold('║'));
			console.log(chalk.hex('#FFD700').bold('  ╠══════════════════════════════════════╣'));
			console.log(chalk.hex('#FFD700').bold('  ║') + chalk.hex('#00FF88').bold(`           ${code}              `) + chalk.hex('#FFD700').bold('║'));
			console.log(chalk.hex('#FFD700').bold('  ╚══════════════════════════════════════╝'));
			console.log(chalk.gray('\n  Cara pakai:'));
			console.log(chalk.gray('  1. Buka WhatsApp di HP kamu'));
			console.log(chalk.gray('  2. Titik tiga → Perangkat Tertaut → Tautkan Perangkat'));
			console.log(chalk.gray('  3. Pilih') + chalk.white(' "Tautkan dengan nomor telepon"'));
			console.log(chalk.gray('  4. Masukkan kode: ') + chalk.hex('#00FF88').bold(code) + '\n');
		} catch (e) {
			console.error(chalk.red('  ✗ Gagal mendapatkan pairing code:'), e.message);
			console.log(chalk.hex('#FFD700')('  ↻ Coba restart dan ulangi...'));
			parentPort?.postMessage('restart');
		}
	}, 3000);
}

if (global.db) {
	setInterval(async () => {
		if (global.db.data) {
			await global.db.write().catch(console.error);
		}
		if ((global.support || {}).find) {
			const tmp = [tmpdir(), join(__userCwd, 'tmp')];
			tmp.forEach((filename) => spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete']));
		}
	}, 2000);
}

async function connectionUpdate(update) {
	const { receivedPendingNotifications, connection, lastDisconnect, isOnline } = update;
	global.stopped = connection;

	if (connection == 'connecting') {
		console.log(chalk.redBright('⚡ Mengaktifkan Bot, Mohon tunggu sebentar...'));
	} else if (connection == 'open') {
		console.log(chalk.green('✅ Tersambung'));
	}

	if (isOnline == true) {
		console.log(chalk.green('Status Aktif'));
	} else if (isOnline == false) {
		console.log(chalk.red('Status Mati'));
	}

	if (receivedPendingNotifications) {
		console.log(chalk.yellow('Menunggu Pesan Baru'));
	}

	if (connection == 'close') {
		console.log(chalk.red('⏱️ Koneksi terputus & mencoba menyambung ulang...'));
	}

	if (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.payload) {
		console.log(chalk.red(lastDisconnect.error.output.payload.message));
		await global.reloadHandler(true);
	}

	if (global.db.data == null) {
		await global.loadDatabase();
	}
}

process.on('uncaughtException', console.error);

let isInit = true;
let handler = await import('./handler.js');
global.reloadHandler = async function (restatConn) {
	try {
		const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
		if (Object.keys(Handler || {}).length) handler = Handler;
	} catch (e) {
		console.error(e);
	}
	if (restatConn) {
		const oldChats = global.conn.chats;
		try {
			global.conn.ws.close();
		} catch {}
		conn.ev.removeAllListeners();
		global.conn = makeWASocket(connectionOptions, { chats: oldChats });
		isInit = true;
	}
	if (!isInit) {
		conn.ev.off('messages.upsert', conn.handler);
		conn.ev.off('group-participants.update', conn.participantsUpdate);
		conn.ev.off('groups.update', conn.groupsUpdate);
		conn.ev.off('message.delete', conn.onDelete);
		conn.ev.off('connection.update', conn.connectionUpdate);
		conn.ev.off('creds.update', conn.credsUpdate);
	}

	conn.welcome = '✦━━━━━━[ *WELCOME* ]━━━━━━✦\n\n┏––––––━━━━━━━━•\n│⫹⫺ @subject\n┣━━━━━━━━┅┅┅\n│( 👋 Hallo @user)\n├[ *INTRO* ]—\n│ *Nama:* \n│ *Umur:* \n│ *Gender:*\n┗––––––━━┅┅┅\n\n––––––┅┅ *DESCRIPTION* ┅┅––––––\n@desc';
	conn.bye = '✦━━━━━━[ *GOOD BYE* ]━━━━━━✦\nSayonara *@user* 👋( ╹▽╹ )';
	conn.spromote = '@user sekarang admin!';
	conn.sdemote = '@user sekarang bukan admin!';
	conn.sDesc = 'Deskripsi telah diubah ke \n@desc';
	conn.sSubject = 'Judul grup telah diubah ke \n@subject';
	conn.sIcon = 'Icon grup telah diubah!';
	conn.sRevoke = 'Link group telah diubah ke \n@revoke';
	conn.handler = handler.handler.bind(global.conn);
	conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
	conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
	conn.onDelete = handler.deleteUpdate.bind(global.conn);
	conn.connectionUpdate = connectionUpdate.bind(global.conn);
	conn.credsUpdate = saveCreds.bind(global.conn);

	conn.ev.on('call', async (calls) => {
		for (const call of calls) {
			const { id, from, status } = call;
			const settings = global.db.data.settings[conn.user.jid];
			if (status === 'offer' && settings?.anticall) {
				await conn.rejectCall(id, from);
				console.log('Menolak panggilan dari', from);
			}
		}
	});

	conn.ev.on('messages.upsert', conn.handler);
	conn.ev.on('group-participants.update', conn.participantsUpdate);
	conn.ev.on('groups.update', conn.groupsUpdate);
	conn.ev.on('message.delete', conn.onDelete);
	conn.ev.on('connection.update', conn.connectionUpdate);
	conn.ev.on('creds.update', conn.credsUpdate);
	isInit = false;
	return true;
};

// Plugins folder — inside module itself
const pluginFolder = join(__moduleDir, '..', 'plugins');
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
	for (let filename of fs.readdirSync(pluginFolder).filter(pluginFilter)) {
		try {
			let file = global.__filename(join(pluginFolder, filename));
			const module = await import(pathToFileURL(file).href);
			global.plugins[filename] = module.default || module;
		} catch (e) {
			conn.logger.error(`❌ Failed to load plugins ${filename}: ${e}`);
			delete global.plugins[filename];
		}
	}
}
filesInit()
	.then((_) => console.log(`[nexusmd] ✅ Loaded ${Object.keys(global.plugins).length} plugins`))
	.catch(console.error);

global.reload = async (_ev, filename) => {
	if (pluginFilter(filename)) {
		let dir = global.__filename(join(pluginFolder, filename), true);
		if (filename in global.plugins) {
			if (fs.existsSync(dir)) conn.logger.info(`re-require plugin '${filename}'`);
			else {
				conn.logger.warn(`deleted plugin '${filename}'`);
				return delete global.plugins[filename];
			}
		} else conn.logger.info(`requiring new plugin '${filename}'`);
		let err = syntaxerror(fs.readFileSync(dir), filename, {
			sourceType: 'module',
			allowAwaitOutsideFunction: true,
		});
		if (err) conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`);
		else
			try {
				const module = await import(`${pathToFileURL(dir).href}?update=${Date.now()}`);
				global.plugins[filename] = module.default || module;
			} catch (e) {
				conn.logger.error(`error require plugin '${filename}\n${format(e)}'`);
			} finally {
				global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
			}
	}
};
Object.freeze(global.reload);
fs.watch(pluginFolder, global.reload);
await global.reloadHandler();

async function _quickTest() {
	let test = await Promise.all(
		[
			spawn('ffmpeg'),
			spawn('ffprobe'),
			spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
			spawn('convert'),
			spawn('magick'),
			spawn('gm'),
			spawn('find', ['--version']),
		].map((p) => {
			return Promise.race([
				new Promise((resolve) => { p.on('close', (code) => { resolve(code !== 127); }); }),
				new Promise((resolve) => { p.on('error', (_) => resolve(false)); }),
			]);
		})
	);
	let [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
	let s = (global.support = { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find });
	Object.freeze(global.support);

	if (!s.ffmpeg) conn.logger.warn('Please install ffmpeg for sending videos (pkg install ffmpeg)');
	if (s.ffmpeg && !s.ffmpegWebp) conn.logger.warn('Stickers may not animated without libwebp on ffmpeg');
	if (!s.convert && !s.magick && !s.gm) conn.logger.warn('Stickers may not work without imagemagick (pkg install imagemagick)');
}

_quickTest()
	.then(() => conn.logger.info('☑️ Quick Test Done'))
	.catch(console.error);
