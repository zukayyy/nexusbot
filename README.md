# nexusmd

WhatsApp Multi-Device bot module powered by [Baileys](https://github.com/WhiskeySockets/Baileys).

## Install

```bash
npm install nexusmd
```

## Usage

```js
import startBot from "nexusmd";

startBot("./config.js");
```

## Setup Config

Kalau belum punya `config.js`, copy dari contoh yang ada di module:

```bash
cp node_modules/nexusmd/config.example.js config.js
```

Lalu edit `config.js` sesuai kebutuhan:

```js
global.pairingNumber = 628xxxxxxxxxx; // Nomor WA kamu
global.owner = [['628xxxxxxxxxx', 'NamaMu', true]];
global.namebot = 'NexusBOT - MD';
// ... dst
```

## Struktur Project (User)

```
my-bot/
├── config.js        ← kamu buat sendiri (copy dari config.example.js)
├── index.js         ← entry point kamu
├── sessions/        ← auto dibuat saat pertama login
├── database.json    ← auto dibuat
└── package.json
```

`index.js` milikmu cukup:

```js
import startBot from "nexusmd";

startBot("./config.js");
```

## Pairing Code

Saat pertama kali jalan, bot akan print **Pairing Code** di terminal.
Buka WhatsApp → Linked Devices → Link with phone number → masukkan kode.

## Commands via Terminal

| Input     | Aksi              |
|-----------|-------------------|
| `restart` | Restart bot       |
| `reset`   | Reset koneksi     |
| `exit`    | Matikan bot       |

## License

ISC
