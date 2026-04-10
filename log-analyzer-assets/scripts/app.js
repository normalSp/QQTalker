// 全局变量
let analysisData = null;
let charts = {};
let particleSystem = null;
let animationController = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initializeParticleSystem();
    initializeAnimations();
    setupEventListeners();
    
    // 仅在 HTTP 环境下自动加载默认日志
    if (window.location.protocol !== 'file:') {
        // 延迟加载默认日志
        setTimeout(() => {
            loadDefaultLog();
        }, 2000);
    }
});

// 粒子系统
function initializeParticleSystem() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const particleCount = 100;
    
    // 创建粒子
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.5 + 0.1
        });
    }
    
    // 动画循环
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            // 更新位置
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // 边界检测
            if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
            
            // 绘制粒子
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(59, 130, 246, ${particle.opacity})`;
            ctx.fill();
        });
        
        // 绘制连线
        particles.forEach((p1, i) => {
            particles.slice(i + 1).forEach(p2 => {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(59, 130, 246, ${0.1 * (1 - distance / 100)})`;
                    ctx.stroke();
                }
            });
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
    
    // 窗口大小调整
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// 初始化动画
function initializeAnimations() {
    // 导航栏动画
    gsap.to('.navbar', {
        y: 0,
        duration: 1,
        ease: 'power3.out',
        delay: 0.5
    });
    
    // 英雄区域动画
    gsap.to('.hero-content', {
        scale: 1,
        opacity: 1,
        duration: 1.5,
        ease: 'power3.out',
        delay: 0.8
    });
    
    // 浮动形状动画
    gsap.to('.shape', {
        y: -20,
        duration: 3,
        ease: 'power1.inOut',
        yoyo: true,
        repeat: -1,
        stagger: 0.5
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 滚动动画
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateSection(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    // 观察需要动画的元素
    const animatedElements = document.querySelectorAll('.control-panel, .stat-card, .chart-container, .logs-container, .metric-card');
    animatedElements.forEach(el => observer.observe(el));
}

// 动画区域
function animateSection(element) {
    gsap.to(element, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power3.out'
    });
}

// 滚动到指定区域
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId + 'Section');
    if (element) {
        gsap.to(window, {
            duration: 1,
            scrollTo: {
                y: element,
                autoKill: false
            },
            ease: 'power2.inOut'
        });
    }
}

// 开始分析
function startAnalysis() {
    gsap.to(window, {
        duration: 1,
        scrollTo: {
            y: '.analysis-section',
            autoKill: false
        },
        ease: 'power2.inOut'
    });
    
    // 触发文件选择
    document.getElementById('logFile').click();
}

// 显示演示
function showDemo() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');
    
    setTimeout(() => {
        overlay.classList.remove('active');
        loadDefaultLog();
    }, 2000);
}

// 显示/隐藏加载状态
function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// 解析日志文件（支持 JSON 格式和 [时间戳] LEVEL: 消息 格式）
function parseLogs(text) {
    const lines = text.split('\n');
    const logs = [];
    const bracketTsRe = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+(DEBUG|INFO|WARN|ERROR|FATAL|TRACE)\s*:\s*(.*)/i;
    const textLevelToNum = (s) => {
        const u = (s || '').toUpperCase().trim();
        if (u === 'ERROR' || u === 'FATAL' || u === 'ERR') return 50;
        if (u === 'WARN' || u === 'WARNING') return 40;
        if (u === 'INFO') return 30;
        if (u === 'DEBUG' || u === 'TRACE') return 20;
        return 30;
    };
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('{"level":')) {
            try {
                const log = JSON.parse(line);
                logs.push(log);
            } catch (e) {
                console.warn('解析日志行失败:', line, e);
            }
        } else if (bracketTsRe.test(line)) {
            const m = line.match(bracketTsRe);
            logs.push({
                level: textLevelToNum(m[2]),
                time: new Date(m[1].replace(' ', 'T')).toISOString(),
                msg: m[3]
            });
        }
    }
    return logs;
}

// 分析日志数据
function analyzeLogs(logs) {
    const events = {
        message: 0,
        meta_event: 0,
        ai: 0,
        tts: 0,
        stt: 0,
        error: 0,
        warning: 0,
        info: 0,
        other: 0
    };

    const hourlyStats = new Array(24).fill(0);
    const dailyStats = {};
    const serviceStats = {
        'AI Calls': 0,
        'TTS Calls': 0,
        'STT Calls': 0,
        'Messages': 0
    };
    
    const responseTimes = [];
    const errorRates = [];
    const userActivities = new Map();

    let firstTimestamp = null;
    let lastTimestamp = null;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    logs.forEach(log => {
        const msg = log.msg || '';
        const time = new Date(log.time);
        const hour = time.getHours();
        const date = time.toDateString();
        const day = time.toISOString().split('T')[0];

        // 更新统计
        hourlyStats[hour]++;
        
        if (!dailyStats[date]) {
            dailyStats[date] = { messages: 0, events: 0, errors: 0 };
        }

        // 分类事件
        if (msg.includes('收到消息事件')) {
            events.message++;
            serviceStats['Messages']++;
            dailyStats[date].messages++;
        } else if (msg.includes('meta_event')) {
            events.meta_event++;
            dailyStats[date].events++;
        } else if (msg.includes('AI') || msg.includes('发送消息到AI')) {
            events.ai++;
            serviceStats['AI Calls']++;
        } else if (msg.includes('TTS转换')) {
            events.tts++;
            serviceStats['TTS Calls']++;
        } else if (msg.toLowerCase().includes('stt')) {
            events.stt++;
            serviceStats['STT Calls']++;
        }
        
        // 按日志级别分类
        if (log.level >= 50) {
            events.error++;
            dailyStats[date].errors++;
        } else if (log.level >= 40) {
            events.warning++;
        } else if (log.level >= 30) {
            events.info++;
        }

        // 提取响应时间
        const responseTimeMatch = msg.match(/(\d+)ms/) || msg.match(/耗时[:：]\s*(\d+)/);
        if (responseTimeMatch) {
            const rt = parseInt(responseTimeMatch[1]);
            responseTimes.push({ time, value: rt });
            totalResponseTime += rt;
            responseTimeCount++;
        }

        // 用户活跃度统计
        const userMatch = msg.match(/用户(\d+)/) || msg.match(/QQ:(\d+)/);
        if (userMatch) {
            const userId = userMatch[1];
            if (!userActivities.has(userId)) {
                userActivities.set(userId, { count: 0, lastSeen: time });
            }
            const user = userActivities.get(userId);
            user.count++;
            user.lastSeen = time;
        }

        // 时间范围
        if (!firstTimestamp || time < firstTimestamp) {
            firstTimestamp = time;
        }
        if (!lastTimestamp || time > lastTimestamp) {
            lastTimestamp = time;
        }
    });

    // 计算错误率
    const totalDays = Object.keys(dailyStats).length || 1;
    for (let date in dailyStats) {
        const dayStats = dailyStats[date];
        const errorRate = dayStats.events > 0 ? (dayStats.errors / dayStats.events * 100).toFixed(2) : 0;
        errorRates.push({ date, value: parseFloat(errorRate) });
    }

    // 计算平均响应时间
    const avgResponseTime = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0;

    // 计算活跃用户数
    const activeUsers = Array.from(userActivities.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    return {
        events,
        hourlyStats,
        dailyStats,
        serviceStats,
        responseTimes,
        errorRates,
        userActivities: activeUsers,
        avgResponseTime,
        firstTimestamp,
        lastTimestamp,
        totalLogs: logs.length,
        uniqueUsers: userActivities.size
    };
}

// 显示统计卡片
function showStats(data) {
    const statsGrid = document.getElementById('statsGrid');
    const totalMessages = data.events.message;
    const totalEvents = data.totalLogs;
    const uptime = data.firstTimestamp && data.lastTimestamp ? 
        formatUptime(data.lastTimestamp - data.firstTimestamp) : '未知';
    const avgResponseTime = data.avgResponseTime || 0;

    const stats = [
        {
            icon: 'fa-comments',
            label: '总消息数',
            value: totalMessages.toLocaleString(),
            color: 'cyan',
            trend: '+12.5%',
            progress: Math.min(totalMessages / 1000, 100)
        },
        {
            icon: 'fa-brain',
            label: 'AI调用',
            value: data.events.ai.toLocaleString(),
            color: 'purple',
            trend: '+8.3%',
            progress: Math.min(data.events.ai / 500, 100)
        },
        {
            icon: 'fa-volume-up',
            label: 'TTS调用',
            value: data.events.tts.toLocaleString(),
            color: 'pink',
            trend: '+15.7%',
            progress: Math.min(data.events.tts / 300, 100)
        },
        {
            icon: 'fa-microphone',
            label: 'STT调用',
            value: data.events.stt.toLocaleString(),
            color: 'orange',
            trend: '+5.2%',
            progress: Math.min(data.events.stt / 200, 100)
        },
        {
            icon: 'fa-clock',
            label: '平均响应',
            value: avgResponseTime + 'ms',
            color: 'cyan',
            trend: '-3.1%',
            progress: Math.max(0, 100 - avgResponseTime / 10)
        },
        {
            icon: 'fa-users',
            label: '活跃用户',
            value: data.uniqueUsers.toLocaleString(),
            color: 'success',
            trend: '+6.8%',
            progress: Math.min(data.uniqueUsers / 50, 100)
        },
        {
            icon: 'fa-calendar',
            label: '运行时间',
            value: uptime,
            color: 'purple',
            trend: '稳定',
            progress: 100
        },
        {
            icon: 'fa-list',
            label: '总事件数',
            value: totalEvents.toLocaleString(),
            color: 'cyan',
            trend: '+9.4%',
            progress: Math.min(totalEvents / 5000, 100)
        }
    ];

    statsGrid.innerHTML = stats.map(stat => `
        <div class="stat-card ${stat.color}">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas ${stat.icon}"></i>
                </div>
                <div class="stat-trend trend-up">
                    ${stat.trend}
                </div>
            </div>
            <div class="stat-value">${stat.value}</div>
            <div class="stat-label">${stat.label}</div>
            <div class="stat-progress">
                <div class="stat-progress-bar" style="width: ${stat.progress}%"></div>
            </div>
        </div>
    `).join('');

    // 动画显示进度条
    setTimeout(() => {
        document.querySelectorAll('.stat-progress-bar').forEach(bar => {
            const width = bar.style.width;
            bar.style.width = '0%';
            setTimeout(() => {
                bar.style.width = width;
            }, 100);
        });
    }, 500);
}

// 创建图表
function createCharts(data) {
    // 销毁旧图表
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    charts = {};

    // 事件类型分布饼图
    const eventCtx = document.getElementById('eventChart').getContext('2d');
    charts.event = new Chart(eventCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data.events).filter(key => data.events[key] > 0),
            datasets: [{
                data: Object.values(data.events).filter(value => value > 0),
                backgroundColor: [
                    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#94a3b8'
                ],
                borderWidth: 0,
                hoverOffset: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 每小时消息量柱状图
    const hourlyCtx = document.getElementById('hourlyChart').getContext('2d');
    charts.hourly = new Chart(hourlyCtx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`),
            datasets: [{
                label: '消息数',
                data: data.hourlyStats,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(139, 92, 246, 0.8)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff'
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            }
        }
    });

    // 服务使用对比柱状图
    const serviceCtx = document.getElementById('serviceChart').getContext('2d');
    charts.service = new Chart(serviceCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(data.serviceStats),
            datasets: [{
                label: '调用次数',
                data: Object.values(data.serviceStats),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(139, 92, 246, 0.8)'
                ],
                borderColor: [
                    'rgba(59, 130, 246, 1)',
                    'rgba(236, 72, 153, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(139, 92, 246, 1)'
                ],
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff'
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            }
        }
    });

    // 每日活动趋势
    const dailyDates = Object.keys(data.dailyStats).sort();
    const dailyMessages = dailyDates.map(date => data.dailyStats[date].messages);
    
    const dailyCtx = document.getElementById('dailyChart').getContext('2d');
    charts.daily = new Chart(dailyCtx, {
        type: 'line',
        data: {
            labels: dailyDates.map(date => new Date(date).toLocaleDateString()),
            datasets: [{
                label: '每日消息数',
                data: dailyMessages,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff'
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    // 创建性能指标图表
    createPerformanceCharts(data);
}

// 创建性能指标图表
function createPerformanceCharts(data) {
    // 响应时间趋势
    if (data.responseTimes && data.responseTimes.length > 0) {
        const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
        charts.responseTime = new Chart(responseTimeCtx, {
            type: 'line',
            data: {
                labels: data.responseTimes.slice(-20).map(rt => new Date(rt.time).toLocaleTimeString()),
                datasets: [{
                    label: '响应时间 (ms)',
                    data: data.responseTimes.slice(-20).map(rt => rt.value),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 错误率监控
    if (data.errorRates && data.errorRates.length > 0) {
        const errorRateCtx = document.getElementById('errorRateChart').getContext('2d');
        charts.errorRate = new Chart(errorRateCtx, {
            type: 'bar',
            data: {
                labels: data.errorRates.map(er => new Date(er.date).toLocaleDateString()),
                datasets: [{
                    label: '错误率 (%)',
                    data: data.errorRates.map(er => er.value),
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // 用户活跃度
    if (data.userActivities && data.userActivities.length > 0) {
        const userActivityCtx = document.getElementById('userActivityChart').getContext('2d');
        charts.userActivity = new Chart(userActivityCtx, {
            type: 'doughnut',
            data: {
                labels: data.userActivities.slice(0, 5).map(ua => `用户${ua[0]}`),
                datasets: [{
                    data: data.userActivities.slice(0, 5).map(ua => ua[1].count),
                    backgroundColor: [
                        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// 显示日志预览（增强版，支持全部日志展示）
function showLogPreview(logs) {
    const logContent = document.getElementById('logContent');
    const maxDisplay = logs.length <= 1000 ? logs.length : 1000; // 显示最多1000条，防止浏览器卡顿
    
    logContent.innerHTML = '';
    
    // 显示日志摘要信息
    const summary = document.createElement('div');
    summary.className = 'log-summary';
    
    const errorCount = logs.filter(l => l.level >= 50).length;
    const warnCount = logs.filter(l => l.level >= 40 && l.level < 50).length;
    const infoCount = logs.filter(l => l.level >= 30 && l.level < 40).length;
    
    summary.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">总日志数：</span>
            <span class="summary-value">${logs.length.toLocaleString()}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">显示日志：</span>
            <span class="summary-value">${maxDisplay.toLocaleString()}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">时间范围：</span>
            <span class="summary-value">${logs.length > 0 ? 
                new Date(logs[0].time).toLocaleString() + ' - ' + new Date(logs[logs.length-1].time).toLocaleString() : 
                '暂无数据'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">日志级别：</span>
            <span class="summary-value error">ERROR: ${errorCount}</span>
            <span class="summary-value warn">WARN: ${warnCount}</span>
            <span class="summary-value info">INFO: ${infoCount}</span>
        </div>
    `;
    logContent.appendChild(summary);
    
    // 显示最近或匹配的日志
    const recentLogs = logs.slice(-maxDisplay).reverse();
    
    recentLogs.forEach((log, index) => {
        const time = new Date(log.time).toLocaleString();
        const level = getLogLevel(log.level);
        const msg = log.msg || '';
        const service = extractServiceName(msg);
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.setAttribute('data-level', level);
        logEntry.setAttribute('data-service', service || '');
        logEntry.innerHTML = `
            <div class="log-main">
                <span class="log-time">${time}</span>
                <span class="log-level ${level}">${level.toUpperCase()}</span>
                ${service ? `<span class="log-service">${service}</span>` : ''}
            </div>
            <div class="log-message" data-original="${escapeHtmlAttribute(msg)}">${escapeHtml(msg)}</div>
        `;
        
        logContent.appendChild(logEntry);
        
        // 动画显示
        setTimeout(() => {
            gsap.to(logEntry, {
                opacity: 1,
                x: 0,
                duration: 0.3,
                ease: 'power2.out'
            });
        }, index * 10); // 加快动画速度
    });
}

// 提取服务名称
function extractServiceName(msg) {
    if (msg.includes('AI') || msg.includes('发送消息到AI')) return 'AI';
    if (msg.includes('TTS')) return 'TTS';
    if (msg.includes('STT')) return 'STT';
    if (msg.includes('onebot') || msg.includes('OneBot')) return 'ONEBOT';
    if (msg.includes('AstrBot')) return 'ASTRBOT';
    if (msg.includes('消息事件')) return 'MESSAGE';
    return '';
}

// 获取日志级别
function getLogLevel(level) {
    if (level >= 50) return 'error';
    if (level >= 40) return 'warn';
    if (level >= 30) return 'info';
    return 'info';
}

// HTML转义
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// HTML属性转义
function escapeHtmlAttribute(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// 正则表达式转义
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading(true);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const logs = parseLogs(e.target.result);
            analysisData = analyzeLogs(logs);
            
            // 创建并显示分析区域
            createAnalysisSection();
            
            // 更新数据
            showStats(analysisData);
            createCharts(analysisData);
            showLogPreview(logs);
            
            showLoading(false);
            
            // 滚动到分析区域
            setTimeout(() => {
                scrollToSection('analysis');
            }, 500);
            
        } catch (error) {
            console.error('解析日志文件失败:', error);
            alert('解析日志文件失败: ' + error.message);
            showLoading(false);
        }
    };
    reader.readAsText(file);
}

// 创建分析区域HTML
function createAnalysisSection() {
    const mainContainer = document.querySelector('.main-container');
    
    // 检查是否已存在分析区域
    let analysisSection = document.getElementById('analysisSection');
    if (analysisSection) {
        analysisSection.style.display = 'block';
        return;
    }
    
    // 创建分析区域HTML
    analysisSection = document.createElement('div');
    analysisSection.className = 'analysis-section';
    analysisSection.id = 'analysisSection';
    analysisSection.innerHTML = `
        <h2 class="section-title">智能分析仪表板</h2>
        
        <!-- 控制面板 -->
        <div class="control-panel" id="controlPanel">
            <div class="file-upload-area" onclick="document.getElementById('logFile').click()">
                <input type="file" id="logFile" class="file-input" accept=".txt,.log" onchange="handleFileSelect(event)">
                <i class="fas fa-cloud-upload-alt upload-icon"></i>
                <div class="upload-text">拖拽日志文件到此处或点击上传</div>
                <div class="upload-hint">支持 .txt, .log 格式</div>
            </div>
            
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="refreshAnalysis()">
                    <i class="fas fa-sync-alt"></i> 刷新分析
                </button>
                <button class="btn btn-secondary" onclick="exportData()">
                    <i class="fas fa-download"></i> 导出数据
                </button>
            </div>
        </div>
        
        <!-- 统计概览 -->
        <div class="stats-overview">
            <div class="stats-grid" id="statsGrid"></div>
        </div>
        
        <!-- 图表区域 -->
        <div class="charts-section">
            <div class="charts-grid">
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">
                            <i class="fas fa-chart-pie"></i> 事件类型分布
                        </h3>
                        <div class="chart-actions">
                            <button class="chart-action" onclick="toggleChartType('event', 'pie')" title="饼图">
                                <i class="fas fa-chart-pie"></i>
                            </button>
                            <button class="chart-action" onclick="toggleChartType('event', 'bar')" title="柱状图">
                                <i class="fas fa-chart-bar"></i>
                            </button>
                        </div>
                    </div>
                    <canvas id="eventChart" class="chart-canvas"></canvas>
                </div>
                
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">
                            <i class="fas fa-clock"></i> 每小时消息量
                        </h3>
                    </div>
                    <canvas id="hourlyChart" class="chart-canvas"></canvas>
                </div>
                
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">
                            <i class="fas fa-chart-bar"></i> 服务使用对比
                        </h3>
                    </div>
                    <canvas id="serviceChart" class="chart-canvas"></canvas>
                </div>
                
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">
                            <i class="fas fa-chart-line"></i> 每日活动趋势
                        </h3>
                    </div>
                    <canvas id="dailyChart" class="chart-canvas"></canvas>
                </div>
            </div>
        </div>
        
        <!-- 性能指标 -->
        <div class="metrics-section">
            <div class="metrics-grid">
                <div class="metric-card">
                    <h3 class="chart-title">
                        <i class="fas fa-tachometer-alt"></i> 响应时间趋势
                    </h3>
                    <canvas id="responseTimeChart" class="metric-chart"></canvas>
                </div>
                <div class="metric-card">
                    <h3 class="chart-title">
                        <i class="fas fa-exclamation-triangle"></i> 错误率监控
                    </h3>
                    <canvas id="errorRateChart" class="metric-chart"></canvas>
                </div>
                <div class="metric-card">
                    <h3 class="chart-title">
                        <i class="fas fa-users"></i> 用户活跃度
                    </h3>
                    <canvas id="userActivityChart" class="metric-chart"></canvas>
                </div>
            </div>
        </div>
        
        <!-- 日志详情 -->
        <div class="logs-section" id="logsSection">
            <div class="logs-container">
                <div class="logs-header">
                    <h3 class="logs-title">
                        <i class="fas fa-file-alt"></i> 日志详情
                    </h3>
                    <div class="logs-controls">
                        <input type="text" id="logSearchInput" class="search-input" placeholder="🔍 搜索关键词..." onkeyup="searchLogs()">
                        <select class="filter-select" id="logLevelFilter" onchange="filterLogs()">
                            <option value="all">所有级别</option>
                            <option value="error">错误</option>
                            <option value="warn">警告</option>
                            <option value="info">信息</option>
                        </select>
                        <select class="filter-select" id="logServiceFilter" onchange="filterLogs()">
                            <option value="all">所有服务</option>
                            <option value="AI">AI服务</option>
                            <option value="TTS">TTS服务</option>
                            <option value="STT">STT服务</option>
                            <option value="ONEBOT">OneBot</option>
                            <option value="MESSAGE">消息事件</option>
                        </select>
                        <div class="log-actions">
                            <button class="btn btn-secondary btn-small" onclick="scrollToTopLogs()" title="回到顶部">
                                <i class="fas fa-arrow-up"></i>
                            </button>
                            <button class="btn btn-secondary btn-small" onclick="exportLogs()" title="导出日志">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn btn-danger btn-small" onclick="clearLogs()" title="清空日志">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="logs-content" id="logContent"></div>
            </div>
        </div>
    `;
    
    mainContainer.appendChild(analysisSection);
    
    // 触发动画
    setTimeout(() => {
        animateSection(analysisSection);
    }, 100);
}

// 加载默认日志（仅在通过 HTTP 服务器访问时生效）
async function loadDefaultLog() {
    showLoading(true);
    
    try {
        // 检查是否在 HTTP 环境下运行
        if (window.location.protocol === 'file:') {
            throw new Error('请通过 HTTP 服务器访问此页面，或手动上传日志文件。\n\n解决方案：\n1. 使用命令 npx http-server . -p 8080 启动本地服务器\n2. 或点击"开始分析"按钮上传日志文件');
        }
        
        const response = await fetch('日志/1.txt');
        if (!response.ok) throw new Error('无法加载默认日志文件');
        
        const text = await response.text();
        const logs = parseLogs(text);
        analysisData = analyzeLogs(logs);
        
        // 创建并显示分析区域
        createAnalysisSection();
        
        // 更新数据
        showStats(analysisData);
        createCharts(analysisData);
        showLogPreview(logs);
        
        showLoading(false);
        
        // 滚动到分析区域
        setTimeout(() => {
            scrollToSection('analysis');
        }, 500);
        
    } catch (error) {
        console.error('加载默认日志失败:', error);
        alert(error.message);
        showLoading(false);
        
        // 创建分析区域并显示上传控件
        createAnalysisSection();
    }
}

// 刷新分析
function refreshAnalysis() {
    if (analysisData) {
        showStats(analysisData);
        createCharts(analysisData);
    } else {
        loadDefaultLog();
    }
}

// 切换图表类型
function toggleChartType(chartId, type) {
    if (charts[chartId]) {
        charts[chartId].config.type = type;
        charts[chartId].update('active');
    }
}

// 搜索日志
function searchLogs() {
    const searchTerm = document.getElementById('logSearchInput').value.toLowerCase();
    const logEntries = document.querySelectorAll('.log-entry');
    
    logEntries.forEach(entry => {
        const messageElement = entry.querySelector('.log-message');
        if (!messageElement) return;
        
        const originalMessage = messageElement.getAttribute('data-original') || messageElement.textContent;
        const message = messageElement.textContent.toLowerCase();
        
        if (searchTerm === '') {
            entry.classList.remove('hidden', 'highlighted');
            messageElement.innerHTML = escapeHtml(originalMessage);
        } else if (message.includes(searchTerm)) {
            entry.classList.remove('hidden');
            entry.classList.add('highlighted');
            
            // 高亮搜索词
            const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
            const highlightedMessage = originalMessage.replace(regex, '<span class="highlight">$1</span>');
            messageElement.innerHTML = highlightedMessage;
        } else {
            entry.classList.add('hidden');
            entry.classList.remove('highlighted');
            messageElement.innerHTML = escapeHtml(originalMessage);
        }
    });
}

// 过滤日志（增强版）
function filterLogs() {
    const levelFilter = document.getElementById('logLevelFilter').value;
    const serviceFilter = document.getElementById('logServiceFilter').value;
    const logEntries = document.querySelectorAll('.log-entry');
    
    logEntries.forEach(entry => {
        const entryLevel = entry.getAttribute('data-level');
        const entryService = entry.getAttribute('data-service');
        
        let levelMatch = levelFilter === 'all' || entryLevel === levelFilter;
        let serviceMatch = serviceFilter === 'all' || entryService === serviceFilter;
        
        if (levelMatch && serviceMatch) {
            entry.classList.remove('hidden');
        } else {
            entry.classList.add('hidden');
        }
    });
}

// 滚动到日志顶部
function scrollToTopLogs() {
    const logContent = document.getElementById('logContent');
    logContent.scrollTop = 0;
}

// 导出日志
function exportLogs() {
    const logEntries = document.querySelectorAll('.log-entry:not(.hidden)');
    const visibleLogs = Array.from(logEntries).map(entry => {
        const time = entry.querySelector('.log-time').textContent;
        const level = entry.querySelector('.log-level').textContent;
        const message = entry.querySelector('.log-message').getAttribute('data-original') || 
                       entry.querySelector('.log-message').textContent;
        return `[${time}] [${level}] ${message}`;
    });
    
    if (visibleLogs.length === 0) {
        alert('没有可导出的日志');
        return;
    }
    
    const logText = visibleLogs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `qqtalker_filtered_logs_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    
    URL.revokeObjectURL(url);
}

// 清空日志
function clearLogs() {
    document.getElementById('logContent').innerHTML = '';
}

// 导出数据
function exportData() {
    if (!analysisData) {
        alert('请先分析日志数据');
        return;
    }
    
    const exportData = {
        ...analysisData,
        exportTime: new Date().toISOString(),
        summary: {
            totalMessages: analysisData.events.message,
            totalAI: analysisData.events.ai,
            totalTTS: analysisData.events.tts,
            totalSTT: analysisData.events.stt,
            uniqueUsers: analysisData.uniqueUsers,
            avgResponseTime: analysisData.avgResponseTime
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `qqtalker_analysis_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

// 格式化运行时间
function formatUptime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days > 0) {
        return `${days}天 ${remainingHours}小时`;
    }
    return `${hours}小时`;
}

// 窗口大小调整处理
window.addEventListener('resize', () => {
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
            chart.resize();
        }
    });
});