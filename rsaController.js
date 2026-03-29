/**
 * rsaController.js — RSA 像素加密模块 UI 控制器
 *
 * 依赖：RSAModule (rsaModule.js) 必须先加载。
 * 与 app.js 完全独立：不修改任何 app.js 内部变量，
 * 仅通过 DOM id 与主页面交互。
 */
(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // 一、应用状态
    // ════════════════════════════════════════════════════════════════

    let subMode    = 'encrypt';  // 'encrypt' | 'decrypt'
    let rsaMode    = 'single';   // 'single'  | 'multi'
    let layerCount = 1;
    /** @type {Array<{valid,p,q,n,phi,e,d,error}|null>} */
    let layerParams = [null];

    let origImgData       = null;   // ImageData（原图，用于加密）
    let origW             = 0;
    let origH             = 0;
    let encResultCanvas   = null;   // 加密结果 canvas
    let uploadedEncCanvas = null;   // 上传的加密图 canvas（用于解密）
    let decImgData        = null;   // 解密结果 ImageData
    let decLayers         = null;   // [{n,d}]（来自密钥文件）
    let busy              = false;  // 防止重复点击

    // ════════════════════════════════════════════════════════════════
    // 二、DOM 引用
    // ════════════════════════════════════════════════════════════════

    // 主模式按钮
    const rsaModeBtn    = document.getElementById('rsaModeBtn');
    const singleModeBtn = document.getElementById('singleModeBtn');
    const mixModeBtn    = document.getElementById('mixModeBtn');

    // 面板
    const rsaPanel         = document.getElementById('rsaPanel');
    const singlePanel      = document.getElementById('singlePanel');
    const mixPanel         = document.getElementById('mixPanel');
    const sharedFilterCard = document.getElementById('sharedFilterCard');
    const sharedExportCard = document.getElementById('sharedExportCard');

    // 右侧预览卡片
    const mainPreviewCard = document.getElementById('mainPreviewCard');
    const mainResultCard  = document.getElementById('mainResultCard');
    const rsaPreviewCard  = document.getElementById('rsaPreviewCard');
    const rsaResultCard   = document.getElementById('rsaResultCard');

    // 子模式切换
    const rsaEncryptModeBtn = document.getElementById('rsaEncryptModeBtn');
    const rsaDecryptModeBtn = document.getElementById('rsaDecryptModeBtn');
    const rsaEncSubPanel    = document.getElementById('rsaEncSubPanel');
    const rsaDecSubPanel    = document.getElementById('rsaDecSubPanel');

    // RSA 模式（single / multi）
    const rsaSingleRSABtn    = document.getElementById('rsaSingleRSABtn');
    const rsaMultiRSABtn     = document.getElementById('rsaMultiRSABtn');
    const rsaLayerCountRow   = document.getElementById('rsaLayerCountRow');
    const rsaLayerCountInput = document.getElementById('rsaLayerCountInput');
    const rsaLayersContainer = document.getElementById('rsaLayersContainer');
    const rsaAutoAllBtn      = document.getElementById('rsaAutoAllBtn');

    // 图片上传区
    const rsaDropZone  = document.getElementById('rsaDropZone');
    const rsaFileInput = document.getElementById('rsaFileInput');
    const rsaFileInfo  = document.getElementById('rsaFileInfo');
    const rsaUploadLabel = document.getElementById('rsaUploadLabel');
    const rsaDropText    = document.getElementById('rsaDropText');

    // 密钥文件上传区
    const rsaKeyDropZone  = document.getElementById('rsaKeyDropZone');
    const rsaKeyFileInput = document.getElementById('rsaKeyFileInput');
    const rsaKeyFileInfo  = document.getElementById('rsaKeyFileInfo');
    const rsaKeyInfoBox   = document.getElementById('rsaKeyInfoBox');

    // 进度条
    const rsaProgressWrap = document.getElementById('rsaProgressWrap');
    const rsaProgressFill = document.getElementById('rsaProgressFill');
    const rsaProgressPct  = document.getElementById('rsaProgressPct');
    const rsaProgressMsg  = document.getElementById('rsaProgressMsg');

    // 操作按钮
    const rsaEncryptAction = document.getElementById('rsaEncryptAction');
    const rsaDecryptAction = document.getElementById('rsaDecryptAction');

    // 导出按钮
    const rsaSaveEncBtn = document.getElementById('rsaSaveEncBtn');
    const rsaSaveKeyBtn = document.getElementById('rsaSaveKeyBtn');
    const rsaSaveDecBtn = document.getElementById('rsaSaveDecBtn');

    // 右侧预览 canvas
    const rsaPreviewCanvas = document.getElementById('rsaPreviewCanvas');
    const rsaResultCanvas  = document.getElementById('rsaResultCanvas');
    const rsaPreviewStatus = document.getElementById('rsaPreviewStatus');
    const rsaResultStatus  = document.getElementById('rsaResultStatus');
    const rsaPreviewTitle  = document.getElementById('rsaPreviewTitle');
    const rsaResultTitle   = document.getElementById('rsaResultTitle');

    // ════════════════════════════════════════════════════════════════
    // 三、工具函数
    // ════════════════════════════════════════════════════════════════

    function toast(msg) {
        const el = document.createElement('div');
        el.innerText = msg;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', left: '20px',
            backgroundColor: '#ff2d9e30', padding: '6px 14px',
            border: '1px solid var(--pink)', zIndex: 9999,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '0.8rem', color: '#ff2d9e'
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1800);
    }

    function setProgress(pct, msg) {
        rsaProgressWrap.style.display = '';
        rsaProgressFill.style.width   = pct + '%';
        rsaProgressPct.textContent    = pct + '%';
        if (msg !== undefined) rsaProgressMsg.textContent = msg;
    }

    /** 设置拖拽上传区 */
    function setupDropZone(zone, input, onFile) {
        zone.addEventListener('click',    ()  => input.click());
        zone.addEventListener('dragover', e   => { e.preventDefault(); zone.classList.add('active'); });
        zone.addEventListener('dragleave', ()  => zone.classList.remove('active'));
        zone.addEventListener('drop',     e   => {
            e.preventDefault(); zone.classList.remove('active');
            if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
        });
        input.addEventListener('change',  e   => { if (e.target.files.length) onFile(e.target.files[0]); });
    }

    /** 绘制 ImageData 到 canvas，缩放至 maxW 宽度以内 */
    function drawPreview(canvas, img, maxW) {
        let pw = img.width || img.naturalWidth, ph = img.height || img.naturalHeight;
        if (pw > maxW) { ph = Math.round((maxW / pw) * ph); pw = maxW; }
        canvas.width  = pw;
        canvas.height = ph;
        const ctx = canvas.getContext('2d');
        if (img instanceof ImageData) {
            // 先绘到临时 canvas 再缩放
            const tmp = document.createElement('canvas');
            tmp.width = img.width; tmp.height = img.height;
            tmp.getContext('2d').putImageData(img, 0, 0);
            ctx.drawImage(tmp, 0, 0, pw, ph);
        } else {
            ctx.drawImage(img, 0, 0, pw, ph);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 四、主模式切换
    // ════════════════════════════════════════════════════════════════

    function enterRSAMode() {
        // 隐藏原有左侧内容
        singlePanel.classList.remove('active');
        mixPanel.classList.remove('active');
        sharedFilterCard.style.display = 'none';
        sharedExportCard.style.display = 'none';
        // 显示 RSA 面板
        rsaPanel.classList.add('active');
        // 顶栏按钮状态
        singleModeBtn.classList.remove('active');
        mixModeBtn.classList.remove('active');
        rsaModeBtn.classList.add('active');
        // 右侧预览切换
        mainPreviewCard.style.display = 'none';
        mainResultCard.style.display  = 'none';
        rsaPreviewCard.style.display  = '';
        rsaResultCard.style.display   = '';
    }

    function leaveRSAMode() {
        rsaPanel.classList.remove('active');
        sharedFilterCard.style.display = '';
        sharedExportCard.style.display = '';
        mainPreviewCard.style.display  = '';
        mainResultCard.style.display   = '';
        rsaPreviewCard.style.display   = 'none';
        rsaResultCard.style.display    = 'none';
        rsaModeBtn.classList.remove('active');
    }

    // ════════════════════════════════════════════════════════════════
    // 五、子模式（ENCRYPT / DECRYPT）
    // ════════════════════════════════════════════════════════════════

    function setSubMode(mode) {
        subMode = mode;
        const isEnc = mode === 'encrypt';

        rsaEncryptModeBtn.classList.toggle('active', isEnc);
        rsaDecryptModeBtn.classList.toggle('active', !isEnc);
        rsaEncSubPanel.style.display    = isEnc ? '' : 'none';
        rsaDecSubPanel.style.display    = isEnc ? 'none' : '';
        rsaEncryptAction.style.display  = isEnc ? '' : 'none';
        rsaDecryptAction.style.display  = isEnc ? 'none' : '';

        rsaUploadLabel.textContent = isEnc ? '🎴 UPLOAD IMAGE' : '🎴 UPLOAD ENCRYPTED PNG';
        rsaDropText.textContent    = isEnc ? 'DRAG & DROP IMAGE' : 'DRAG & DROP ENCRYPTED PNG';
        rsaFileInput.accept        = isEnc
            ? 'image/jpeg,image/png,image/webp,image/bmp'
            : 'image/png';

        rsaPreviewTitle.textContent = isEnc ? '🎴 SOURCE IMAGE'      : '🔐 ENCRYPTED IMAGE';
        rsaResultTitle.textContent  = isEnc ? '🔐 ENCRYPTED RESULT'  : '🔓 DECRYPTED RESULT';

        // 重置状态显示
        rsaPreviewStatus.textContent      = 'NO DATA';
        rsaResultStatus.textContent       = 'AWAITING';
        rsaProgressWrap.style.display     = 'none';
        rsaSaveEncBtn.style.display       = 'none';
        rsaSaveKeyBtn.style.display       = 'none';
        rsaSaveDecBtn.style.display       = 'none';
    }

    // ════════════════════════════════════════════════════════════════
    // 六、RSA 模式（SINGLE / MULTI）
    // ════════════════════════════════════════════════════════════════

    function setRSAMode(mode) {
        rsaMode = mode;
        const isMulti = mode === 'multi';
        rsaSingleRSABtn.classList.toggle('active', !isMulti);
        rsaMultiRSABtn.classList.toggle('active',   isMulti);
        rsaLayerCountRow.style.display = isMulti ? '' : 'none';
        setLayerCount(isMulti ? (parseInt(rsaLayerCountInput.value) || 2) : 1);
    }

    function setLayerCount(n) {
        n = Math.max(1, Math.min(8, parseInt(n) || 1));
        layerCount = n;
        // 保留已有参数，截断或扩展数组
        while (layerParams.length < n) layerParams.push(null);
        layerParams.length = n;
        buildLayerUI(n);
    }

    // ════════════════════════════════════════════════════════════════
    // 七、参数层 UI 动态构建
    // ════════════════════════════════════════════════════════════════

    function buildLayerUI(count) {
        rsaLayersContainer.innerHTML = '';
        for (let idx = 0; idx < count; idx++) {
            const label  = count === 1 ? '🔐 RSA PARAMETERS' : `🔐 LAYER ${idx + 1}`;
            const p0     = layerParams[idx];
            const card   = document.createElement('div');
            card.className       = 'card rsa-layer-card';
            card.dataset.layerIdx = String(idx);
            card.innerHTML = `
                <div class="rsa-layer-header">
                    <div class="card-label" style="margin-bottom:0;">${label}</div>
                    <button class="neon-btn rsa-layer-auto">⚙ AUTO</button>
                </div>
                <div class="rsa-param-grid">
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Prime p</span>
                        <input type="number" class="rsa-param-input rsa-p"
                               min="2" max="9999" value="${p0 ? p0.p : ''}" placeholder="e.g. 17">
                        <button class="rsa-icon-btn rsa-rand-p" title="随机生成 p">🎲</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Prime q</span>
                        <input type="number" class="rsa-param-input rsa-q"
                               min="2" max="9999" value="${p0 ? p0.q : ''}" placeholder="e.g. 19">
                        <button class="rsa-icon-btn rsa-rand-q" title="随机生成 q">🎲</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">n = p×q</span>
                        <input type="text" class="rsa-param-input rsa-n" readonly
                               value="${p0 ? p0.n : ''}" placeholder="auto">
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">φ(n)</span>
                        <input type="text" class="rsa-param-input rsa-phi" readonly
                               value="${p0 ? p0.phi : ''}" placeholder="auto">
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Pubkey e</span>
                        <input type="number" class="rsa-param-input rsa-e"
                               min="2" value="${p0 ? p0.e : ''}" placeholder="e.g. 5">
                        <button class="rsa-icon-btn rsa-auto-e" title="自动推荐 e">⚡</button>
                    </div>
                    <div class="rsa-param-row">
                        <span class="rsa-param-label">Privkey d</span>
                        <input type="text" class="rsa-param-input rsa-privkey" readonly
                               value="${p0 ? p0.d : ''}" placeholder="auto">
                    </div>
                </div>
                <div class="rsa-param-status ${p0 ? (p0.valid ? 'valid' : 'invalid') : ''}">
                    ${p0 ? (p0.valid ? '✔ PARAMS VALID' : '✘ ' + (p0.error || '')) : ''}
                </div>`;
            rsaLayersContainer.appendChild(card);
            _bindLayerCard(card, idx);
        }
    }

    /** 为单个层卡片绑定所有交互事件 */
    function _bindLayerCard(card, idx) {
        const pInput  = card.querySelector('.rsa-p');
        const qInput  = card.querySelector('.rsa-q');
        const eInput  = card.querySelector('.rsa-e');
        const nDisp   = card.querySelector('.rsa-n');
        const phiDisp = card.querySelector('.rsa-phi');
        const dDisp   = card.querySelector('.rsa-privkey');
        const status  = card.querySelector('.rsa-param-status');

        // 输入变化时自动尝试构建参数
        function tryBuild() {
            const p = pInput.value, q = qInput.value, e = eInput.value;
            if (!p || !q || !e) {
                nDisp.value = phiDisp.value = dDisp.value = '';
                status.textContent = '';
                status.className   = 'rsa-param-status';
                layerParams[idx]   = null;
                return;
            }
            const res = RSAModule.buildParams(p, q, e);
            layerParams[idx] = res;
            if (res.valid) {
                nDisp.value        = res.n;
                phiDisp.value      = res.phi;
                dDisp.value        = res.d;
                status.textContent = '✔ PARAMS VALID';
                status.className   = 'rsa-param-status valid';
            } else {
                nDisp.value = phiDisp.value = dDisp.value = '';
                status.textContent = '✘ ' + res.error;
                status.className   = 'rsa-param-status invalid';
            }
        }

        pInput.addEventListener('input', tryBuild);
        qInput.addEventListener('input', tryBuild);
        eInput.addEventListener('input', tryBuild);

        // 随机生成 p
        card.querySelector('.rsa-rand-p').addEventListener('click', () => {
            const p = RSAModule.generateRandomPrime(17, 251);
            if (p) { pInput.value = p; tryBuild(); }
        });

        // 随机生成 q
        card.querySelector('.rsa-rand-q').addEventListener('click', () => {
            const q = RSAModule.generateRandomPrime(17, 251);
            if (q) { qInput.value = q; tryBuild(); }
        });

        // 在已有 p、q 基础上自动推荐最小合法 e
        card.querySelector('.rsa-auto-e').addEventListener('click', () => {
            const p = parseInt(pInput.value), q = parseInt(qInput.value);
            if (!RSAModule.isPrime(p) || !RSAModule.isPrime(q) || p === q) {
                toast('请先填写合法的 p 和 q');
                return;
            }
            const phi = (p - 1) * (q - 1);
            let e = 3;
            while (e < phi) {
                if (RSAModule.gcd(e, phi) === 1n) break;
                e += 2;
            }
            eInput.value = e;
            tryBuild();
        });

        // 一键自动生成该层全部参数
        card.querySelector('.rsa-layer-auto').addEventListener('click', () => {
            const res = RSAModule.autoGenerateParams();
            if (!res) { toast('自动生成失败，请重试'); return; }
            pInput.value       = res.p;
            qInput.value       = res.q;
            eInput.value       = res.e;
            nDisp.value        = res.n;
            phiDisp.value      = res.phi;
            dDisp.value        = res.d;
            layerParams[idx]   = res;
            status.textContent = '✔ PARAMS VALID';
            status.className   = 'rsa-param-status valid';
        });
    }

    // ════════════════════════════════════════════════════════════════
    // 八、图片 / 密钥文件加载
    // ════════════════════════════════════════════════════════════════

    function loadImageFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                if (subMode === 'encrypt') {
                    // 保存原始尺寸的 ImageData
                    origW = img.width; origH = img.height;
                    const tmp = document.createElement('canvas');
                    tmp.width = origW; tmp.height = origH;
                    tmp.getContext('2d').drawImage(img, 0, 0);
                    origImgData = tmp.getContext('2d').getImageData(0, 0, origW, origH);
                    drawPreview(rsaPreviewCanvas, img, 480);
                    rsaFileInfo.innerHTML        = `✅ ${file.name} | ${origW}×${origH}`;
                    rsaPreviewStatus.textContent = `${origW}×${origH}`;
                } else {
                    // 解密模式：保存加密图 canvas
                    const encCvs = document.createElement('canvas');
                    encCvs.width  = img.width;
                    encCvs.height = img.height;
                    encCvs.getContext('2d').drawImage(img, 0, 0);
                    uploadedEncCanvas = encCvs;
                    drawPreview(rsaPreviewCanvas, img, 480);
                    rsaFileInfo.innerHTML        = `✅ ${file.name} | ${img.width}×${img.height}`;
                    rsaPreviewStatus.textContent = `${img.width}×${img.height} (ENC)`;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function loadKeyFile(file) {
        RSAModule.parseKeyFile(file).then(res => {
            if (!res.valid) {
                rsaKeyFileInfo.textContent  = '✘ ' + res.error;
                rsaKeyFileInfo.style.color  = 'var(--pink)';
                decLayers                   = null;
                rsaKeyInfoBox.style.display = 'none';
                return;
            }
            decLayers = res.layers;
            rsaKeyFileInfo.innerHTML   = `✅ ${file.name} | mode: ${res.mode} | ${res.layers.length} layer(s)`;
            rsaKeyFileInfo.style.color = '';
            // 展示密钥内容（只读）
            let html = `<span class="kv-green">MODE:</span> ${res.mode}<br>`;
            res.layers.forEach((l, i) => {
                const tag = res.layers.length > 1 ? `LAYER ${i + 1}  ` : '';
                html += `<span class="kv">${tag}n:</span> ${l.n}&nbsp;&nbsp;`
                      + `<span class="kv-pink">d:</span> ${l.d}<br>`;
            });
            rsaKeyInfoBox.innerHTML     = html;
            rsaKeyInfoBox.style.display = '';
        });
    }

    // ════════════════════════════════════════════════════════════════
    // 九、加密 / 解密执行
    // ════════════════════════════════════════════════════════════════

    function doEncrypt() {
        if (busy) return;
        if (!origImgData) { toast('请先上传图片'); return; }
        for (let i = 0; i < layerCount; i++) {
            if (!layerParams[i] || !layerParams[i].valid) {
                toast(layerCount > 1 ? `第 ${i + 1} 层参数无效，请检查` : '参数无效，请检查');
                return;
            }
        }
        busy = true;
        rsaEncryptAction.disabled = true;
        rsaSaveEncBtn.style.display = rsaSaveKeyBtn.style.display = rsaSaveDecBtn.style.display = 'none';
        setProgress(0, 'ENCRYPTING...');
        rsaResultStatus.textContent = '⚡ ENCRYPTING...';

        const layers = layerParams.map(p => ({ n: p.n, e: p.e }));
        RSAModule.encrypt(origImgData, layers, pct => setProgress(pct, 'ENCRYPTING...'))
            .then(canvas => {
                encResultCanvas = canvas;
                drawPreview(rsaResultCanvas, canvas, 480);
                rsaResultStatus.textContent   = `ENCRYPTED | ${canvas.width}×${canvas.height}`;
                setProgress(100, 'DONE ✓');
                rsaSaveEncBtn.style.display   = '';
                rsaSaveKeyBtn.style.display   = '';
                busy = false;
                rsaEncryptAction.disabled = false;
            });
    }

    function doDecrypt() {
        if (busy) return;
        if (!uploadedEncCanvas) { toast('请先上传加密图像 (PNG)'); return; }
        if (!decLayers)          { toast('请先上传密钥文件 (.pspkey)'); return; }
        busy = true;
        rsaDecryptAction.disabled = true;
        rsaSaveEncBtn.style.display = rsaSaveKeyBtn.style.display = rsaSaveDecBtn.style.display = 'none';
        setProgress(0, 'DECRYPTING...');
        rsaResultStatus.textContent = '⚡ DECRYPTING...';

        RSAModule.decrypt(uploadedEncCanvas, decLayers, pct => setProgress(pct, 'DECRYPTING...'))
            .then(imgData => {
                if (!imgData) {
                    toast('解密失败：图像格式不正确或密钥不匹配');
                    rsaResultStatus.textContent = 'ERROR';
                    setProgress(0, 'ERROR');
                    busy = false;
                    rsaDecryptAction.disabled = false;
                    return;
                }
                decImgData = imgData;
                // 渲染结果
                rsaResultCanvas.width  = imgData.width;
                rsaResultCanvas.height = imgData.height;
                rsaResultCanvas.getContext('2d').putImageData(imgData, 0, 0);
                rsaResultStatus.textContent = `DECRYPTED | ${imgData.width}×${imgData.height}`;
                setProgress(100, 'DONE ✓');
                rsaSaveDecBtn.style.display = '';
                busy = false;
                rsaDecryptAction.disabled = false;
            });
    }

    // ════════════════════════════════════════════════════════════════
    // 十、导出
    // ════════════════════════════════════════════════════════════════

    function saveEncryptedPNG() {
        if (!encResultCanvas) { toast('尚无加密图像'); return; }
        const link = document.createElement('a');
        link.download = `encrypted_${Date.now()}.png`;
        link.href     = encResultCanvas.toDataURL('image/png');
        link.click();
    }

    function saveKeyFile() {
        const valid = layerParams.filter(p => p && p.valid);
        if (valid.length !== layerCount) { toast('参数尚未完整'); return; }
        RSAModule.exportKeyFile(rsaMode, valid.map(p => ({ n: p.n, d: p.d })));
    }

    function saveDecryptedPNG() {
        if (!decImgData) { toast('尚无解密图像'); return; }
        const tmp = document.createElement('canvas');
        tmp.width  = decImgData.width;
        tmp.height = decImgData.height;
        tmp.getContext('2d').putImageData(decImgData, 0, 0);
        const link = document.createElement('a');
        link.download = `decrypted_${Date.now()}.png`;
        link.href     = tmp.toDataURL('image/png');
        link.click();
    }

    // ════════════════════════════════════════════════════════════════
    // 十一、事件绑定
    // ════════════════════════════════════════════════════════════════

    function bindEvents() {
        // 主模式切换
        rsaModeBtn.addEventListener('click',    enterRSAMode);
        singleModeBtn.addEventListener('click', leaveRSAMode);
        mixModeBtn.addEventListener('click',    leaveRSAMode);

        // 子模式切换（ENCRYPT / DECRYPT）
        rsaEncryptModeBtn.addEventListener('click', () => setSubMode('encrypt'));
        rsaDecryptModeBtn.addEventListener('click', () => setSubMode('decrypt'));

        // RSA 模式切换（SINGLE / MULTI）
        rsaSingleRSABtn.addEventListener('click', () => setRSAMode('single'));
        rsaMultiRSABtn.addEventListener('click',  () => setRSAMode('multi'));

        // 层数变化
        rsaLayerCountInput.addEventListener('change', e => setLayerCount(e.target.value));

        // 一键全部自动生成
        rsaAutoAllBtn.addEventListener('click', () => {
            for (let i = 0; i < layerCount; i++) {
                const res = RSAModule.autoGenerateParams();
                if (!res) { toast('自动生成失败，请重试'); return; }
                layerParams[i] = res;
            }
            buildLayerUI(layerCount);
        });

        // 图片上传（加密 / 解密模式共用同一区域）
        setupDropZone(rsaDropZone, rsaFileInput, loadImageFile);

        // 密钥文件上传
        setupDropZone(rsaKeyDropZone, rsaKeyFileInput, loadKeyFile);

        // 加密 / 解密执行
        rsaEncryptAction.addEventListener('click', doEncrypt);
        rsaDecryptAction.addEventListener('click', doDecrypt);

        // 导出
        rsaSaveEncBtn.addEventListener('click', saveEncryptedPNG);
        rsaSaveKeyBtn.addEventListener('click', saveKeyFile);
        rsaSaveDecBtn.addEventListener('click', saveDecryptedPNG);
    }

    // ════════════════════════════════════════════════════════════════
    // 十二、初始化
    // ════════════════════════════════════════════════════════════════

    function init() {
        // 初始隐藏 RSA 右侧卡片
        rsaPreviewCard.style.display  = 'none';
        rsaResultCard.style.display   = 'none';
        // 初始隐藏进度条和导出按钮
        rsaProgressWrap.style.display = 'none';
        rsaSaveEncBtn.style.display   = 'none';
        rsaSaveKeyBtn.style.display   = 'none';
        rsaSaveDecBtn.style.display   = 'none';
        rsaKeyInfoBox.style.display   = 'none';

        buildLayerUI(1);
        bindEvents();
        setSubMode('encrypt');
        setRSAMode('single');
    }

    init();
})();
