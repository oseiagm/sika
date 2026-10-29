// Workers can't compile WebAssembly from bytes at runtime, so the Opus decoder's wasm
// (shipped inside opus-decoder as an encoded string) is extracted once and imported as a module.
import { writeFileSync } from "node:fs";
import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "../node_modules/opus-decoder/src/EmscriptenWasm.js";

new WASMAudioDecoderCommon(); // defines the static helpers
new EmscriptenWASM(WASMAudioDecoderCommon); // attaches the encoded wasm string
const bytes = await WASMAudioDecoderCommon.inflateDynEncodeString(EmscriptenWASM.wasm);
await WebAssembly.compile(bytes); // sanity check
writeFileSync(new URL("../src/voice/opus-decoder.wasm", import.meta.url), bytes);
console.log(`wrote opus-decoder.wasm (${bytes.length} bytes)`);
