/* @ts-self-types="./norm_engine.d.ts" */
import * as wasm from "./norm_engine_bg.wasm";
import { __wbg_set_wasm } from "./norm_engine_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    NormEngine
} from "./norm_engine_bg.js";
