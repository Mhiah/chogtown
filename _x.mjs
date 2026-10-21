import { createPublicClient, http, parseAbi } from "viem";
const c = createPublicClient({ transport: http("https://rpc3.monad.xyz") });
const N = "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
const ev = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])[0];
const head = await c.getBlockNumber();
let found = [], t0 = Date.now(), calls = 0;
for (let b = head; b > head - 200000n && found.length < 3; b -= 100n) {
  try { const l = await c.getLogs({ address: N, event: ev, fromBlock: b - 99n, toBlock: b }); calls++; found.push(...l); }
  catch (e) { console.log("range err", String(e.message).slice(0, 120)); break; }
}
console.log("head", head, "calls", calls, "ms", Date.now() - t0, "found", found.length);
for (const l of found.slice(-3)) console.log(l.blockNumber, l.args.tokenId, l.args.from.slice(0, 8), "->", l.args.to.slice(0, 8));
