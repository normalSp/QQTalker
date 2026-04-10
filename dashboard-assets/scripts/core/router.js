export const pageTitles = {
  dashboard: { title: '仪表盘', bc: '控制台 / 概览' },
  logs: { title: '活动日志', bc: '控制台 / 监控 / 日志' },
  chatlog: { title: '聊天记录', bc: '控制台 / 监控 / 聊天记录' },
  analytics: { title: '数据分析', bc: '控制台 / 监控 / 分析' },
  analyzer: { title: '智能日志分析', bc: '控制台 / 监控 / 日志分析' },
  selflearning: { title: '自学习中心', bc: '控制台 / 插件 / 自学习中心' },
  config: { title: '配置管理', bc: '控制台 / 系统 / 配置' },
  blocklist: { title: '屏蔽管理', bc: '控制台 / 系统 / 屏蔽管理' },
  process: { title: '进程信息', bc: '控制台 / 系统 / 进程' },
};

export function switchDashboardPage(page, hooks) {
  if (!page) return;
  document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
  const nav = document.querySelector('[data-page="' + page + '"]');
  if (nav) nav.classList.add('active');
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active', 'entering', 'leaving');
  });
  var el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    void el.offsetWidth;
    el.classList.add('entering');
    var cards = el.querySelectorAll('.card, .stat-card, .analyzer-stat, .config-group');
    if (cards.length) {
      gsap.from(cards, {
        y: 24, opacity: 0, scale: 0.97, duration: 0.45,
        stagger: { amount: 0.3, grid: 'auto', from: 'start' },
        ease: 'power3.out', delay: 0.12,
        clearProps: 'opacity,transform,scale'
      });
    }
    setTimeout(function() {
      el.querySelectorAll('.card').forEach(function(c) { c.classList.add('visible'); });
    }, 400);
  }
  if (pageTitles[page]) {
    document.getElementById('pageTitle').textContent = pageTitles[page].title;
    document.getElementById('pageBreadcrumb').textContent = pageTitles[page].bc;
  }
  hooks = hooks || {};
  if (page === 'selflearning' && hooks.onSelfLearning) hooks.onSelfLearning();
  if (page === 'config' && hooks.onConfig) hooks.onConfig();
  if (page === 'process' && hooks.onProcess) hooks.onProcess();
  if (page === 'analytics' && hooks.onAnalytics) hooks.onAnalytics();
  if (page === 'chatlog' && hooks.onChatlog) hooks.onChatlog();
  if (page === 'blocklist' && hooks.onBlocklist) hooks.onBlocklist();
}

export function bindDashboardNavigation(onSwitch) {
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      onSwitch(item.dataset.page);
    });
  });
  if (window.location.pathname === '/analyzer' || window.location.hash === '#analyzer') {
    const analyzerNav = document.querySelector('[data-page="analyzer"]');
    if (analyzerNav) analyzerNav.click();
  }
}
