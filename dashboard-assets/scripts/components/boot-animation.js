export class BootAnimation {
  constructor() {
    this.loader = document.createElement('div');
    this.loader.className = 'boot-loader';
    this.progress = 0;
    this.progressTimer = null;
    this.dotsTimer = null;
    this.frameId = null;
    this.onBootResize = null;
    this.statusSteps = [
      '初始化控制台界面',
      '装载运行时模块',
      '同步实时状态流',
      '准备监控与分析视图',
    ];
    this.init();
  }

  init() {
    this.loader.innerHTML = `
      <div class="boot-vignette"></div>
      <div class="boot-noise"></div>
      <canvas class="boot-particles"></canvas>
      <div class="boot-grid"></div>
      <div class="boot-orb"></div>
      <div class="boot-orb secondary"></div>
      <div class="boot-orb tertiary"></div>
      <div class="boot-shell">
        <div class="boot-header">
          <div class="boot-brand">
            <div class="boot-brand-glow"></div>
            <div class="boot-brand-icon">Q</div>
          </div>
          <div class="boot-copy">
            <div class="boot-kicker">QQTalker Console</div>
            <div class="boot-title">Control Surface</div>
            <div class="boot-subtitle">现代化控制台正在完成启动校准，准备实时监控、配置管理与分析视图。</div>
          </div>
        </div>
        <div class="boot-status-row">
          <div class="boot-status-text">
            <span id="bootStatusText">初始化控制台界面</span><span class="boot-dots"></span>
          </div>
          <div class="boot-progress-value" id="bootProgressValue">00%</div>
        </div>
        <div class="boot-progress">
          <div class="boot-progress-track">
            <div class="boot-progress-bar" id="bootProgressBar"></div>
          </div>
        </div>
        <div class="boot-footer">Loading workspace telemetry, page controllers and live event stream.</div>
      </div>
    `;
    document.body.appendChild(this.loader);
    this.startParticleSystem();
    this.startProgress();
    this.animateDots();
    setTimeout(() => this.fadeOut(), 3500);
  }

  startParticleSystem() {
    const canvas = this.loader.querySelector('.boot-particles');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    const particles = [];
    const particleCount = window.innerWidth < 768 ? 36 : 72;
    class Particle {
      constructor() {
        this.reset(true);
      }
      reset(initial) {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.32;
        this.vy = (Math.random() - 0.5) * 0.32;
        this.size = Math.random() * 2 + 0.8;
        this.opacity = Math.random() * 0.35 + 0.08;
        this.pulse = Math.random() * Math.PI * 2;
        if (!initial) {
          this.x = Math.random() * canvas.width;
          this.y = Math.random() * canvas.height;
        }
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.pulse += 0.02;
        if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) {
          this.reset(false);
        }
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity + Math.sin(this.pulse) * 0.04;
        ctx.fillStyle = '#91a9ff';
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgba(108,142,255,0.45)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
    this.onBootResize = setCanvasSize;
    window.addEventListener('resize', this.onBootResize);
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 140) {
            ctx.save();
            ctx.globalAlpha = (1 - distance / 140) * 0.12;
            ctx.strokeStyle = 'rgba(108,142,255,0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        });
      });
      this.frameId = requestAnimationFrame(animate);
    };
    animate();
  }

  startProgress() {
    const bar = this.loader.querySelector('#bootProgressBar');
    const value = this.loader.querySelector('#bootProgressValue');
    const statusText = this.loader.querySelector('#bootStatusText');
    if (!bar || !value || !statusText) return;
    const stepCount = this.statusSteps.length;
    let tick = 0;
    const render = () => {
      const displayValue = Math.max(0, Math.min(100, Math.round(this.progress)));
      bar.style.width = displayValue + '%';
      value.textContent = String(displayValue).padStart(2, '0') + '%';
      const stepIndex = Math.min(stepCount - 1, Math.floor((displayValue / 100) * stepCount));
      statusText.textContent = this.statusSteps[stepIndex];
    };
    render();
    this.progressTimer = setInterval(() => {
      tick += 1;
      const increment = tick < 4 ? 16 : tick < 8 ? 10 : tick < 12 ? 6 : 2.2;
      this.progress = Math.min(96, this.progress + increment);
      render();
    }, 220);
  }

  animateDots() {
    const dots = this.loader.querySelector('.boot-dots');
    if (!dots) return;
    let count = 0;
    this.dotsTimer = setInterval(() => {
      count = (count + 1) % 4;
      dots.textContent = '.'.repeat(count);
    }, 380);
  }

  fadeOut() {
    const bar = this.loader.querySelector('#bootProgressBar');
    const value = this.loader.querySelector('#bootProgressValue');
    const statusText = this.loader.querySelector('#bootStatusText');
    if (bar) bar.style.width = '100%';
    if (value) value.textContent = '100%';
    if (statusText) statusText.textContent = '启动完成';
    if (this.progressTimer) clearInterval(this.progressTimer);
    if (this.dotsTimer) clearInterval(this.dotsTimer);
    this.loader.classList.add('fade-out');
    setTimeout(() => {
      if (this.frameId) cancelAnimationFrame(this.frameId);
      if (this.onBootResize) window.removeEventListener('resize', this.onBootResize);
      if (this.loader.parentNode) {
        this.loader.parentNode.removeChild(this.loader);
      }
    }, 800);
  }
}

export function startBootAnimation() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      new BootAnimation();
    });
  } else {
    new BootAnimation();
  }
}
