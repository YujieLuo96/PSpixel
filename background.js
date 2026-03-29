/**
 * CyberBackground — 赛博风格背景动画（网格 + 数字雨）
 *
 * 接口：
 *   window.CyberBackground.init(canvas)  绑定 canvas 元素并初始化雨滴
 *   window.CyberBackground.start()       启动 rAF 动画循环
 */
(function () {
    let bgCanvas = null;
    let bgCtx    = null;
    let rainDrops = [];

    function init(canvas) {
        bgCanvas = canvas;
        bgCtx    = canvas.getContext('2d');
        _reset();
        window.addEventListener('resize', _reset);
    }

    function _reset() {
        bgCanvas.width  = window.innerWidth;
        bgCanvas.height = window.innerHeight;
        rainDrops = [];
        const dropCount = Math.floor(bgCanvas.width / 35) + 15;
        for (let i = 0; i < dropCount; i++) {
            rainDrops.push({
                x:      Math.random() * bgCanvas.width,
                y:      Math.random() * bgCanvas.height,
                speed:  1 + Math.random() * 3,
                length: 15 + Math.random() * 40,
                alpha:  0.08 + Math.random() * 0.12
            });
        }
    }

    function _draw() {
        if (!bgCtx) return;
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.fillStyle = '#010001';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        // 网格线
        const step = 40;
        bgCtx.lineWidth = 0.4;
        bgCtx.strokeStyle = 'rgba(0, 242, 255, 0.06)';
        for (let x = 0; x < bgCanvas.width; x += step) {
            bgCtx.beginPath();
            bgCtx.moveTo(x, 0);
            bgCtx.lineTo(x, bgCanvas.height);
            bgCtx.stroke();
        }
        for (let y = 0; y < bgCanvas.height; y += step) {
            bgCtx.beginPath();
            bgCtx.moveTo(0, y);
            bgCtx.lineTo(bgCanvas.width, y);
            bgCtx.stroke();
        }

        // 数字雨滴
        rainDrops.forEach(d => {
            d.y += d.speed;
            if (d.y - d.length > bgCanvas.height) {
                d.y = -d.length;
                d.x = Math.random() * bgCanvas.width;
            }
            const grad = bgCtx.createLinearGradient(d.x, d.y - d.length, d.x, d.y);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0, 242, 255, ${d.alpha})`);
            bgCtx.strokeStyle = grad;
            bgCtx.lineWidth = 1.2;
            bgCtx.beginPath();
            bgCtx.moveTo(d.x, d.y - d.length);
            bgCtx.lineTo(d.x, d.y);
            bgCtx.stroke();
        });

        // 故障光条
        const t = Date.now() / 1800;
        const glitchX = bgCanvas.width * 0.3 + Math.sin(t) * 15;
        bgCtx.fillStyle = 'rgba(255, 45, 158, 0.02)';
        bgCtx.fillRect(glitchX, 0, 8, bgCanvas.height);
        bgCtx.fillStyle = 'rgba(0, 242, 255, 0.02)';
        bgCtx.fillRect(glitchX - 40, bgCanvas.height * 0.6, 25, bgCanvas.height * 0.2);

        requestAnimationFrame(_draw);
    }

    function start() {
        _draw();
    }

    window.CyberBackground = { init, start };
})();
