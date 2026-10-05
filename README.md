# ZCmini

ZCmini is a minimal UTXO chain and digital currency that mints and spends coins with zero-knowledge proofs, enabling full value and participant anonymity on a public ledger. Implementation of the [Zerocash protocol](http://zerocash-project.org/media/pdf/zerocash-extended-20140518.pdf) by Ben-Sasson et al.

## How to run

Requires Node.js 18+.

```bash
npm install
```

Start the server (`http://localhost:3000`):

```bash
npm start
```

In a second terminal, run the client:

```bash
npm run client
```

Use `npm run dev` instead of `npm start` to auto-reload the server. Run tests with `npm test`.

On Windows, use two terminals. `npm run start:all` / `npm run dev:all` use `&` and may not work in PowerShell.