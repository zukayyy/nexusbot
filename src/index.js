import { Worker } from 'worker_threads';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { watchFile, unwatchFile, existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Auto fix package.json user (tambah "type": "module" kalau belum ada) ──
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

/**
 * Start the WhatsApp bot
 * @param {string} configPath - Path to your config.js file (e.g. "./config.js")
 */
export default function startBot(configPath = './config.js') {
	// Fix package.json dulu
	ensureModuleType();

	// Resolve config path relative to caller's cwd
	const resolvedConfig = isAbsolute(configPath)
		? configPath
		: resolve(process.cwd(), configPath);

	// Auto copy config.example.js kalau config belum ada
	if (!existsSync(resolvedConfig)) {
		const exampleConfig = join(__dirname, '..', 'config.example.js');
		copyFileSync(exampleConfig, resolvedConfig);
		console.log(`[nexusmd] 📋 config.js otomatis dicopy dari config.example.js`);
		console.log(`[nexusmd] ✏️  Edit config.js terlebih dahulu, lalu jalankan ulang!`);
		process.exit(0);
	}

	// Pass config path ke worker via env
	process.env.NEXUSMD_CONFIG = resolvedConfig;
	process.env.NEXUSMD_CWD = process.cwd();

	const rl = readline.createInterface(process.stdin, process.stdout);

	let worker = null;
	let running = false;
	let restartTimer = null;

	function start() {
		if (running) return;
		running = true;

		const workerPath = join(__dirname, 'core', 'worker.js');

		if (worker) worker.terminate();
		worker = new Worker(workerPath, {
			env: {
				...process.env,
				NEXUSMD_CONFIG: resolvedConfig,
				NEXUSMD_CWD: process.cwd(),
			},
		});

		if (restartTimer) {
			clearTimeout(restartTimer);
			restartTimer = null;
		}

		worker.on('message', (msg) => {
			if (msg === 'restart' || msg === 'reset') {
				restart();
			}
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
		if (worker) {
			try { worker.terminate(); } catch {}
		}
		running = false;
		start();
	}

	console.log('[nexusmd] 🐾 Starting bot with config:', resolvedConfig);
	start();
}
