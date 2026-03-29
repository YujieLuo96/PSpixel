/**
 * app.js — PSpixel 主控制器
 *
 * 依赖（需在此文件前加载）：
 *   PixelEngine  (pixelEngine.js)
 *   ColorUtils   (colorUtils.js)
 *   CyberBackground (background.js)
 *
 * 负责：状态管理、图片加载、滤镜应用、UI 控制、事件绑定、初始化
 */
(function () {
    // ─── 应用状态 ────────────────────────────────────────────────
    let currentMode = 'single';   // 'single' | 'mix'

    // 单图模式
    let singleImgData = null;
    let singleWidth = 0, singleHeight = 0;
    let singleLoaded = false;
    let singleN = 32, singleM = 32;
    let singleAvgD = 1;

    // 双图模式
    let mixImg1Data = null, mixImg2Data = null;
    let mixWidth1 = 0, mixHeight1 = 0, mixWidth2 = 0, mixHeight2 = 0;
    let mixLoaded1 = false, mixLoaded2 = false;
    let mixN = 32, mixM = 32;
    let mixMode = 'row';
    let mixFuncStr = 'a + b';
    let funcSubMode = 'unified';
    let mixFuncR = 'a + b', mixFuncG = 'a + b', mixFuncB = 'a + b', mixFuncA = '255';

    // 当前像素画原始数据（用于滤镜基准）
    let currentPixelData = null;

    // ─── DOM 引用 ────────────────────────────────────────────────
    const singleModeBtn       = document.getElementById('singleModeBtn');
    const mixModeBtn          = document.getElementById('mixModeBtn');
    const singlePanel         = document.getElementById('singlePanel');
    const mixPanel            = document.getElementById('mixPanel');
    const singlePreviewCanvas = document.getElementById('singlePreviewCanvas');
    const mixPreviewContainer = document.getElementById('mixPreviewContainer');
    const mixPreviewCanvas1   = document.getElementById('mixPreviewCanvas1');
    const mixPreviewCanvas2   = document.getElementById('mixPreviewCanvas2');
    const pixelCanvas         = document.getElementById('pixelCanvas');
    const pixelCtx            = pixelCanvas.getContext('2d');
    const origStatusSpan      = document.getElementById('origStatus');
    const pixelStatusSpan     = document.getElementById('pixelStatus');
    const imgDimensionsSpan   = document.getElementById('imgDimensions');
    const grayscaleBtn        = document.getElementById('grayscaleBtn');
    const invertBtn           = document.getElementById('invertBtn');
    const resetFilterBtn      = document.getElementById('resetFilterBtn');
    const hueSlider           = document.getElementById('hueSlider');
    const hueValue            = document.getElementById('hueValue');
    const saveBtn             = document.getElementById('saveBtn');
    const resetPixelBtn       = document.getElementById('resetPixelBtn');

    // ─── 工具函数 ────────────────────────────────────────────────
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.innerText = msg;
        Object.assign(toast.style, {
            position:   'fixed',
            bottom:     '20px',
            left:       '20px',
            backgroundColor: '#ff2d9e30',
            padding:    '6px 12px',
            border:     '1px solid var(--pink)',
            zIndex:     999,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize:   '0.8rem',
            color:      '#ff2d9e'
        });
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    }

    // ─── 图片加载 ────────────────────────────────────────────────
    function loadSingleImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                singleWidth  = img.width;
                singleHeight = img.height;
                singleLoaded = true;

                const maxW = 400;
                let pw = singleWidth, ph = singleHeight;
                if (pw > maxW) { ph = (maxW / pw) * ph; pw = maxW; }
                singlePreviewCanvas.width  = pw;
                singlePreviewCanvas.height = ph;
                singlePreviewCanvas.getContext('2d').drawImage(img, 0, 0, pw, ph);

                const tmp = document.createElement('canvas');
                tmp.width = singleWidth; tmp.height = singleHeight;
                const ctx = tmp.getContext('2d');
                ctx.drawImage(img, 0, 0);
                singleImgData = ctx.getImageData(0, 0, singleWidth, singleHeight);

                document.getElementById('singleFileInfo').innerHTML =
                    `✅ ${file.name} | ${singleWidth}×${singleHeight}`;
                updateSingleLimits();
                setSingleN(singleWidth);
                setSingleM(singleHeight);
                origStatusSpan.innerText  = 'SINGLE IMAGE READY';
                imgDimensionsSpan.innerText = `${singleWidth}×${singleHeight}`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function loadMixImage(file, isFirst) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxW = 180;
                if (isFirst) {
                    mixWidth1 = img.width; mixHeight1 = img.height; mixLoaded1 = true;
                    let pw = mixWidth1, ph = mixHeight1;
                    if (pw > maxW) { ph = (maxW / pw) * ph; pw = maxW; }
                    mixPreviewCanvas1.width  = pw;
                    mixPreviewCanvas1.height = ph;
                    mixPreviewCanvas1.getContext('2d').drawImage(img, 0, 0, pw, ph);
                    const tmp = document.createElement('canvas');
                    tmp.width = mixWidth1; tmp.height = mixHeight1;
                    const ctx = tmp.getContext('2d'); ctx.drawImage(img, 0, 0);
                    mixImg1Data = ctx.getImageData(0, 0, mixWidth1, mixHeight1);
                    document.getElementById('mixFileInfo1').innerHTML =
                        `✅ ${file.name} | ${mixWidth1}×${mixHeight1}`;
                } else {
                    mixWidth2 = img.width; mixHeight2 = img.height; mixLoaded2 = true;
                    let pw = mixWidth2, ph = mixHeight2;
                    if (pw > maxW) { ph = (maxW / pw) * ph; pw = maxW; }
                    mixPreviewCanvas2.width  = pw;
                    mixPreviewCanvas2.height = ph;
                    mixPreviewCanvas2.getContext('2d').drawImage(img, 0, 0, pw, ph);
                    const tmp = document.createElement('canvas');
                    tmp.width = mixWidth2; tmp.height = mixHeight2;
                    const ctx = tmp.getContext('2d'); ctx.drawImage(img, 0, 0);
                    mixImg2Data = ctx.getImageData(0, 0, mixWidth2, mixHeight2);
                    document.getElementById('mixFileInfo2').innerHTML =
                        `✅ ${file.name} | ${mixWidth2}×${mixHeight2}`;
                }
                updateMixLimits();
                if (mixLoaded1 && mixLoaded2) {
                    setMixN(Math.min(mixWidth1, mixWidth2));
                    setMixM(Math.min(mixHeight1, mixHeight2));
                } else if (isFirst) {
                    setMixN(mixWidth1);
                    setMixM(mixHeight1);
                } else {
                    setMixN(mixWidth2);
                    setMixM(mixHeight2);
                }
                if (mixLoaded1 && mixLoaded2) {
                    origStatusSpan.innerText    = 'BOTH IMAGES READY';
                    imgDimensionsSpan.innerText = `${mixWidth1}×${mixHeight1} + ${mixWidth2}×${mixHeight2}`;
                } else if (mixLoaded1) {
                    origStatusSpan.innerText    = 'IMAGE 1 READY';
                    imgDimensionsSpan.innerText = `${mixWidth1}×${mixHeight1}`;
                } else if (mixLoaded2) {
                    origStatusSpan.innerText    = 'IMAGE 2 READY';
                    imgDimensionsSpan.innerText = `${mixWidth2}×${mixHeight2}`;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ─── 单图模式 UI ─────────────────────────────────────────────
    function updateSingleLimits() {
        const maxN = singleLoaded ? singleWidth  : 2000;
        const maxM = singleLoaded ? singleHeight : 2000;
        document.getElementById('singleNMax').innerText = maxN;
        document.getElementById('singleMMax').innerText = maxM;
        const nSlider = document.getElementById('singleNSlider');
        const mSlider = document.getElementById('singleMSlider');
        nSlider.max = maxN; mSlider.max = maxM;
        document.getElementById('singleNInput').max = maxN;
        document.getElementById('singleMInput').max = maxM;
        if (singleN > maxN) setSingleN(maxN);
        if (singleM > maxM) setSingleM(maxM);
    }

    function setSingleN(val) {
        const max = singleLoaded ? singleWidth : 2000;
        const v = Math.min(max, Math.max(4, parseInt(val)));
        singleN = v;
        document.getElementById('singleNSlider').value    = v;
        document.getElementById('singleNInput').value     = v;
        document.getElementById('singleNValue').innerText = v;
        document.getElementById('singleTotalBlocks').innerText = singleN * singleM;
    }

    function setSingleM(val) {
        const max = singleLoaded ? singleHeight : 2000;
        const v = Math.min(max, Math.max(4, parseInt(val)));
        singleM = v;
        document.getElementById('singleMSlider').value    = v;
        document.getElementById('singleMInput').value     = v;
        document.getElementById('singleMValue').innerText = v;
        document.getElementById('singleTotalBlocks').innerText = singleN * singleM;
    }

    function generateSinglePixelArt() {
        if (!singleLoaded) { showToast('Please upload an image first'); return; }
        pixelStatusSpan.innerText = '⚡ RENDERING...';
        const pixelData = PixelEngine.generatePixelDataFromImage(
            singleImgData, singleWidth, singleHeight, singleN, singleM);
        pixelCanvas.width  = pixelData.width;
        pixelCanvas.height = pixelData.height;
        pixelCtx.putImageData(pixelData, 0, 0);
        currentPixelData = pixelCtx.getImageData(0, 0, pixelData.width, pixelData.height);
        pixelStatusSpan.innerText = `Single Pixel Art (${singleN}x${singleM})`;
        hueSlider.value = 0; hueValue.innerText = '0°';
    }

    function setSingleAvgD(val) {
        const v = Math.min(20, Math.max(0, parseInt(val) || 0));
        singleAvgD = v;
        document.getElementById('singleAvgDSlider').value    = v;
        document.getElementById('singleAvgDInput').value     = v;
        document.getElementById('singleAvgDValue').innerText = v;
    }

    function applyPixelAverage() {
        if (!currentPixelData) { showToast('No pixel art generated yet'); return; }
        const averaged = PixelEngine.pixelAverageData(currentPixelData, singleAvgD);
        pixelCtx.putImageData(averaged, 0, 0);
        currentPixelData = pixelCtx.getImageData(0, 0, averaged.width, averaged.height);
        pixelStatusSpan.innerText = `PIXEL AVERAGE d=${singleAvgD} (${singleN}x${singleM})`;
        hueSlider.value = 0; hueValue.innerText = '0°';
    }

    // ─── 双图模式 UI ─────────────────────────────────────────────
    function updateMixLimits() {
        let maxN = 2000, maxM = 2000;
        if (mixLoaded1 && mixLoaded2) {
            maxN = Math.min(mixWidth1, mixWidth2);
            maxM = Math.min(mixHeight1, mixHeight2);
        } else if (mixLoaded1) { maxN = mixWidth1;  maxM = mixHeight1; }
        else if (mixLoaded2)   { maxN = mixWidth2;  maxM = mixHeight2; }

        document.getElementById('mixNMax').innerText = maxN;
        document.getElementById('mixMMax').innerText = maxM;
        const nSlider = document.getElementById('mixNSlider');
        const mSlider = document.getElementById('mixMSlider');
        nSlider.max = maxN; mSlider.max = maxM;
        document.getElementById('mixNInput').max = maxN;
        document.getElementById('mixMInput').max = maxM;
        if (mixN > maxN) setMixN(maxN);
        if (mixM > maxM) setMixM(maxM);
    }

    function setMixN(val) {
        const max = (mixLoaded1 && mixLoaded2) ? Math.min(mixWidth1, mixWidth2)
                  : (mixLoaded1 ? mixWidth1 : (mixLoaded2 ? mixWidth2 : 2000));
        const v = Math.min(max, Math.max(4, parseInt(val)));
        mixN = v;
        document.getElementById('mixNSlider').value    = v;
        document.getElementById('mixNInput').value     = v;
        document.getElementById('mixNValue').innerText = v;
        document.getElementById('mixTotalBlocks').innerText = mixN * mixM;
    }

    function setMixM(val) {
        const max = (mixLoaded1 && mixLoaded2) ? Math.min(mixHeight1, mixHeight2)
                  : (mixLoaded1 ? mixHeight1 : (mixLoaded2 ? mixHeight2 : 2000));
        const v = Math.min(max, Math.max(4, parseInt(val)));
        mixM = v;
        document.getElementById('mixMSlider').value    = v;
        document.getElementById('mixMInput').value     = v;
        document.getElementById('mixMValue').innerText = v;
        document.getElementById('mixTotalBlocks').innerText = mixN * mixM;
    }

    function generateMixedPixelArt() {
        if (!mixLoaded1 || !mixLoaded2) { showToast('Please upload both images'); return; }
        pixelStatusSpan.innerText = '⚡ MIXING...';
        const pd1 = PixelEngine.generatePixelDataFromImage(mixImg1Data, mixWidth1, mixHeight1, mixN, mixM);
        const pd2 = PixelEngine.generatePixelDataFromImage(mixImg2Data, mixWidth2, mixHeight2, mixN, mixM);

        let mixed;
        if (mixMode === 'func') {
            try {
                if (funcSubMode === 'channel') {
                    mixed = PixelEngine.funcMixPixelDataChannels(
                        pd1, pd2, mixFuncR, mixFuncG, mixFuncB, mixFuncA);
                    pixelStatusSpan.innerText =
                        `CHANNEL MIX R=${mixFuncR} G=${mixFuncG} B=${mixFuncB} A=${mixFuncA} (${mixN}x${mixM})`;
                } else {
                    mixed = PixelEngine.funcMixPixelData(pd1, pd2, mixFuncStr);
                    pixelStatusSpan.innerText = `FUNC MIX: f(a,b)=${mixFuncStr} (${mixN}x${mixM})`;
                }
            } catch (e) {
                showToast(e.message);
                pixelStatusSpan.innerText = 'FUNC ERROR';
                return;
            }
        } else {
            mixed = PixelEngine.mixPixelData(pd1, pd2, mixMode);
            pixelStatusSpan.innerText = `Mixed Mode: ${mixMode.toUpperCase()} (${mixN}x${mixM})`;
        }

        pixelCanvas.width  = mixed.width;
        pixelCanvas.height = mixed.height;
        pixelCtx.putImageData(mixed, 0, 0);
        currentPixelData = pixelCtx.getImageData(0, 0, mixed.width, mixed.height);
        hueSlider.value = 0; hueValue.innerText = '0°';
    }

    // ─── 模式切换 ────────────────────────────────────────────────
    function switchToSingle() {
        currentMode = 'single';
        singleModeBtn.classList.add('active');
        mixModeBtn.classList.remove('active');
        singlePanel.classList.add('active');
        mixPanel.classList.remove('active');
        singlePreviewCanvas.style.display = 'block';
        mixPreviewContainer.style.display = 'none';
        origStatusSpan.innerText = singleLoaded ? 'SINGLE IMAGE READY' : 'NO DATA';
        imgDimensionsSpan.innerText = singleLoaded ? `${singleWidth}×${singleHeight}` : '—';
        currentPixelData = null;
        pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
        pixelStatusSpan.innerText = 'SINGLE MODE';
    }

    function switchToMix() {
        currentMode = 'mix';
        mixModeBtn.classList.add('active');
        singleModeBtn.classList.remove('active');
        mixPanel.classList.add('active');
        singlePanel.classList.remove('active');
        singlePreviewCanvas.style.display = 'none';
        mixPreviewContainer.style.display = 'flex';
        if (mixLoaded1 || mixLoaded2) {
            origStatusSpan.innerText = mixLoaded1 && mixLoaded2
                ? 'BOTH IMAGES READY' : (mixLoaded1 ? 'IMAGE 1 READY' : 'IMAGE 2 READY');
            imgDimensionsSpan.innerText = mixLoaded1 && mixLoaded2
                ? `${mixWidth1}×${mixHeight1} + ${mixWidth2}×${mixHeight2}` : '—';
        } else {
            origStatusSpan.innerText    = 'NO DATA';
            imgDimensionsSpan.innerText = '—';
        }
        currentPixelData = null;
        pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
        pixelStatusSpan.innerText = 'MIX MODE';
    }

    // ─── 滤镜 ────────────────────────────────────────────────────
    function applyGrayscale() {
        if (!currentPixelData) { showToast('No pixel data available'); return; }
        const { width: w, height: h } = currentPixelData;
        const newData = pixelCtx.createImageData(w, h);
        const src = currentPixelData.data, dst = newData.data;
        for (let i = 0; i < src.length; i += 4) {
            const gray = Math.floor(0.299 * src[i] + 0.587 * src[i+1] + 0.114 * src[i+2]);
            dst[i] = dst[i+1] = dst[i+2] = gray;
            dst[i+3] = 255;
        }
        pixelCtx.putImageData(newData, 0, 0);
        pixelStatusSpan.innerText = 'FILTER: GRAYSCALE';
    }

    function applyInvert() {
        if (!currentPixelData) { showToast('No pixel data available'); return; }
        const { width: w, height: h } = currentPixelData;
        const newData = pixelCtx.createImageData(w, h);
        const src = currentPixelData.data, dst = newData.data;
        for (let i = 0; i < src.length; i += 4) {
            dst[i] = 255 - src[i]; dst[i+1] = 255 - src[i+1];
            dst[i+2] = 255 - src[i+2]; dst[i+3] = 255;
        }
        pixelCtx.putImageData(newData, 0, 0);
        pixelStatusSpan.innerText = 'FILTER: INVERT';
    }

    function resetToOriginal() {
        if (!currentPixelData) { showToast('No original data'); return; }
        pixelCtx.putImageData(currentPixelData, 0, 0);
        hueSlider.value = 0; hueValue.innerText = '0°';
        pixelStatusSpan.innerText = 'RESET TO ORIGINAL';
    }

    let hueTimeout = null;
    function onHueChange(value) {
        if (!currentPixelData) return;
        hueValue.innerText = value + '°';
        if (hueTimeout) clearTimeout(hueTimeout);
        hueTimeout = setTimeout(() => {
            const { width: w, height: h } = currentPixelData;
            const newData = pixelCtx.createImageData(w, h);
            const src = currentPixelData.data, dst = newData.data;
            const shift = value / 360.0;
            for (let i = 0; i < src.length; i += 4) {
                let [hh, s, v] = ColorUtils.rgbToHsv(src[i], src[i+1], src[i+2]);
                hh = (hh + shift) % 1.0;
                const [nr, ng, nb] = ColorUtils.hsvToRgb(hh, s, v);
                dst[i] = nr; dst[i+1] = ng; dst[i+2] = nb; dst[i+3] = 255;
            }
            pixelCtx.putImageData(newData, 0, 0);
            pixelStatusSpan.innerText = `HUE SHIFT ${value}°`;
        }, 10);
    }

    function applyDuoToneMix() {
        if (!currentPixelData) { showToast('No pixel art generated yet. Please generate pixel art first.'); return; }
        const { width: w, height: h } = currentPixelData;
        const blockSize = PixelEngine.BLOCK_RENDER_SIZE;
        const n = w / blockSize, m = h / blockSize;
        const newData = pixelCtx.createImageData(w, h);
        const src = currentPixelData.data, dst = newData.data;
        for (let i = 0; i < src.length; i++) dst[i] = src[i];
        for (let by = 0; by < m; by++) {
            for (let bx = 0; bx < n; bx++) {
                if ((bx + by) % 2 === 0) {
                    const sx = bx * blockSize, sy = by * blockSize;
                    for (let dy = 0; dy < blockSize; dy++) {
                        for (let dx = 0; dx < blockSize; dx++) {
                            const idx = ((sy + dy) * w + (sx + dx)) * 4;
                            dst[idx]   = 255 - dst[idx];
                            dst[idx+1] = 255 - dst[idx+1];
                            dst[idx+2] = 255 - dst[idx+2];
                        }
                    }
                }
            }
        }
        pixelCtx.putImageData(newData, 0, 0);
        currentPixelData = pixelCtx.getImageData(0, 0, w, h);
        pixelStatusSpan.innerText = `DUO TONE MIX (Checkerboard) | ${singleN}x${singleM}`;
        hueSlider.value = 0; hueValue.innerText = '0°';
    }

    // ─── 事件绑定 ────────────────────────────────────────────────
    function _setupDropZone(dropEl, fileInput, onFile) {
        dropEl.addEventListener('click', () => fileInput.click());
        dropEl.addEventListener('dragover',  e => { e.preventDefault(); dropEl.classList.add('active'); });
        dropEl.addEventListener('dragleave', ()  => dropEl.classList.remove('active'));
        dropEl.addEventListener('drop', e => {
            e.preventDefault(); dropEl.classList.remove('active');
            if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', e => { if (e.target.files.length) onFile(e.target.files[0]); });
    }

    function bindEvents() {
        singleModeBtn.addEventListener('click', switchToSingle);
        mixModeBtn.addEventListener('click', switchToMix);

        // 单图控件
        document.getElementById('singleNSlider').addEventListener('input',  e => setSingleN(e.target.value));
        document.getElementById('singleNInput').addEventListener('change',  e => setSingleN(e.target.value));
        document.getElementById('singleMSlider').addEventListener('input',  e => setSingleM(e.target.value));
        document.getElementById('singleMInput').addEventListener('change',  e => setSingleM(e.target.value));
        document.getElementById('singleGenerateBtn').addEventListener('click', generateSinglePixelArt);
        document.getElementById('singleDuoToneBtn').addEventListener('click',  applyDuoToneMix);
        document.getElementById('singleAvgDSlider').addEventListener('input',  e => setSingleAvgD(e.target.value));
        document.getElementById('singleAvgDInput').addEventListener('change',  e => setSingleAvgD(e.target.value));
        document.getElementById('singleAvgBtn').addEventListener('click', applyPixelAverage);

        // 单图上传区
        _setupDropZone(
            document.getElementById('singleDropZone'),
            document.getElementById('singleFileInput'),
            loadSingleImage
        );

        // 双图上传区
        _setupDropZone(
            document.getElementById('mixDropZone1'),
            document.getElementById('mixFileInput1'),
            f => loadMixImage(f, true)
        );
        _setupDropZone(
            document.getElementById('mixDropZone2'),
            document.getElementById('mixFileInput2'),
            f => loadMixImage(f, false)
        );

        // 双图控件
        document.getElementById('mixNSlider').addEventListener('input',  e => setMixN(e.target.value));
        document.getElementById('mixNInput').addEventListener('change',  e => setMixN(e.target.value));
        document.getElementById('mixMSlider').addEventListener('input',  e => setMixM(e.target.value));
        document.getElementById('mixMInput').addEventListener('change',  e => setMixM(e.target.value));
        document.getElementById('mixGenerateBtn').addEventListener('click', generateMixedPixelArt);

        const funcMixInputArea = document.getElementById('funcMixInputArea');
        const funcUnifiedArea  = document.getElementById('funcUnifiedArea');
        const funcChannelArea  = document.getElementById('funcChannelArea');
        const funcMixInput     = document.getElementById('funcMixInput');
        const funcMixRInput    = document.getElementById('funcMixR');
        const funcMixGInput    = document.getElementById('funcMixG');
        const funcMixBInput    = document.getElementById('funcMixB');
        const funcMixAInput    = document.getElementById('funcMixA');

        // 主模式切换（row / col / checker / func）
        document.querySelectorAll('#mixOptions .mix-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#mixOptions .mix-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                mixMode = opt.dataset.mode;
                funcMixInputArea.style.display = (mixMode === 'func') ? 'block' : 'none';
            });
        });

        // func 子模式切换（unified / channel）
        document.querySelectorAll('#funcSubModeOptions .mix-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#funcSubModeOptions .mix-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                funcSubMode = opt.dataset.submode;
                funcUnifiedArea.style.display = (funcSubMode === 'unified') ? 'block' : 'none';
                funcChannelArea.style.display = (funcSubMode === 'channel') ? 'block' : 'none';
            });
        });

        // Unified 输入
        funcMixInput.addEventListener('input',  e => { mixFuncStr = e.target.value.trim() || 'a + b'; });
        funcMixInput.addEventListener('change', e => { mixFuncStr = e.target.value.trim() || 'a + b'; });

        // Per-channel 输入（空时退回通道直传）
        funcMixRInput.addEventListener('input',  e => { mixFuncR = e.target.value.trim() || 'a'; });
        funcMixRInput.addEventListener('change', e => { mixFuncR = e.target.value.trim() || 'a'; });
        funcMixGInput.addEventListener('input',  e => { mixFuncG = e.target.value.trim() || 'a'; });
        funcMixGInput.addEventListener('change', e => { mixFuncG = e.target.value.trim() || 'a'; });
        funcMixBInput.addEventListener('input',  e => { mixFuncB = e.target.value.trim() || 'a'; });
        funcMixBInput.addEventListener('change', e => { mixFuncB = e.target.value.trim() || 'a'; });
        funcMixAInput.addEventListener('input',  e => { mixFuncA = e.target.value.trim() || '255'; });
        funcMixAInput.addEventListener('change', e => { mixFuncA = e.target.value.trim() || '255'; });

        // 滤镜
        grayscaleBtn.addEventListener('click',  applyGrayscale);
        invertBtn.addEventListener('click',     applyInvert);
        resetFilterBtn.addEventListener('click', resetToOriginal);
        hueSlider.addEventListener('input', e => onHueChange(parseInt(e.target.value)));

        // 保存 / 重新生成
        saveBtn.addEventListener('click', () => {
            if (pixelCanvas.width === 0) { showToast('No pixel art to save'); return; }
            const link = document.createElement('a');
            link.download = `pixelart_${currentMode}_${Date.now()}.png`;
            link.href = pixelCanvas.toDataURL('image/png');
            link.click();
            pixelStatusSpan.innerText = 'EXPORTED';
        });
        resetPixelBtn.addEventListener('click', () => {
            if (currentMode === 'single' && singleLoaded)              generateSinglePixelArt();
            else if (currentMode === 'mix' && mixLoaded1 && mixLoaded2) generateMixedPixelArt();
            else showToast('Please load images first');
        });
    }

    // ─── 初始化入口 ──────────────────────────────────────────────
    function init() {
        // 背景动画
        CyberBackground.init(document.getElementById('bg-canvas'));
        CyberBackground.start();

        // UI 初始状态
        singlePanel.classList.add('active');
        mixPanel.classList.remove('active');
        singlePreviewCanvas.style.display = 'block';
        mixPreviewContainer.style.display = 'none';

        bindEvents();
        setSingleN(32); setSingleM(32);
        setMixN(32);    setMixM(32);
        updateSingleLimits();
        updateMixLimits();
    }

    init();
})();
