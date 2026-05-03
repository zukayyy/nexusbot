import { Worker } from 'worker_threads';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { watchFile, unwatchFile, existsSync } from 'fs';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start the WhatsApp bot
 * @param {string} configPath - Path to your config.js file (e.g. "./config.js")
 */
export default function startBot(configPath = './config.js') {
	// Resolve config path relative to caller's cwd
	const resolvedConfig = isAbsolute(configPath)
		? configPath
		: resolve(process.cwd(), configPath);

	if (!existsSync(resolvedConfig)) {
		console.error(`[nexusmd] ❌ Config file not found: ${resolvedConfig}`);
		console.error(`[nexusmd] 💡 Copy the example config: cp node_modules/nexusmd/config.example.js config.js`);
		process.exit(1);
	}

	// Pass config path to worker via env
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
