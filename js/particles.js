/**
 * WhoClean — 粒子星際動態背景
 * 產生漂浮、游動的光點，隨滑鼠互動產生漣漪
 */
(function() {
    // 手機上不執行粒子動畫以節省效能
    if (window.innerWidth <= 480) return;
    
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouseX = -1000;
    let mouseY = -1000;
    let animationId = null;

    const CONFIG = {
        count: 80,
        speed: 0.3,
        connectionDist: 120,
        sizeMin: 1,
        sizeMax: 3,
        color: '124, 140, 248',
        mouseRadius: 150,
    };

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * (CONFIG.sizeMax - CONFIG.sizeMin) + CONFIG.sizeMin;
            this.speedX = (Math.random() - 0.5) * CONFIG.speed;
            this.speedY = (Math.random() - 0.5) * CONFIG.speed;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.pulse = Math.random() * Math.PI * 2;
            this.pulseSpeed = 0.02 + Math.random() * 0.03;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.pulse += this.pulseSpeed;
            
            // 邊界反彈
            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;

            // 滑鼠互動: 靠近則推開
            const dx = this.x - mouseX;
            const dy = this.y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONFIG.mouseRadius) {
                const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius * 0.5;
                this.x += (dx / dist) * force;
                this.y += (dy / dist) * force;
            }
        }
        draw() {
            const pulseOpacity = this.opacity + Math.sin(this.pulse) * 0.15;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${CONFIG.color}, ${Math.max(0, Math.min(1, pulseOpacity))})`;
            ctx.fill();
            
            // 發光效果
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${CONFIG.color}, ${Math.max(0, pulseOpacity * 0.15)})`;
            ctx.fill();
        }
    }

    function init() {
        resize();
        particles = [];
        for (let i = 0; i < CONFIG.count; i++) {
            particles.push(new Particle());
        }
    }

    function connectParticles() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONFIG.connectionDist) {
                    const opacity = (1 - dist / CONFIG.connectionDist) * 0.2;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(${CONFIG.color}, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        
        connectParticles();
        animationId = requestAnimationFrame(animate);
    }

    // 滑鼠追蹤
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // 觸控支援
    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (touch) {
            mouseX = touch.clientX;
            mouseY = touch.clientY;
        }
    });

    document.addEventListener('touchend', () => {
        mouseX = -1000;
        mouseY = -1000;
    });

    window.addEventListener('resize', () => {
        resize();
    });

    // 頁面可見性變化時暫停/恢復
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (animationId) cancelAnimationFrame(animationId);
        } else {
            animate();
        }
    });

    init();
    animate();
})();
