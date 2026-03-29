/**
 * rsaModule.js — RSA 像素复合加密核心模块  v2.0
 *
 * 零外部依赖，全程 BigInt 精度。
 *
 * ┌─ 复合加密管线（encrypt）────────────────────────────────────────────────┐
 * │  原图 ImageData(W×H)                                                    │
 * │    ──[§6 RSA 横向加密]──▶ [§5 _packH]  ImageData(2W × H)               │
 * │    ──[§4 duoMix  #1]───▶              ImageData(2W × H)               │
 * │    ──[§6 RSA 纵向加密]──▶ [§5 _packV]  ImageData(2W × 2H)              │
 * │    ──[§4 duoMix  #2]───▶              ImageData(2W × 2H)              │
 * │    ──[§4 _toCanvas]────▶              Canvas(2W × 2H)   ← 输出         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 复合解密管线（decrypt）────────────────────────────────────────────────┐
 * │  加密 Canvas(2W×2H)                                                     │
 * │    ──[§4 _fromCanvas]──▶              ImageData(2W × 2H)               │
 * │    ──[§4 duoMix  #2⁻¹]─▶              ImageData(2W × 2H)              │
 * │    ──[§5 _unpackV]─────▶ [§6 RSA纵向解密] ImageData(2W × H)            │
 * │    ──[§4 duoMix  #1⁻¹]─▶              ImageData(2W × H)               │
 * │    ──[§5 _unpackH]─────▶ [§6 RSA横向解密] ImageData(W × H)  ← 输出    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 注：duoMix 是自逆变换，duoMix⁻¹ ≡ duoMix
 *
 * 导出 window.RSAModule：
 *   数学工具  isPrime · gcd · modPow · modInverse · generateRandomPrime
 *   参数构建  buildParams · autoGenerateParams
 *   密钥文件  exportKeyFile · parseKeyFile
 *   图像工具  duoMix
 *   主接口    encrypt · decrypt
 */
(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // §1  数学工具（BigInt）
    // ════════════════════════════════════════════════════════════════

    /** 试除法判断素数 */
    function isPrime(n) {
        n = parseInt(n);
        if (n < 2)       return false;
        if (n === 2)     return true;
        if (n % 2 === 0) return false;
        for (let i = 3; i * i <= n; i += 2)
            if (n % i === 0) return false;
        return true;
    }

    /** 辗转相除法求最大公约数（BigInt） */
    function gcd(a, b) {
        a = BigInt(a); b = BigInt(b);
        while (b !== 0n) [a, b] = [b, a % b];
        return a;
    }

    /** 快速模幂：base^exp mod m（全程 BigInt） */
    function modPow(base, exp, mod) {
        base = BigInt(base); exp = BigInt(exp); mod = BigInt(mod);
        if (mod === 1n) return 0n;
        let result = 1n;
        base %= mod;
        while (exp > 0n) {
            if (exp & 1n) result = result * base % mod;
            exp >>= 1n;
            base = base * base % mod;
        }
        return result;
    }

    /**
     * 扩展欧几里得：求 d 使 e·d ≡ 1 (mod phi)
     * 无解时返回 null
     */
    function modInverse(e, phi) {
        e = BigInt(e); phi = BigInt(phi);
        let [old_r, r] = [e, phi];
        let [old_s, s] = [1n, 0n];
        while (r !== 0n) {
            const q = old_r / r;
            [old_r, r] = [r, old_r - q * r];
            [old_s, s] = [s, old_s - q * s];
        }
        if (old_r !== 1n) return null;
        return ((old_s % phi) + phi) % phi;
    }

    /** 在 [min, max] 内随机生成素数（随机尝试 + 兜底线性扫描） */
    function generateRandomPrime(min, max) {
        min = parseInt(min); max = parseInt(max);
        if (min > max) return null;
        for (let i = 0; i < 300; i++) {
            let n = Math.floor(Math.random() * (max - min + 1)) + min;
            if (n % 2 === 0) n = (n > min) ? n - 1 : n + 1;
            if (n >= min && n <= max && isPrime(n)) return n;
        }
        for (let n = min; n <= max; n++)
            if (isPrime(n)) return n;
        return null;
    }

    // ════════════════════════════════════════════════════════════════
    // §2  RSA 参数校验与构建
    // ════════════════════════════════════════════════════════════════

    /**
     * 校验并构建 RSA 参数组
     * 约束：n = p·q 须满足 255 < n ≤ 65535（16-bit 存储上限）
     * @param {number|string} p  素数 p
     * @param {number|string} q  素数 q
     * @param {number|string} e  公钥 e
     * @returns {{ valid, p, q, n, phi, e, d, error }}
     */
    function buildParams(p, q, e) {
        p = parseInt(p); q = parseInt(q); e = parseInt(e);
        if (isNaN(p) || !isPrime(p))   return { valid: false, error: `p = ${p} 不是素数` };
        if (isNaN(q) || !isPrime(q))   return { valid: false, error: `q = ${q} 不是素数` };
        if (p === q)                    return { valid: false, error: 'p 与 q 不能相等' };
        const n   = p * q;
        if (n <= 255)                   return { valid: false, error: `n = p×q = ${n}，必须 > 255` };
        if (n > 65535)                  return { valid: false, error: `n = p×q = ${n}，必须 ≤ 65535（16-bit 存储上限）` };
        const phi = (p - 1) * (q - 1);
        if (isNaN(e) || e < 2)          return { valid: false, error: 'e 必须 ≥ 2' };
        if (gcd(e, phi) !== 1n)         return { valid: false, error: `gcd(e, φ(n)) ≠ 1，请换一个 e` };
        const dBig = modInverse(e, phi);
        if (dBig === null)              return { valid: false, error: '无法计算私钥 d' };
        return { valid: true, p, q, n, phi, e, d: Number(dBig) };
    }

    /** 随机生成一组合法 RSA 参数，500 次内失败返回 null */
    function autoGenerateParams() {
        for (let attempt = 0; attempt < 500; attempt++) {
            const p = generateRandomPrime(17, 251);
            const q = generateRandomPrime(17, 251);
            if (!p || !q || p === q) continue;
            const n = p * q;
            if (n <= 255 || n > 65535) continue;
            const phi = (p - 1) * (q - 1);
            let e = 3;
            while (e < phi) { if (gcd(e, phi) === 1n) break; e += 2; }
            if (e >= phi) continue;
            const dBig = modInverse(e, phi);
            if (dBig === null) continue;
            return { valid: true, p, q, n, phi, e, d: Number(dBig) };
        }
        return null;
    }

    // ════════════════════════════════════════════════════════════════
    // §3  密钥文件导出 / 解析
    // ════════════════════════════════════════════════════════════════

    /**
     * 将私钥信息导出为 .pspkey 文件并触发浏览器下载
     * @param {'single'|'multi'} mode
     * @param {Array<{n, d}>}    layers
     */
    function exportKeyFile(mode, layers) {
        const payload = {
            app:     'PSPixel',
            version: '2.0',
            mode,
            layers:  layers.map(({ n, d }) => ({ n, d }))
        };
        const blob = new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `pixelkey_${Date.now()}.pspkey`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 解析上传的 .pspkey 密钥文件
     * @param   {File} file
     * @returns {Promise<{ valid, mode, layers, error }>}
     */
    function parseKeyFile(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.app !== 'PSPixel')
                        return resolve({ valid: false, error: '不是有效的 PSPixel 密钥文件' });
                    if (!Array.isArray(data.layers) || data.layers.length === 0)
                        return resolve({ valid: false, error: '密钥文件缺少 layers 字段' });
                    for (let i = 0; i < data.layers.length; i++) {
                        const l = data.layers[i];
                        if (l.n === undefined || l.d === undefined)
                            return resolve({ valid: false, error: `第 ${i + 1} 层缺少 n 或 d` });
                    }
                    resolve({ valid: true, mode: data.mode || 'single', layers: data.layers });
                } catch {
                    resolve({ valid: false, error: '密钥文件 JSON 解析失败' });
                }
            };
            reader.onerror = () => resolve({ valid: false, error: '文件读取失败' });
            reader.readAsText(file);
        });
    }

    // ════════════════════════════════════════════════════════════════
    // §4  图像工具
    // ════════════════════════════════════════════════════════════════

    /**
     * 棋盘格反色变换（DuoMix）
     *
     * 对满足 (col + row) % 2 === 0 的像素执行 RGB 反色（255 − channel），
     * 透明度通道始终保持不变。
     *
     * 该变换自逆：duoMix(duoMix(img)) ≡ img
     * 因此同一函数同时承担加密端"混淆"与解密端"还原"两种职责。
     *
     * @param   {ImageData} imgData  输入图像（只读，不修改原数据）
     * @returns {ImageData}          新的 ImageData（与输入同尺寸）
     */
    function duoMix(imgData) {
        const w   = imgData.width, h = imgData.height;
        const src = imgData.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const i = (row * w + col) * 4;
                if ((col + row) % 2 === 0) {
                    dst[i]     = 255 - src[i];
                    dst[i + 1] = 255 - src[i + 1];
                    dst[i + 2] = 255 - src[i + 2];
                } else {
                    dst[i]     = src[i];
                    dst[i + 1] = src[i + 1];
                    dst[i + 2] = src[i + 2];
                }
                dst[i + 3] = src[i + 3]; // alpha 不变
            }
        }
        return out;
    }

    /** ImageData → HTMLCanvasElement（内部工具） */
    function _toCanvas(imgData) {
        const c = document.createElement('canvas');
        c.width  = imgData.width;
        c.height = imgData.height;
        c.getContext('2d').putImageData(imgData, 0, 0);
        return c;
    }

    /** HTMLCanvasElement → ImageData（内部工具） */
    function _fromCanvas(canvas) {
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    }

    // ════════════════════════════════════════════════════════════════
    // §5  像素打包 / 解包（横向 & 纵向）
    //
    //  每个 16-bit 加密值 V（0~65535）拆为两个 8-bit 字节存储：
    //    Hi = V >> 8        （高字节）
    //    Lo = V & 0xFF      （低字节）
    //
    //  横向打包 _packH：
    //    像素(col, row)  →  像素A(2·col,   row) + 像素B(2·col+1, row)
    //    尺寸变化：ImageData(W×H) → ImageData(2W×H)
    //
    //  纵向打包 _packV：
    //    像素(col, row)  →  像素A(col, 2·row) + 像素B(col, 2·row+1)
    //    尺寸变化：ImageData(W×H) → ImageData(W×2H)
    //
    //  像素A 存 Hi 字节，alpha 固定 255（防预乘损坏高字节数据）
    //  像素B 存 Lo 字节，alpha 保留原始值
    // ════════════════════════════════════════════════════════════════

    /**
     * 横向打包：EncPixel[](W×H) → ImageData(2W×H)
     *
     * @param   {number}      origW
     * @param   {number}      origH
     * @param   {EncPixel[]}  encPixels
     * @returns {ImageData}
     */
    function _packH(origW, origH, encPixels) {
        const outW = origW * 2;
        const out  = new ImageData(outW, origH);
        const d    = out.data;
        for (let i = 0; i < encPixels.length; i++) {
            const { rHi, gHi, bHi, rLo, gLo, bLo, alpha, aRand } = encPixels[i];
            const col = i % origW;
            const row = Math.floor(i / origW);
            // 像素 A：高字节，alpha 固定 255
            const iA  = (row * outW + col * 2) * 4;
            d[iA]     = rHi; d[iA + 1] = gHi; d[iA + 2] = bHi; d[iA + 3] = aRand;
            // 像素 B：低字节，alpha 保留原始值
            const iB  = iA + 4;
            d[iB]     = rLo; d[iB + 1] = gLo; d[iB + 2] = bLo; d[iB + 3] = alpha;
        }
        return out;
    }

    /**
     * 横向解包：ImageData(2W×H) → { valid, origW, origH, encPixels }
     *
     * @param   {ImageData} imgData
     * @returns {{ valid:true, origW:number, origH:number, encPixels:Object[] }
     *           | { valid:false, error:string }}
     */
    function _unpackH(imgData) {
        const encW = imgData.width, encH = imgData.height;
        if (encW % 2 !== 0)
            return { valid: false, error: '横向解密失败：图像宽度须为偶数' };
        const origW = encW / 2, origH = encH;
        const d     = imgData.data;
        const encPixels = new Array(origW * origH);
        for (let row = 0; row < origH; row++) {
            for (let col = 0; col < origW; col++) {
                const iA = (row * encW + col * 2) * 4;
                const iB = iA + 4;
                encPixels[row * origW + col] = {
                    rHi: d[iA],     gHi: d[iA + 1], bHi: d[iA + 2],
                    rLo: d[iB],     gLo: d[iB + 1], bLo: d[iB + 2],
                    alpha: d[iB + 3]  // 原始 alpha 保存在像素 B
                };
            }
        }
        return { valid: true, origW, origH, encPixels };
    }

    /**
     * 纵向打包：EncPixel[](W×H) → ImageData(W×2H)
     *
     * @param   {number}      origW
     * @param   {number}      origH
     * @param   {EncPixel[]}  encPixels
     * @returns {ImageData}
     */
    function _packV(origW, origH, encPixels) {
        const outH = origH * 2;
        const out  = new ImageData(origW, outH);
        const d    = out.data;
        for (let i = 0; i < encPixels.length; i++) {
            const { rHi, gHi, bHi, rLo, gLo, bLo, alpha, aRand } = encPixels[i];
            const col = i % origW;
            const row = Math.floor(i / origW);
            // 像素 A：高字节，alpha 固定 255
            const iA  = (row * 2 * origW + col) * 4;
            d[iA]     = rHi; d[iA + 1] = gHi; d[iA + 2] = bHi; d[iA + 3] = aRand;
            // 像素 B：低字节，alpha 保留原始值
            const iB  = ((row * 2 + 1) * origW + col) * 4;
            d[iB]     = rLo; d[iB + 1] = gLo; d[iB + 2] = bLo; d[iB + 3] = alpha;
        }
        return out;
    }

    /**
     * 纵向解包：ImageData(W×2H) → { valid, origW, origH, encPixels }
     *
     * @param   {ImageData} imgData
     * @returns {{ valid:true, origW:number, origH:number, encPixels:Object[] }
     *           | { valid:false, error:string }}
     */
    function _unpackV(imgData) {
        const encW = imgData.width, encH = imgData.height;
        if (encH % 2 !== 0)
            return { valid: false, error: '纵向解密失败：图像高度须为偶数' };
        const origW = encW, origH = encH / 2;
        const d     = imgData.data;
        const encPixels = new Array(origW * origH);
        for (let row = 0; row < origH; row++) {
            for (let col = 0; col < origW; col++) {
                const iA = (row * 2 * encW + col) * 4;
                const iB = ((row * 2 + 1) * encW + col) * 4;
                encPixels[row * origW + col] = {
                    rHi: d[iA],     gHi: d[iA + 1], bHi: d[iA + 2],
                    rLo: d[iB],     gLo: d[iB + 1], bLo: d[iB + 2],
                    alpha: d[iB + 3]  // 原始 alpha 保存在像素 B
                };
            }
        }
        return { valid: true, origW, origH, encPixels };
    }

    // ════════════════════════════════════════════════════════════════
    // §6  异步 RSA 像素级操作
    //
    //  层分配规则：像素(col, row) → 使用第 (col + row) % l 层参数
    //  每批 CHUNK 个像素处理后 setTimeout 让出 UI 线程，保持页面响应
    // ════════════════════════════════════════════════════════════════

    /** 每批处理的像素数（控制 UI 响应流畅度） */
    const CHUNK = 1500;

    /**
     * RSA 像素加密：ImageData → EncPixel[]（异步分块）
     *
     * @param   {ImageData}                    imgData
     * @param   {Array<{n:bigint, e:bigint}>}  layersBig   预转 BigInt 的层参数
     * @param   {function(number):void}        onProgress  接收 0~100 进度值
     * @returns {Promise<EncPixel[]>}
     */
    function _encryptPixelsAsync(imgData, layersBig, onProgress) {
        return new Promise(resolve => {
            const w = imgData.width, h = imgData.height;
            const total = w * h, l = layersBig.length;
            const encPixels = new Array(total);
            let i = 0;
            (function step() {
                const end = Math.min(i + CHUNK, total);
                for (; i < end; i++) {
                    const col = i % w, row = Math.floor(i / w);
                    const { n, e } = layersBig[(col + row) % l];
                    const base = i * 4;
                    const r  = imgData.data[base];
                    const g  = imgData.data[base + 1];
                    const b  = imgData.data[base + 2];
                    const a  = imgData.data[base + 3];
                    const rE = Number(modPow(r, e, n));
                    const gE = Number(modPow(g, e, n));
                    const bE = Number(modPow(b, e, n));
                    encPixels[i] = {
                        rHi: rE >> 8,   gHi: gE >> 8,   bHi: bE >> 8,
                        rLo: rE & 0xFF, gLo: gE & 0xFF, bLo: bE & 0xFF,
                        alpha: a,
                        aRand: 255  // 固定不透明，防止预乘 alpha 损坏高字节数据
                    };
                }
                onProgress(Math.floor(i / total * 100));
                if (i < total) setTimeout(step, 0);
                else           resolve(encPixels);
            })();
        });
    }

    /**
     * RSA 像素解密：EncPixel[] → ImageData（异步分块）
     *
     * @param   {EncPixel[]}                   encPixels
     * @param   {number}                       origW
     * @param   {number}                       origH
     * @param   {Array<{n:bigint, d:bigint}>}  layersBig
     * @param   {function(number):void}        onProgress
     * @returns {Promise<ImageData>}
     */
    function _decryptPixelsAsync(encPixels, origW, origH, layersBig, onProgress) {
        return new Promise(resolve => {
            const total  = origW * origH, l = layersBig.length;
            const output = new ImageData(origW, origH);
            let i = 0;
            (function step() {
                const end = Math.min(i + CHUNK, total);
                for (; i < end; i++) {
                    const col = i % origW, row = Math.floor(i / origW);
                    const { n, d } = layersBig[(col + row) % l];
                    const ep  = encPixels[i];
                    const rE  = (ep.rHi << 8) | ep.rLo;
                    const gE  = (ep.gHi << 8) | ep.gLo;
                    const bE  = (ep.bHi << 8) | ep.bLo;
                    const dst = i * 4;
                    output.data[dst]     = Number(modPow(rE, d, n));
                    output.data[dst + 1] = Number(modPow(gE, d, n));
                    output.data[dst + 2] = Number(modPow(bE, d, n));
                    output.data[dst + 3] = ep.alpha;
                }
                onProgress(Math.floor(i / total * 100));
                if (i < total) setTimeout(step, 0);
                else           resolve(output);
            })();
        });
    }

    // ════════════════════════════════════════════════════════════════
    // §7  复合加密 / 解密管线（公开接口）
    // ════════════════════════════════════════════════════════════════

    /**
     * 复合加密：原图 → 加密 Canvas(2W × 2H)
     *
     * 进度分段（按实际工作量比例分配，纵向阶段处理像素数为横向 2 倍）：
     *   Phase 1  RSA 横向加密（W×H  像素，1 份工作）:   0% →  33%
     *   Phase 2  RSA 纵向加密（2W×H 像素，2 份工作）:  33% → 100%
     *
     * @param   {ImageData}            imgData     原始图像数据
     * @param   {Array<{n, e}>}        layers      公钥层数组，single 时长度 1
     * @param   {function(number):void} onProgress  进度回调 (0~100)
     * @returns {Promise<HTMLCanvasElement>}        2W×2H 加密结果 canvas
     */
    async function encrypt(imgData, layers, onProgress) {
        // 预转 BigInt，避免热循环内重复转换
        const layersBig = layers.map(({ n, e }) => ({ n: BigInt(n), e: BigInt(e) }));
        const origW = imgData.width, origH = imgData.height;

        // ── Phase 1：RSA 横向加密（W×H → 2W×H）─────────────────────
        const ep1   = await _encryptPixelsAsync(
            imgData, layersBig,
            p => onProgress(Math.floor(p / 3))              // 0 → 33
        );
        const pack1 = _packH(origW, origH, ep1);            // ImageData(2W×H)

        // ── DuoMix #1（棋盘格反色，为纵向加密增加混淆层）────────────
        const mix1  = duoMix(pack1);                        // ImageData(2W×H)

        // ── Phase 2：RSA 纵向加密（2W×H → 2W×2H）───────────────────
        const ep2   = await _encryptPixelsAsync(
            mix1, layersBig,
            p => onProgress(33 + Math.floor(p * 2 / 3))    // 33 → 99
        );
        const pack2 = _packV(mix1.width, mix1.height, ep2); // ImageData(2W×2H)

        // ── DuoMix #2（棋盘格反色，输出混淆层）──────────────────────
        const mix2  = duoMix(pack2);                        // ImageData(2W×2H)

        onProgress(100);
        return _toCanvas(mix2);
    }

    /**
     * 复合解密：加密 Canvas(2W×2H) → 原图 ImageData(W×H)
     *
     * 进度分段（与加密管线镜像对称）：
     *   Phase 1  RSA 纵向解密（2W×H 像素，2 份工作）:   0% →  67%
     *   Phase 2  RSA 横向解密（W×H  像素，1 份工作）:  67% → 100%
     *
     * @param   {HTMLCanvasElement}    encCanvas   2W×2H 加密图
     * @param   {Array<{n, d}>}        layers      私钥层数组
     * @param   {function(number):void} onProgress  进度回调 (0~100)
     * @returns {Promise<ImageData|null>}           成功返回原图，失败返回 null
     */
    async function decrypt(encCanvas, layers, onProgress) {
        const encImgData = _fromCanvas(encCanvas);

        // 尺寸合法性检查：复合加密后宽高均翻倍，须同时为偶数
        if (encImgData.width % 2 !== 0 || encImgData.height % 2 !== 0) return null;

        // 预转 BigInt
        const layersBig = layers.map(({ n, d }) => ({ n: BigInt(n), d: BigInt(d) }));

        // ── 逆 DuoMix #2（还原纵向打包前的状态）────────────────────
        const unmix2 = duoMix(encImgData);                  // ImageData(2W×2H)

        // ── Phase 1：RSA 纵向解密（2W×2H → 2W×H）───────────────────
        const uV = _unpackV(unmix2);
        if (!uV.valid) return null;
        const decV = await _decryptPixelsAsync(
            uV.encPixels, uV.origW, uV.origH, layersBig,
            p => onProgress(Math.floor(p * 2 / 3))          // 0 → 67 (含进度截断)
        );                                                  // ImageData(2W×H)

        // ── 逆 DuoMix #1（还原横向打包前的状态）────────────────────
        const unmix1 = duoMix(decV);                        // ImageData(2W×H)

        // ── Phase 2：RSA 横向解密（2W×H → W×H）─────────────────────
        const uH = _unpackH(unmix1);
        if (!uH.valid) return null;
        const decH = await _decryptPixelsAsync(
            uH.encPixels, uH.origW, uH.origH, layersBig,
            p => onProgress(67 + Math.floor(p / 3))         // 67 → 100
        );                                                  // ImageData(W×H)

        onProgress(100);
        return decH;
    }

    // ════════════════════════════════════════════════════════════════
    // 公开接口
    // ════════════════════════════════════════════════════════════════
    window.RSAModule = {
        // §1 数学工具
        isPrime,
        gcd,
        modPow,
        modInverse,
        generateRandomPrime,
        // §2 参数构建
        buildParams,
        autoGenerateParams,
        // §3 密钥文件
        exportKeyFile,
        parseKeyFile,
        // §4 图像工具（duoMix 同时用于外部滤镜调用）
        duoMix,
        // §7 主接口
        encrypt,
        decrypt
    };
})();
