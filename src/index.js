import { Worker } from 'worker_threads';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { watchFile, unwatchFile, existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import readline from 'readline';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureModuleType() {
	const pkgPath = resolve(process.cwd(), 'package.json');
	if (!existsSync(pkgPath)) {
		writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, 2));
		console.log('[nexusmd] 📦 package.json dibuat otomatis');
		return;
	}
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		if (pkg.type !== 'module') {
			pkg.type = 'module';
			writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
			console.log('[nexusmd] 📦 package.json: "type": "module" ditambahkan otomatis');
		}
	} catch {}
}

function question(rl, prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

// ── Tanya metode koneksi di parent process (bukan worker) ──────────────────
async function selectConnectionMethod() {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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

	let phone = '';
	if (choice === '1') {
		while (true) {
			phone = (await question(rl, chalk.hex('#FF6B9D').bold('  ➤ Masukkan nomor WhatsApp (contoh: 6281234567890): ')))
				.trim().replace(/\D/g, '');
			if (!phone) {
				console.log(chalk.red('  ✗ Nomor tidak boleh kosong!'));
				continue;
			}
			if (phone.length < 10 || phone.length > 15) {
				console.log(chalk.red('  ✗ Nomor tidak valid! Panjang harus 10–15 digit.'));
				continue;
			}
			if (phone.startsWith('0')) {
				phone = '62' + phone.slice(1);
				console.log(chalk.hex('#FFD700')(`  ↺ Dikonversi: ${phone}`));
			}
			break;
		}
	}

	rl.close();
	return { usePairing: choice === '1', phone };
}

export default async function startBot(configPath = './config.js') {
	ensureModuleType();

	const resolvedConfig = isAbsolute(configPath)
		? configPath
		: resolve(process.cwd(), configPath);

	if (!existsSync(resolvedConfig)) {
		const exampleConfig = join(__dirname, '..', 'config.example.js');
		copyFileSync(exampleConfig, resolvedConfig);
		console.log(`[nexusmd] 📋 config.js otomatis dicopy dari config.example.js`);
		console.log(`[nexusmd] ✏️  Edit config.js terlebih dahulu, lalu jalankan ulang!`);
		process.exit(0);
	}

	// Cek apakah sesi sudah ada
	const sessionsDir = join(process.cwd(), 'sessions', 'session');
	const credsPath = join(sessionsDir, 'creds.json');
	const isNewSession = !existsSync(credsPath);

	// Tanya metode koneksi di sini (parent process) sebelum worker jalan
	let usePairing = false;
	let pairingPhone = '';
	if (isNewSession) {
		const result = await selectConnectionMethod();
		usePairing = result.usePairing;
		pairingPhone = result.phone;
	}

	process.env.NEXUSMD_CONFIG = resolvedConfig;
	process.env.NEXUSMD_CWD = process.cwd();
	process.env.NEXUSMD_USE_PAIRING = usePairing ? '1' : '0';
	process.env.NEXUSMD_PHONE = pairingPhone;

	let worker = null;
	let running = false;
	let restartTimer = null;

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	function start() {
		if (running) return;
		running = true;

		const workerPath = join(__dirname, 'core', 'worker.js');
		if (worker) worker.terminate();
		worker = new Worker(workerPath, {
			env: { ...process.env },
		});

		if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }

		worker.on('message', (msg) => {
			if (msg === 'restart' || msg === 'reset') restart();
		});

		worker.on('exit', (code) => {
			console.log('[nexusmd] ❗ Worker exited with code', code);
			running = false;
			if (code !== 0) {
				restartTimer = setTimeout(() => {
					console.log('[nexusmd] ⏳ Auto restart...');
					restart();
				}, 30 * 60 * 1000);
			}
			watchFile(workerPath, () => {
				unwatchFile(workerPath);
				console.log('[nexusmd] ♻️ Core updated → Restarting...');
				start();
			});
		});

		if (!rl.listenerCount('line')) {
			rl.on('line', (line) => {
				const cmd = line.trim().toLowerCase();
				if (!cmd) return;
				if (cmd === 'exit') {
					console.log('[nexusmd] ⛔ Exiting...');
					worker?.terminate();
					process.exit(0);
				}
				if (cmd === 'restart' || cmd === 'reset') {
					console.log('[nexusmd] 🍃 Restart...');
					restart();
				}
				worker?.postMessage(cmd);
			});
		}
	}

	function restart() {
		if (worker) { try { worker.terminate(); } catch {} }
		running = false;
		start();
	}

	console.log('[nexusmd] 🐾 Starting bot...');
	start();
}
