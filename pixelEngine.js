/**
 * PixelEngine — 像素块生成与混合核心算法
 *
 * 接口：
 *   window.PixelEngine.BLOCK_RENDER_SIZE          每块渲染像素数
 *   window.PixelEngine.generatePixelDataFromImage  单图像素化
 *   window.PixelEngine.mixPixelData               双图棋盘混合
 */
(function () {
    const BLOCK_RENDER_SIZE = 1;

    /**
     * 将 ImageData 按 n×m 块网格像素化，返回新 ImageData
     * @param {ImageData} imgData   原始图像数据
     * @param {number} srcWidth     原图宽度
     * @param {number} srcHeight    原图高度
     * @param {number} n            水平块数
     * @param {number} m            垂直块数
     * @returns {ImageData}
     */
    function generatePixelDataFromImage(imgData, srcWidth, srcHeight, n, m) {
        const outWidth = n * BLOCK_RENDER_SIZE;
        const outHeight = m * BLOCK_RENDER_SIZE;
        const outputData = new ImageData(outWidth, outHeight);
        const stepX = srcWidth / n;
        const stepY = srcHeight / m;

        for (let by = 0; by < m; by++) {
            for (let bx = 0; bx < n; bx++) {
                let startX = Math.floor(bx * stepX);
                let endX   = Math.floor((bx + 1) * stepX);
                let startY = Math.floor(by * stepY);
                let endY   = Math.floor((by + 1) * stepY);
                if (endX <= startX) endX = startX + 1;
                if (endY <= startY) endY = startY + 1;
                startX = Math.min(Math.max(startX, 0), srcWidth - 1);
                endX   = Math.min(Math.max(endX, startX + 1), srcWidth);
                startY = Math.min(Math.max(startY, 0), srcHeight - 1);
                endY   = Math.min(Math.max(endY, startY + 1), srcHeight);

                let rSum = 0, gSum = 0, bSum = 0, pixelCount = 0;
                for (let py = startY; py < endY; py++) {
                    for (let px = startX; px < endX; px++) {
                        const idx = (py * srcWidth + px) * 4;
                        rSum += imgData.data[idx];
                        gSum += imgData.data[idx + 1];
                        bSum += imgData.data[idx + 2];
                        pixelCount++;
                    }
                }
                const avgR = Math.floor(rSum / pixelCount);
                const avgG = Math.floor(gSum / pixelCount);
                const avgB = Math.floor(bSum / pixelCount);

                const destStartX = bx * BLOCK_RENDER_SIZE;
                const destStartY = by * BLOCK_RENDER_SIZE;
                for (let dy = 0; dy < BLOCK_RENDER_SIZE; dy++) {
                    for (let dx = 0; dx < BLOCK_RENDER_SIZE; dx++) {
                        const destIdx = ((destStartY + dy) * outWidth + (destStartX + dx)) * 4;
                        outputData.data[destIdx]     = avgR;
                        outputData.data[destIdx + 1] = avgG;
                        outputData.data[destIdx + 2] = avgB;
                        outputData.data[destIdx + 3] = 255;
                    }
                }
            }
        }
        return outputData;
    }

    /**
     * 将两张已像素化的 ImageData 按模式交替混合
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {'row'|'col'|'checker'} mode
     * @returns {ImageData}
     */
    function mixPixelData(data1, data2, mode) {
        const w = data1.width, h = data1.height;
        const n = w / BLOCK_RENDER_SIZE, m = h / BLOCK_RENDER_SIZE;
        const result = new ImageData(w, h);

        for (let by = 0; by < m; by++) {
            for (let bx = 0; bx < n; bx++) {
                let useFirst;
                if (mode === 'row')         useFirst = (by % 2 === 0);
                else if (mode === 'col')    useFirst = (bx % 2 === 0);
                else                        useFirst = ((bx + by) % 2 === 0);

                const srcData    = useFirst ? data1 : data2;
                const destStartX = bx * BLOCK_RENDER_SIZE;
                const destStartY = by * BLOCK_RENDER_SIZE;
                for (let dy = 0; dy < BLOCK_RENDER_SIZE; dy++) {
                    for (let dx = 0; dx < BLOCK_RENDER_SIZE; dx++) {
                        const idx = ((destStartY + dy) * w + (destStartX + dx)) * 4;
                        result.data[idx]     = srcData.data[idx];
                        result.data[idx + 1] = srcData.data[idx + 1];
                        result.data[idx + 2] = srcData.data[idx + 2];
                        result.data[idx + 3] = 255;
                    }
                }
            }
        }
        return result;
    }

    /**
     * 编译二元函数表达式字符串，返回 (a, b) => number 的函数。
     * 沙箱：仅暴露白名单 Math 函数；用边界值 (0, 255) 预检返回值类型。
     *
     * @param {string} funcStr  如 "a + b"、"abs(a-b)"
     * @returns {Function}
     * @throws {Error} 语法非法或返回非有限数
     */
    function _compileFunc(funcStr) {
        const fn = new Function('a', 'b',
            'var abs=Math.abs,max=Math.max,min=Math.min,floor=Math.floor,' +
            'ceil=Math.ceil,round=Math.round,sqrt=Math.sqrt,pow=Math.pow,' +
            'sin=Math.sin,cos=Math.cos,log=Math.log;' +
            'return (' + funcStr + ');'
        );
        const test = fn(0, 255);
        if (typeof test !== 'number' || !isFinite(test))
            throw new Error('function must return a finite number');
        return fn;
    }

    /** 安全取模，确保结果在 [0, 255] */
    function _mod256(v) { return ((v % 256) + 256) % 256; }

    /**
     * 统一函数混合：对两张已像素化的 ImageData，用同一个二元函数 f(a,b)
     * 逐像素、逐通道（R/G/B/A）计算输出。
     *
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {string}    funcStr  如 "a + b"
     * @returns {ImageData}
     * @throws {Error} 若 funcStr 语法非法
     */
    function funcMixPixelData(data1, data2, funcStr) {
        let fn;
        try {
            fn = _compileFunc(funcStr);
        } catch (e) {
            throw new Error('FUNC PARSE ERROR: ' + e.message);
        }

        const w = data1.width, h = data1.height;
        const result = new ImageData(w, h);
        const d1 = data1.data, d2 = data2.data, out = result.data;

        for (let i = 0; i < d1.length; i += 4) {
            out[i]     = _mod256(fn(d1[i],     d2[i]));
            out[i + 1] = _mod256(fn(d1[i + 1], d2[i + 1]));
            out[i + 2] = _mod256(fn(d1[i + 2], d2[i + 2]));
            out[i + 3] = 255;
        }
        return result;
    }

    /**
     * 分通道函数混合：对两张已像素化的 ImageData，为 R/G/B/A 四个通道分别
     * 指定独立的二元函数，各自计算对应通道的输出值。
     *
     * 每个输出通道值 = (f_channel(a, b) mod 256 + 256) mod 256。
     *
     * @param {ImageData} data1
     * @param {ImageData} data2
     * @param {string}    strR   R 通道表达式，如 "abs(a-b)"
     * @param {string}    strG   G 通道表达式
     * @param {string}    strB   B 通道表达式
     * @param {string}    strA   A 通道表达式，如 "255"
     * @returns {ImageData}
     * @throws {Error} 若任一表达式语法非法（错误信息含通道名）
     */
    function funcMixPixelDataChannels(data1, data2, strR, strG, strB, strA) {
        const labels = ['R', 'G', 'B', 'A'];
        const strs   = [strR, strG, strB, strA];
        const fns    = [];
        for (let c = 0; c < 4; c++) {
            try {
                fns.push(_compileFunc(strs[c]));
            } catch (e) {
                throw new Error(`FUNC PARSE ERROR [${labels[c]}]: ${e.message}`);
            }
        }
        const [fnR, fnG, fnB, fnA] = fns;

        const w = data1.width, h = data1.height;
        const result = new ImageData(w, h);
        const d1 = data1.data, d2 = data2.data, out = result.data;

        for (let i = 0; i < d1.length; i += 4) {
            out[i]     = _mod256(fnR(d1[i],     d2[i]));
            out[i + 1] = _mod256(fnG(d1[i + 1], d2[i + 1]));
            out[i + 2] = _mod256(fnB(d1[i + 2], d2[i + 2]));
            out[i + 3] = _mod256(fnA(d1[i + 3], d2[i + 3]));
        }
        return result;
    }

    /**
     * 像素平均：对已像素化的 ImageData，将每个像素 (x,y) 替换为
     * 其曼哈顿距离 ≤ d 的所有邻域像素（含自身，超出边界则跳过）
     * 的 RGB 分量均值。Alpha 固定输出 255。
     *
     * 曼哈顿邻域遍历：dy ∈ [-d, d]，dx ∈ [-(d-|dy|), d-|dy|]，
     * 时间复杂度 O(w·h·d²)。d=0 时等价于恒等（无变化）。
     *
     * @param {ImageData} imgData  待处理的像素图像
     * @param {number}    d        曼哈顿半径，整数 ≥ 0
     * @returns {ImageData}        新 ImageData，与输入同尺寸
     */
    function pixelAverageData(imgData, d) {
        const w = imgData.width, h = imgData.height;
        const src = imgData.data;
        const result = new ImageData(w, h);
        const out = result.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let dy = -d; dy <= d; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= h) continue;
                    const dxMax = d - Math.abs(dy);
                    for (let dx = -dxMax; dx <= dxMax; dx++) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= w) continue;
                        const idx = (ny * w + nx) * 4;
                        rSum += src[idx];
                        gSum += src[idx + 1];
                        bSum += src[idx + 2];
                        count++;
                    }
                }
                const destIdx = (y * w + x) * 4;
                out[destIdx]     = Math.floor(rSum / count);
                out[destIdx + 1] = Math.floor(gSum / count);
                out[destIdx + 2] = Math.floor(bSum / count);
                out[destIdx + 3] = 255;
            }
        }
        return result;
    }

    window.PixelEngine = {
        BLOCK_RENDER_SIZE,
        generatePixelDataFromImage,
        mixPixelData,
        funcMixPixelData,
        funcMixPixelDataChannels,
        pixelAverageData,
    };
})();
