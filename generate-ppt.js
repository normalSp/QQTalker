const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// Only use icons that definitely exist
const { 
  FaRobot, FaComments, FaMicrophone, FaEye, FaDice, FaHandWave, 
  FaChartLine, FaCog, FaBolt, FaBrain, FaShieldAlt, FaClock, 
  FaUsers, FaImage, FaVolumeUp, FaSearch, FaGlobe, FaServer, 
  FaDatabase, FaPlug, FaHeart, FaStar, FaRocket, FaCode, 
  FaMobile, FaDesktop, FaWifi, FaSync, FaLock, FaMagic, 
  FaUserSecret, FaPaperPlane, FaGift, FaMoon, FaSun, FaCloud,
  FaThunderbolt, FaCheckCircle, FaArrowRight, FaPlay,
  FaAt, FaExchangeAlt
} = require("react-icons/fa");

const { SiOpenai } = require("react-icons/si");
const { MdDashboard, MdAnalytics } = require("react-icons/md");
const { HiSparkles, HiCube, HiLightningBolt } = require("react-icons/hi");
const { BsRobot, BsChatDots, BsMic, BsGrid3X3GapFill, BsShieldCheck, BsGearFill, BsLightningCharge, BsPeople, BsGraphUp, BsCpu, BsTerminal } = require("react-icons/bs");

// Color Palette - Midnight Executive (深蓝科技风)
const COLORS = {
  primary: "1E2761",
  secondary: "CADCFC",
  accent: "6C8EFF",
  accent2: "B347FF",
  white: "FFFFFF",
  dark: "0A0E1A",
  darker: "050810",
  textMuted: "8892B0",
  textLight: "E2E8F0",
  highlight: "00D4FF",
  success: "4ADE80",
  warning: "FBBF24",
};

// Icon cache to avoid re-rendering
const iconCache = new Map();

async function iconToBase64Png(IconComponent, color, size = 256) {
  if (!IconComponent) {
    console.warn('IconComponent is null/undefined, using fallback');
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size/5}" fill="${color}"/></svg>`;
    const buf = await sharp(Buffer.from(fallbackSvg)).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
  }
  
  const cacheKey = `${(IconComponent.displayName || IconComponent.name || 'unknown')}_${color}_${size}`;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
  
  try {
    const svg = ReactDOMServer.renderToStaticMarkup(
      React.createElement(IconComponent, { color, size: String(size) })
    );
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const result = "image/png;base64," + pngBuffer.toString("base64");
    iconCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Failed to render icon ${cacheKey}:`, err.message);
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${color}"/></svg>`;
    const buf = await sharp(Buffer.from(fallbackSvg)).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
  }
}

const makeShadow = () => ({ type: "outer", blur: 8, offset: 3, color: "000000", opacity: 0.3 });

async function createPresentation() {
  const pres = new pptxgen();
  
  pres.layout = "LAYOUT_16x9";
  pres.author = "QQTalker";
  pres.title = "QQTalker - AI聊天机器人展示";

  // ========== SLIDE 1: 封面 ==========
  let slide1 = pres.addSlide();
  slide1.background = { color: COLORS.dark };
  
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: -1, y: -1, w: 5, h: 7,
    fill: { color: COLORS.primary, transparency: 70 },
  });
  slide1.addShape(pres.shapes.OVAL, { x: 7, y: -2, w: 5, h: 5, fill: { color: COLORS.accent2, transparency: 85 } });
  slide1.addShape(pres.shapes.OVAL, { x: -2, y: 3, w: 4, h: 4, fill: { color: COLORS.accent, transparency: 90 } });

  slide1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.5, w: 8.4, h: 2.8,
    fill: { color: COLORS.primary, transparency: 40 },
    rectRadius: 0.2, shadow: makeShadow()
  });

  const robotIcon = await iconToBase64Png(FaRobot, "#6C8EFF", 200);
  slide1.addImage({ data: robotIcon, x: 4.25, y: 0.6, w: 1.5, h: 1.5 });
  
  slide1.addText("QQTalker", {
    x: 0.8, y: 1.7, w: 8.4, h: 1,
    fontSize: 54, fontFace: "Arial Black", color: COLORS.white, bold: true,
    align: "center", valign: "middle"
  });
  
  slide1.addText("AI驱动的QQ智能聊天机器人平台", {
    x: 0.8, y: 2.7, w: 8.4, h: 0.6,
    fontSize: 22, fontFace: "Calibri", color: COLORS.secondary, align: "center"
  });
  
  slide1.addText("将你的QQ号变成一只可爱的猫娘AI机器人（Claw）", {
    x: 0.8, y: 3.35, w: 8.4, h: 0.5,
    fontSize: 14, fontFace: "Calibri Light", color: COLORS.textMuted, align: "center", italic: true
  });
  
  const tags = [
    { text: "群聊共享上下文", icon: FaUsers },
    { text: "语音交互 TTS/STT", icon: FaMicrophone },
    { text: "图片识别 Vision", icon: FaEye },
    { text: "智能占卜系统", icon: FaDice },
    { text: "实时 Dashboard", icon: FaChartLine }
  ];
  
  let tagX = 0.6;
  for (let i = 0; i < tags.length; i++) {
    const tagIcon = await iconToBase64Png(tags[i].icon, COLORS.accent, 48);
    slide1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: tagX, y: 4.6, w: 1.75, h: 0.65,
      fill: { color: COLORS.primary, transparency: 30 }, rectRadius: 0.08
    });
    slide1.addImage({ data: tagIcon, x: tagX + 0.08, y: 4.73, w: 0.32, h: 0.32 });
    slide1.addText(tags[i].text, {
      x: tagX + 0.42, y: 4.6, w: 1.28, h: 0.65,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textLight, valign: "middle"
    });
    tagX += 1.85;
  }

  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.35, w: 10, h: 0.28, fill: { color: COLORS.accent, transparency: 80 }
  });
  slide1.addText("Powered by DeepSeek / OpenAI API  |  OneBot Protocol  |  Node.js + TypeScript", {
    x: 0, y: 5.35, w: 10, h: 0.28,
    fontSize: 9, fontFace: "Consolas", color: COLORS.textMuted, align: "center", valign: "middle"
  });

  // ========== SLIDE 2: 项目概述 ==========
  let slide2 = pres.addSlide();
  slide2.background = { color: COLORS.dark };
  
  slide2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.15, h: 5.63, fill: { color: COLORS.accent } });
  
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 1.2, fill: { color: COLORS.primary, transparency: 60 }
  });
  
  const overviewIcon = await iconToBase64Png(BsGrid3X3GapFill, "#6C8EFF", 80);
  slide2.addImage({ data: overviewIcon, x: 0.5, y: 0.25, w: 0.7, h: 0.7 });
  slide2.addText("项目概述", {
    x: 1.3, y: 0.25, w: 4, h: 0.7,
    fontSize: 32, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide2.addText("PROJECT OVERVIEW", {
    x: 1.3, y: 0.7, w: 4, h: 0.4,
    fontSize: 11, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  slide2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.5, w: 5.5, h: 2.2,
    fill: { color: COLORS.primary, transparency: 50 }, rectRadius: 0.12, shadow: makeShadow()
  });
  
  slide2.addText([
    { text: "什么是 QQTalker？\n\n", options: { fontSize: 18, bold: true, color: COLORS.accent } },
    { text: "QQTalker 是一款基于 ", options: { fontSize: 13, color: COLORS.textLight } },
    { text: "Node.js + TypeScript", options: { fontSize: 13, color: COLORS.highlight } },
    { text: " 开发的 QQ 聊天机器人框架，通过 ", options: { fontSize: 13, color: COLORS.textLight } },
    { text: "OneBot 协议", options: { fontSize: 13, color: COLORS.warning } },
    { text: " 与 QQ 通信，接入 AI 大模型 API 实现智能对话。\n\n", options: { fontSize: 13, color: COLORS.textLight } },
    { text: "核心定位：让每个 QQ 群都拥有一个有记忆、会思考、能互动的 AI 助手。", options: { fontSize: 12, color: COLORS.textMuted, italic: true } }
  ], { x: 0.7, y: 1.65, w: 5.1, h: 2, valign: "top" });

  const stats = [
    { value: "14+", label: "核心服务模块", icon: BsCpu, color: COLORS.accent },
    { value: "20+", label: "支持的功能特性", icon: BsLightningCharge, color: COLORS.accent2 },
    { value: "100%", label: "TypeScript覆盖", icon: FaCode, color: COLORS.success },
    { value: "<50ms", label: "消息响应延迟", icon: FaBolt, color: COLORS.warning }
  ];
  
  let statY = 1.5;
  for (const stat of stats) {
    slide2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 6.3, y: statY, w: 3.3, h: 0.95,
      fill: { color: COLORS.primary, transparency: 45 }, rectRadius: 0.08
    });
    const statIcon = await iconToBase64Png(stat.icon, stat.color, 56);
    slide2.addImage({ data: statIcon, x: 6.45, y: statY + 0.18, w: 0.55, h: 0.55 });
    slide2.addText(stat.value, {
      x: 7.1, y: statY + 0.1, w: 1.3, h: 0.5,
      fontSize: 24, fontFace: "Impact", color: stat.color, bold: true, valign: "middle"
    });
    slide2.addText(stat.label, {
      x: 8.35, y: statY + 0.2, w: 1.15, h: 0.55,
      fontSize: 11, fontFace: "Calibri", color: COLORS.textMuted, valign: "middle"
    });
    statY += 1.05;
  }

  slide2.addText("技术栈", {
    x: 0.5, y: 3.85, w: 2, h: 0.4,
    fontSize: 14, fontFace: "Arial Black", color: COLORS.accent
  });
  
  const techStack = ["TypeScript", "Node.js", "WebSocket", "OpenAI API", "edge-tts", "OneBot", "SSE", "HTTP"];
  let techX = 0.5;
  for (const tech of techStack) {
    slide2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: techX, y: 4.3, w: 1.1, h: 0.42,
      fill: { color: COLORS.accent, transparency: 75 }, rectRadius: 0.06
    });
    slide2.addText(tech, {
      x: techX, y: 4.3, w: 1.1, h: 0.42,
      fontSize: 9, fontFace: "Consolas", color: COLORS.textLight, align: "center", valign: "middle"
    });
    techX += 1.17;
  }

  slide2.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.95, w: 9, h: 0.5, fill: { color: COLORS.darker, transparency: 30 } });
  slide2.addText([
    { text: "v1.0.0  |  MIT License  |  支持 Windows/Linux/macOS  |  单文件可执行(.exe)", options: { fontSize: 11, color: COLORS.textMuted } }
  ], { x: 0.5, y: 4.95, w: 9, h: 0.5, align: "center", valign: "middle" });

  // ========== SLIDE 3: 核心功能总览 ==========
  let slide3 = pres.addSlide();
  slide3.background = { color: COLORS.dark };
  
  slide3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: COLORS.primary, transparency: 60 } });
  
  const funcIcon = await iconToBase64Png(HiSparkles, "#6C8EFF", 72);
  slide3.addImage({ data: funcIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide3.addText("核心功能矩阵", {
    x: 1.25, y: 0.2, w: 4, h: 0.65,
    fontSize: 30, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide3.addText("CORE FEATURES", {
    x: 1.25, y: 0.62, w: 4, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  const coreFeatures = [
    { title: "AI 智能对话", desc: "DeepSeek/OpenAI 兼容API\n多轮上下文记忆\n@触发回复机制", icon: FaBrain, color: COLORS.accent, bgColor: "1E2761" },
    { title: "群聊共享模式", desc: "全群共享对话上下文\n记住每个人的发言\n综合多人信息回复", icon: FaUsers, color: COLORS.success, bgColor: "1B4332" },
    { title: "语音合成 TTS", desc: "edge-tts 高质量语音\n多种音色可选\n语速可调节(1-9级)", icon: FaVolumeUp, color: COLORS.accent2, bgColor: "2D1B4E" },
    { title: "语音识别 STT", desc: "SenseVoice / Whisper\n语音转文字后处理\n支持 SILK 格式解码", icon: FaMicrophone, color: COLORS.highlight, bgColor: "0B4F6C" },
    { title: "图片识别 Vision", desc: "AI 描述图片内容\n@图片自动触发\n需 vision 支持模型", icon: FaEye, color: COLORS.warning, bgColor: "4A3728" },
    { title: "占卜娱乐系统", desc: "观音灵签 · 塔罗牌\n今日运势 · 随机占卜\n民俗黄历宜忌", icon: FaMagic, color: "FF6B9D", bgColor: "4A1942" }
  ];
  
  let cardX = 0.4, cardY = 1.3;
  for (let i = 0; i < coreFeatures.length; i++) {
    const feat = coreFeatures[i];
    
    slide3.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cardX, y: cardY, w: 3.0, h: 1.95,
      fill: { color: feat.bgColor, transparency: 30 }, rectRadius: 0.12, shadow: makeShadow()
    });
    
    slide3.addShape(pres.shapes.RECTANGLE, { x: cardX, y: cardY, w: 3.0, h: 0.06, fill: { color: feat.color } });
    
    const featIcon = await iconToBase64Png(feat.icon, feat.color, 64);
    slide3.addShape(pres.shapes.OVAL, { x: cardX + 0.15, y: cardY + 0.2, w: 0.6, h: 0.6, fill: { color: feat.color, transparency: 85 } });
    slide3.addImage({ data: featIcon, x: cardX + 0.22, y: cardY + 0.27, w: 0.46, h: 0.46 });
    
    slide3.addText(feat.title, {
      x: cardX + 0.85, y: cardY + 0.22, w: 2.0, h: 0.45,
      fontSize: 15, fontFace: "Arial", color: feat.color, bold: true, valign: "middle"
    });
    
    slide3.addText(feat.desc.split('\n').map(line => ({
      text: line, options: { bullet: true, fontSize: 10, color: COLORS.textMuted, breakLine: true }
    })), { x: cardX + 0.15, y: cardY + 0.9, w: 2.7, h: 1.0, valign: "top", paraSpaceAfter: 2 });
    
    cardX += 3.15;
    if ((i + 1) % 3 === 0) { cardX = 0.4; cardY += 2.1; }
  }

  slide3.addText("所有功能均可通过 .env 配置文件独立开关，按需启用", {
    x: 0.4, y: 5.2, w: 9.2, h: 0.35,
    fontSize: 10, fontFace: "Calibri", color: COLORS.textMuted, align: "center", italic: true
  });

  // ========== SLIDE 4: 架构设计 ==========
  let slide4 = pres.addSlide();
  slide4.background = { color: COLORS.dark };
  
  slide4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: COLORS.primary, transparency: 60 } });
  
  const archIcon = await iconToBase64Png(HiCube, "#6C8EFF", 72);
  slide4.addImage({ data: archIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide4.addText("系统架构", {
    x: 1.25, y: 0.2, w: 4, h: 0.65,
    fontSize: 30, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide4.addText("SYSTEM ARCHITECTURE", {
    x: 1.25, y: 0.62, w: 4, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  // Layer 1: QQ Client
  slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 3.5, y: 1.25, w: 3, h: 0.7,
    fill: { color: "12B886", transparency: 25 }, rectRadius: 0.1, shadow: makeShadow()
  });
  const qqIcon = await iconToBase64Png(FaGlobe, "#4ADE80", 48);
  slide4.addImage({ data: qqIcon, x: 3.65, y: 1.38, w: 0.4, h: 0.4 });
  slide4.addText("QQ / NapCat / LagRange", {
    x: 4.15, y: 1.25, w: 2.2, h: 0.7,
    fontSize: 12, fontFace: "Calibri", color: COLORS.success, valign: "middle"
  });
  slide4.addText("OneBot Protocol", {
    x: 3.5, y: 1.92, w: 3, h: 0.3,
    fontSize: 9, fontFace: "Consolas", color: COLORS.textMuted, align: "center"
  });

  slide4.addText("\u25BC", { x: 4.85, y: 2.2, w: 0.3, h: 0.3, fontSize: 14, color: COLORS.accent, align: "center" });

  // Layer 2: WebSocket
  slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 3.5, y: 2.5, w: 3, h: 0.6,
    fill: { color: COLORS.accent, transparency: 30 }, rectRadius: 0.08
  });
  const wsIcon = await iconToBase64Png(FaWifi, "#6C8EFF", 40);
  slide4.addImage({ data: wsIcon, x: 3.65, y: 2.6, w: 0.36, h: 0.36 });
  slide4.addText("WebSocket 双向通信", {
    x: 4.1, y: 2.5, w: 2.25, h: 0.6,
    fontSize: 12, fontFace: "Calibri", color: COLORS.accent, valign: "middle"
  });

  slide4.addText("\u25BC", { x: 4.85, y: 3.1, w: 0.3, h: 0.3, fontSize: 14, color: COLORS.accent, align: "center" });

  // Layer 3: Core Engine
  slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 2, y: 3.45, w: 6, h: 1.3,
    fill: { color: COLORS.primary, transparency: 35 }, rectRadius: 0.15,
    shadow: makeShadow(), line: { color: COLORS.accent, width: 1.5 }
  });
  
  const coreIcon = await iconToBase64Png(BsRobot, "#6C8EFF", 64);
  slide4.addImage({ data: coreIcon, x: 2.15, y: 3.65, w: 0.55, h: 0.55 });
  slide4.addText("QQTalker Core Engine", {
    x: 2.8, y: 3.5, w: 3, h: 0.5,
    fontSize: 16, fontFace: "Arial Black", color: COLORS.accent, bold: true
  });
  
  const coreModules = ["MessageHandler", "SessionMgr", "OneBotClient", "CodeBuddyClient"];
  let modX = 2.15;
  for (const mod of coreModules) {
    slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: modX, y: 4.1, w: 1.35, h: 0.5,
      fill: { color: COLORS.dark, transparency: 20 }, rectRadius: 0.06
    });
    slide4.addText(mod, {
      x: modX, y: 4.1, w: 1.35, h: 0.5,
      fontSize: 8, fontFace: "Consolas", color: COLORS.secondary, align: "center", valign: "middle"
    });
    modX += 1.43;
  }

  // Left services
  const leftServices = [
    { name: "TTSService", icon: FaVolumeUp, color: COLORS.success },
    { name: "STTService", icon: FaMicrophone, color: COLORS.highlight },
    { name: "VisionService", icon: FaEye, color: COLORS.warning }
  ];
  
  let svcLeftY = 1.35;
  for (const svc of leftServices) {
    slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.3, y: svcLeftY, w: 1.5, h: 0.7,
      fill: { color: svc.color, transparency: 30 }, rectRadius: 0.08
    });
    const sIcon = await iconToBase64Png(svc.icon, svc.color, 36);
    slide4.addImage({ data: sIcon, x: 0.4, y: svcLeftY + 0.15, w: 0.38, h: 0.38 });
    slide4.addText(svc.name, {
      x: 0.82, y: svcLeftY, w: 0.93, h: 0.7,
      fontSize: 8, fontFace: "Consolas", color: COLORS.textLight, valign: "middle"
    });
    svcLeftY += 0.82;
  }

  // Right services
  const rightServices = [
    { name: "DivinationSvc", icon: FaMagic, color: "FF6B9D" },
    { name: "SchedulerSvc", icon: FaClock, color: COLORS.accent2 },
    { name: "DashboardSvc", icon: MdDashboard, color: COLORS.accent }
  ];
  
  let svcRightY = 1.35;
  for (const svc of rightServices) {
    slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 8.2, y: svcRightY, w: 1.5, h: 0.7,
      fill: { color: svc.color, transparency: 30 }, rectRadius: 0.08
    });
    const sIcon = await iconToBase64Png(svc.icon, svc.color, 36);
    slide4.addImage({ data: sIcon, x: 8.3, y: svcRightY + 0.15, w: 0.38, h: 0.38 });
    slide4.addText(svc.name, {
      x: 8.72, y: svcRightY, w: 0.93, h: 0.7,
      fontSize: 8, fontFace: "Consolas", color: COLORS.textLight, valign: "middle"
    });
    svcRightY += 0.82;
  }

  slide4.addText("\u25B6", { x: 8.1, y: 3.85, w: 0.3, h: 0.3, fontSize: 16, color: COLORS.accent, align: "center" });
  slide4.addText("\u25B6", { x: 5.95, y: 3.85, w: 0.3, h: 0.3, fontSize: 16, color: COLORS.success, align: "center" });

  // AI API
  slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 6.5, y: 4.85, w: 3.2, h: 0.65,
    fill: { color: COLORS.accent2, transparency: 30 }, rectRadius: 0.1, shadow: makeShadow()
  });
  const aiApiIcon = await iconToBase64Png(SiOpenai, "#B347FF", 44);
  slide4.addImage({ data: aiApiIcon, x: 6.65, y: 4.97, w: 0.4, h: 0.4 });
  slide4.addText("DeepSeek / OpenAI API", {
    x: 7.12, y: 4.85, w: 2.45, h: 0.65,
    fontSize: 12, fontFace: "Calibri", color: COLORS.accent2, valign: "middle"
  });

  // Dashboard
  slide4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.3, y: 4.85, w: 2.8, h: 0.65,
    fill: { color: COLORS.success, transparency: 30 }, rectRadius: 0.1, shadow: makeShadow()
  });
  const dashSvcIcon = await iconToBase64Png(MdDashboard, "#4ADE80", 44);
  slide4.addImage({ data: dashSvcIcon, x: 0.45, y: 4.97, w: 0.4, h: 0.4 });
  slide4.addText("Dashboard :3180", {
    x: 0.92, y: 4.85, w: 2.05, h: 0.65,
    fontSize: 12, fontFace: "Calibri", color: COLORS.success, valign: "middle"
  });

  // ========== SLIDE 5: Dashboard 前端界面 ==========
  let slide5 = pres.addSlide();
  slide5.background = { color: COLORS.dark };
  
  slide5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: COLORS.primary, transparency: 60 } });
  
  const uiIcon = await iconToBase64Png(FaDesktop, "#6C8EFF", 72);
  slide5.addImage({ data: uiIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide5.addText("前端界面 - Dashboard 控制台", {
    x: 1.25, y: 0.2, w: 5, h: 0.65,
    fontSize: 28, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide5.addText("WEB DASHBOARD CONSOLE", {
    x: 1.25, y: 0.62, w: 4, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  // Browser mockup frame
  slide5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 1.3, w: 5.8, h: 4.1,
    fill: { color: "0d1117" }, rectRadius: 0.12,
    shadow: { type: "outer", blur: 15, offset: 4, color: "000000", opacity: 0.5 },
    line: { color: "30363d", width: 1 }
  });
  
  // Chrome bar
  slide5.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.3, w: 5.8, h: 0.35, fill: { color: "161b22" }, rectRadius: 0.12 });
  slide5.addShape(pres.shapes.OVAL, { x: 0.55, y: 1.41, w: 0.13, h: 0.13, fill: { color: "ff5f57" } });
  slide5.addShape(pres.shapes.OVAL, { x: 0.75, y: 1.41, w: 0.13, h: 0.13, fill: { color: "febc2e" } });
  slide5.addShape(pres.shapes.OVAL, { x: 0.95, y: 1.41, w: 0.13, h: 0.13, fill: { color: "28c840" } });
  slide5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.2, y: 1.37, w: 4.8, h: 0.22, fill: { color: "0d1117" }, rectRadius: 0.06 });
  slide5.addText("http://localhost:3180", {
    x: 1.2, y: 1.37, w: 4.8, h: 0.22,
    fontSize: 8, fontFace: "Consolas", color: "8b949e", align: "center", valign: "middle"
  });

  // Status bar
  slide5.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.75, w: 5.6, h: 0.45, fill: { color: "161b22" } });
  slide5.addShape(pres.shapes.OVAL, { x: 0.6, y: 1.86, w: 0.2, h: 0.2, fill: { color: "3fb950" } });
  slide5.addText("ONLINE  \u2022  运行中  \u2022  已连接", {
    x: 0.9, y: 1.75, w: 2.5, h: 0.45,
    fontSize: 9, fontFace: "Consolas", color: "3fb950", valign: "middle"
  });
  slide5.addText("Uptime: 2h 15m 33s", {
    x: 4.2, y: 1.75, w: 1.8, h: 0.45,
    fontSize: 8, fontFace: "Consolas", color: "8b949e", align: "right", valign: "middle"
  });

  // Stats grid
  const dashStats = [
    { label: "消息数", value: "1,284", color: "58a6ff" },
    { label: "AI调用", value: "892", color: "a371f7" },
    { label: "TTS次数", value: "456", color: "3fb950" },
    { label: "活跃群", value: "12", color: "f78166" }
  ];
  
  let dsX = 0.55;
  for (const ds of dashStats) {
    slide5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: dsX, y: 2.3, w: 1.3, h: 0.75, fill: { color: "161b22" }, rectRadius: 0.06
    });
    slide5.addText(ds.value, {
      x: dsX, y: 2.32, w: 1.3, h: 0.42,
      fontSize: 18, fontFace: "Impact", color: ds.color, align: "center", valign: "middle"
    });
    slide5.addText(ds.label, {
      x: dsX, y: 2.72, w: 1.3, h: 0.3,
      fontSize: 8, fontFace: "Consolas", color: "8b949e", align: "center", valign: "middle"
    });
    dsX += 1.38;
  }

  // Log area
  slide5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.55, y: 3.15, w: 5.5, h: 2.1,
    fill: { color: "0d1117" }, rectRadius: 0.06, line: { color: "30363d", width: 0.5 }
  });
  slide5.addText("\u{1F4CA} ACTIVITY LOG", {
    x: 0.65, y: 3.2, w: 2, h: 0.28,
    fontSize: 8, fontFace: "Consolas", color: "8b949e"
  });
  
  const mockLogs = [
    { time: "19:47:12", msg: "[被动回复] -> 群1080352376: 大家好！" },
    { time: "19:47:08", msg: "[TTS] 语音合成 #456 完成" },
    { time: "19:46:55", msg: "[占卜] 观音灵签 第42签 - 中吉" },
    { time: "19:46:41", msg: "[Vision] 图片识别完成" },
    { time: "19:46:30", msg: "[STT] 识别结果: 今天天气真好" },
  ];
  
  let logY = 3.52;
  for (const log of mockLogs) {
    slide5.addText(`${log.time}  ${log.msg}`, {
      x: 0.65, y: logY, w: 5.3, h: 0.26, fontSize: 7.5, fontFace: "Consolas", color: "c9d1d9"
    });
    logY += 0.29;
  }

  // Right panel
  slide5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 6.4, y: 1.3, w: 3.3, h: 4.1,
    fill: { color: COLORS.primary, transparency: 45 }, rectRadius: 0.12, shadow: makeShadow()
  });
  
  slide5.addText("控制台功能", {
    x: 6.55, y: 1.45, w: 3, h: 0.45,
    fontSize: 16, fontFace: "Arial Black", color: COLORS.accent, bold: true
  });
  
  const dashFeatures = [
    { icon: FaChartLine, title: "仪表盘", desc: "运行状态、消息统计、系统资源实时显示", color: COLORS.accent },
    { icon: BsTerminal, title: "活动日志", desc: "SSE 实时日志流，支持搜索和筛选", color: COLORS.success },
    { icon: MdAnalytics, title: "数据分析", desc: "图表展示消息趋势、AI调用统计等", color: COLORS.accent2 },
    { icon: BsGearFill, title: "配置管理", desc: "在线修改 .env 配置，支持热重载", color: COLORS.warning },
    { icon: FaServer, title: "进程信息", desc: "查看系统资源占用和运行状态", color: COLORS.highlight },
    { icon: FaSearch, title: "日志分析器", desc: "专业日志分析，8个统计指标+可视化图表", color: "FF6B9D" }
  ];
  
  let dfY = 1.95;
  for (const df of dashFeatures) {
    const dfIcon = await iconToBase64Png(df.icon, df.color, 40);
    slide5.addShape(pres.shapes.OVAL, { x: 6.55, y: dfY, w: 0.38, h: 0.38, fill: { color: df.color, transparency: 85 } });
    slide5.addImage({ data: dfIcon, x: 6.6, y: dfY + 0.05, w: 0.28, h: 0.28 });
    slide5.addText(df.title, {
      x: 7.0, y: dfY - 0.02, w: 2.5, h: 0.28,
      fontSize: 11, fontFace: "Arial", color: df.color, bold: true, valign: "middle"
    });
    slide5.addText(df.desc, {
      x: 7.0, y: dfY + 0.26, w: 2.55, h: 0.35,
      fontSize: 9, fontFace: "Calibri", color: COLORS.textMuted, valign: "top"
    });
    dfY += 0.72;
  }

  // ========== SLIDE 6: 更多功能特性 ==========
  let slide6 = pres.addSlide();
  slide6.background = { color: COLORS.dark };
  
  slide6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: COLORS.primary, transparency: 60 } });
  
  const moreIcon = await iconToBase64Png(HiLightningBolt, "#6C8EFF", 72);
  slide6.addImage({ data: moreIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide6.addText("更多功能特性", {
    x: 1.25, y: 0.2, w: 5, h: 0.65,
    fontSize: 30, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide6.addText("MORE FEATURES", {
    x: 1.25, y: 0.62, w: 4, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  // Left column
  slide6.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 1.3, w: 4.5, h: 4.1,
    fill: { color: COLORS.primary, transparency: 40 }, rectRadius: 0.12, shadow: makeShadow()
  });
  
  slide6.addText("\u{1F4AC} 交互功能", {
    x: 0.6, y: 1.45, w: 4, h: 0.45,
    fontSize: 17, fontFace: "Arial Black", color: COLORS.accent, bold: true
  });
  
  const interactionFeatures = [
    { icon: FaAt, title: "@触发机制", desc: "群内 @机器人 即可唤醒AI助手", color: COLORS.accent },
    { icon: FaUserSecret, title: "被动插聊", desc: "15%概率主动参与群聊（带上下文理解）", color: COLORS.success },
    { icon: FaHandWave, title: "入群欢迎", desc: "新成员入群自动发送个性化欢迎语", color: "FF6B9D" },
    { icon: FaMoon, title: "定时问候", desc: "每日早安/午安/晚安/运势广播", color: COLORS.accent2 },
    { icon: FaExchangeAlt, title: "Astrbot转发", desc: "消息转发给其他AI机器人，实现多AI协作", color: COLORS.warning },
    { icon: FaSync, title: "自动重连", desc: "断线指数退避重连机制，稳定可靠", color: COLORS.highlight }
  ];
  
  let ifY = 1.95;
  for (const ifeat of interactionFeatures) {
    const ifIcon = await iconToBase64Png(ifeat.icon, ifeat.color, 40);
    slide6.addImage({ data: ifIcon, x: 0.6, y: ifY, w: 0.35, h: 0.35 });
    slide6.addText(ifeat.title, {
      x: 1.02, y: ifY - 0.02, w: 1.8, h: 0.28,
      fontSize: 12, fontFace: "Arial", color: ifeat.color, bold: true, valign: "middle"
    });
    slide6.addText(ifeat.desc, {
      x: 1.02, y: ifY + 0.26, w: 3.7, h: 0.3,
      fontSize: 9.5, fontFace: "Calibri", color: COLORS.textMuted, valign: "top"
    });
    ifY += 0.62;
  }

  // Right column
  slide6.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.3, w: 4.5, h: 4.1,
    fill: { color: COLORS.primary, transparency: 40 }, rectRadius: 0.12, shadow: makeShadow()
  });
  
  slide6.addText("\u2699\uFE0F 系统能力", {
    x: 5.3, y: 1.45, w: 4, h: 0.45,
    fontSize: 17, fontFace: "Arial Black", color: COLORS.accent2, bold: true
  });
  
  const systemFeatures = [
    { icon: FaShieldAlt, title: "频率控制", desc: "自适应发送限速，避免QQ风控封号", color: COLORS.success },
    { icon: FaLock, title: "屏蔽管理", desc: "支持用户/群组黑白名单管理", color: COLORS.accent },
    { icon: FaDatabase, title: "双模式会话", desc: "群聊共享上下文 / 私聊独立对话切换", color: COLORS.accent2 },
    { icon: FaImage, title: "图片代理", desc: "服务端图片中转，绕过防盗链限制", color: COLORS.warning },
    { icon: FaPaperPlane, title: "合并转发", desc: "解析合并转发消息内容并展示", color: COLORS.highlight },
    { icon: FaGift, title: "单文件部署", desc: "pkg 打包为独立 exe，零依赖运行", color: "FF6B9D" }
  ];
  
  let sfY = 1.95;
  for (const sfeat of systemFeatures) {
    const sfIcon = await iconToBase64Png(sfeat.icon, sfeat.color, 40);
    slide6.addImage({ data: sfIcon, x: 5.3, y: sfY, w: 0.35, h: 0.35 });
    slide6.addText(sfeat.title, {
      x: 5.72, y: sfY - 0.02, w: 1.8, h: 0.28,
      fontSize: 12, fontFace: "Arial", color: sfeat.color, bold: true, valign: "middle"
    });
    slide6.addText(sfeat.desc, {
      x: 5.72, y: sfY + 0.26, w: 3.7, h: 0.3,
      fontSize: 9.5, fontFace: "Calibri", color: COLORS.textMuted, valign: "top"
    });
    sfY += 0.62;
  }

  // ========== SLIDE 7: 占卜系统 ==========
  let slide7 = pres.addSlide();
  slide7.background = { color: COLORS.dark };
  
  slide7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: "2D1B69", transparency: 20 } });
  
  const divIcon = await iconToBase64Png(FaMagic, "#FF6B9D", 72);
  slide7.addImage({ data: divIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide7.addText("占卜娱乐系统", {
    x: 1.25, y: 0.2, w: 5, h: 0.65,
    fontSize: 30, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide7.addText("DIVINATION & ENTERTAINMENT", {
    x: 1.25, y: 0.62, w: 5, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: "FF6B9D", charSpacing: 3
  });

  const divTypes = [
    { title: "观音灵签", cmd: "@Claw 抽签", desc: "100签随机抽取，每签附详细解签内容。上上/上吉/中吉/下吉等级评定。", emoji: "\uD83C\uDF33", color: "FF6B9D", bg: "4A1942" },
    { title: "塔罗牌", cmd: "@Claw 塔罗", desc: "从22张大阿卡纳牌阵中随机抽一张，解读正位/逆位含义。", emoji: "\uD83C\uDCCF", color: "A855F7", bg: "3B1F5C" },
    { title: "今日运势", cmd: "@Claw 运势", desc: "爱情/事业/财运/综合四个维度运势评估，每日更新。", emoji: "\u2648\uFE0F", color: "FBBF24", bg: "4A3F1A" },
    { title: "随机占卜", cmd: "@Claw 占卜", desc: "混合多种术数的神秘结果，每次都有不同惊喜。", emoji: "\u2728", color: "06B6D4", bg: "134A5C" }
  ];

  let dtX = 0.4, dtY = 1.3;
  for (let i = 0; i < divTypes.length; i++) {
    const dt = divTypes[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    
    slide7.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: dtX + col * 4.8, y: dtY + row * 2.05, w: 4.6, h: 1.9,
      fill: { color: dt.bg, transparency: 25 }, rectRadius: 0.15,
      shadow: makeShadow(), line: { color: dt.color, width: 1, transparency: 60 }
    });
    
    slide7.addShape(pres.shapes.OVAL, {
      x: dtX + col * 4.8 + 0.2, y: dtY + row * 2.05 + 0.2, w: 0.8, h: 0.8,
      fill: { color: dt.color, transparency: 80 }
    });
    slide7.addText(dt.emoji, {
      x: dtX + col * 4.8 + 0.2, y: dtY + row * 2.05 + 0.28, w: 0.8, h: 0.65,
      fontSize: 28, align: "center", valign: "middle"
    });
    
    slide7.addText(dt.title, {
      x: dtX + col * 4.8 + 1.1, y: dtY + row * 2.05 + 0.2, w: 2.2, h: 0.45,
      fontSize: 17, fontFace: "Arial Black", color: dt.color, bold: true, valign: "middle"
    });
    slide7.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: dtX + col * 4.8 + 3.3, y: dtY + row * 2.05 + 0.25, w: 1.15, h: 0.35,
      fill: { color: dt.color, transparency: 70 }, rectRadius: 0.06
    });
    slide7.addText(dt.cmd, {
      x: dtX + col * 4.8 + 3.3, y: dtY + row * 2.05 + 0.25, w: 1.15, h: 0.35,
      fontSize: 8, fontFace: "Consolas", color: COLORS.textLight, align: "center", valign: "middle"
    });
    
    slide7.addText(dt.desc, {
      x: dtX + col * 4.8 + 0.2, y: dtY + row * 2.05 + 1.0, w: 4.2, h: 0.8,
      fontSize: 11, fontFace: "Calibri", color: COLORS.textMuted, valign: "top"
    });
  }

  slide7.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 5.15, w: 9.2, h: 0.4,
    fill: { color: COLORS.success, transparency: 30 }, rectRadius: 0.06
  });
  const checkIcon = await iconToBase64Png(FaCheckCircle, "#4ADE80", 32);
  slide7.addImage({ data: checkIcon, x: 0.55, y: 5.21, w: 0.28, h: 0.28 });
  slide7.addText("占卜结果由本地算法生成，不消耗 AI 额度，响应速度快，趣味性强", {
    x: 0.9, y: 5.15, w: 8.5, h: 0.4,
    fontSize: 11, fontFace: "Calibri", color: COLORS.success, valign: "middle"
  });

  // ========== SLIDE 8: 快速开始 ==========
  let slide8 = pres.addSlide();
  slide8.background = { color: COLORS.dark };
  
  slide8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: COLORS.primary, transparency: 60 } });
  
  const startIcon = await iconToBase64Png(FaRocket, "#6C8EFF", 72);
  slide8.addImage({ data: startIcon, x: 0.5, y: 0.22, w: 0.65, h: 0.65 });
  slide8.addText("快速开始", {
    x: 1.25, y: 0.2, w: 4, h: 0.65,
    fontSize: 30, fontFace: "Arial Black", color: COLORS.white, bold: true, valign: "middle"
  });
  slide8.addText("QUICK START GUIDE", {
    x: 1.25, y: 0.62, w: 4, h: 0.35,
    fontSize: 10, fontFace: "Calibri Light", color: COLORS.accent, charSpacing: 3
  });

  const steps = [
    { num: "01", title: "克隆项目", code: "git clone <repo> && cd QQTalker\nnpm install", icon: FaCode, color: COLORS.accent },
    { num: "02", title: "配置环境", code: "cp .env.example .env\n# 编辑 .env 配置 API Key 等", icon: BsGearFill, color: COLORS.success },
    { num: "03", title: "启动 OneBot", code: "确保 NapCat/LagRange 运行\nWebSocket 服务已开启", icon: FaServer, color: COLORS.warning },
    { num: "04", title: "启动服务", code: "npm run dev          # 开发模式\nnpm run build && npm start", icon: FaPlay, color: "FF6B9D" }
  ];

  let stepX = 0.4;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    slide8.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: stepX, y: 1.3, w: 2.3, h: 3.0,
      fill: { color: COLORS.primary, transparency: 40 }, rectRadius: 0.12, shadow: makeShadow()
    });
    
    slide8.addShape(pres.shapes.OVAL, {
      x: stepX + 0.85, y: 1.45, w: 0.6, h: 0.6,
      fill: { color: step.color, transparency: 20 }
    });
    slide8.addText(step.num, {
      x: stepX + 0.85, y: 1.45, w: 0.6, h: 0.6,
      fontSize: 18, fontFace: "Impact", color: step.color, align: "center", valign: "middle"
    });
    
    const stepIcon = await iconToBase64Png(step.icon, step.color, 40);
    slide8.addImage({ data: stepIcon, x: stepX + 0.95, y: 2.15, w: 0.4, h: 0.4 });
    
    slide8.addText(step.title, {
      x: stepX, y: 2.6, w: 2.3, h: 0.4,
      fontSize: 14, fontFace: "Arial Black", color: step.color, bold: true, align: "center"
    });
    
    slide8.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: stepX + 0.1, y: 3.05, w: 2.1, h: 1.15,
      fill: { color: COLORS.darker, transparency: 20 }, rectRadius: 0.06
    });
    slide8.addText(step.code, {
      x: stepX + 0.18, y: 3.1, w: 1.94, h: 1.05,
      fontSize: 8, fontFace: "Consolas", color: COLORS.secondary, valign: "top"
    });
    
    if (i < steps.length - 1) {
      slide8.addText("\u25B6", {
        x: stepX + 2.28, y: 2.6, w: 0.25, h: 0.3,
        fontSize: 14, color: COLORS.textMuted, align: "center"
      });
    }
    
    stepX += 2.42;
  }

  slide8.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 4.5, w: 9.2, h: 0.95,
    fill: { color: COLORS.success, transparency: 25 }, rectRadius: 0.1,
    line: { color: COLORS.success, width: 1, transparency: 60 }
  });
  
  const doneIcon = await iconToBase64Png(FaCheckCircle, "#4ADE80", 48);
  slide8.addImage({ data: doneIcon, x: 0.6, y: 4.68, w: 0.45, h: 0.45 });
  slide8.addText([
    { text: "启动成功！\n", options: { fontSize: 15, bold: true, color: COLORS.success } },
    { text: "访问 http://localhost:3180 打开 Dashboard 控制台，在群里 @你的机器人 即可开始对话！", options: { fontSize: 12, color: COLORS.textLight } }
  ], { x: 1.15, y: 4.53, w: 8.2, h: 0.9, valign: "middle" });

  // ========== SLIDE 9: 结束页 ==========
  let slide9 = pres.addSlide();
  slide9.background = { color: COLORS.dark };
  
  slide9.addShape(pres.shapes.OVAL, { x: -2, y: -2, w: 5, h: 5, fill: { color: COLORS.accent, transparency: 90 } });
  slide9.addShape(pres.shapes.OVAL, { x: 7.5, y: 2, w: 4, h: 4, fill: { color: COLORS.accent2, transparency: 88 } });
  slide9.addShape(pres.shapes.OVAL, { x: 4, y: 4, w: 3, h: 3, fill: { color: COLORS.accent, transparency: 92 } });

  slide9.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.5, y: 1.2, w: 7, h: 3.3,
    fill: { color: COLORS.primary, transparency: 40 }, rectRadius: 0.2, shadow: makeShadow()
  });

  const endIcon = await iconToBase64Png(FaRobot, "#6C8EFF", 180);
  slide9.addImage({ data: endIcon, x: 4.25, y: 0.5, w: 1.5, h: 1.5 });
  
  slide9.addText("QQTalker", {
    x: 1.5, y: 1.6, w: 7, h: 0.9,
    fontSize: 48, fontFace: "Arial Black", color: COLORS.white, bold: true, align: "center", valign: "middle"
  });
  
  slide9.addText("让你的QQ群拥有真正的AI灵魂", {
    x: 1.5, y: 2.5, w: 7, h: 0.55,
    fontSize: 18, fontFace: "Calibri Light", color: COLORS.secondary, align: "center", valign: "middle", italic: true
  });

  slide9.addShape(pres.shapes.RECTANGLE, {
    x: 3.5, y: 3.15, w: 3, h: 0.03, fill: { color: COLORS.accent, transparency: 50 }
  });

  slide9.addText([
    { text: "GitHub Repository  \u2022  MIT License  \u2022  v1.0.0", options: { fontSize: 12, color: COLORS.textMuted, breakLine: true } },
    { text: "Built with TypeScript \u2022 OneBot Protocol \u2022 OpenAI Compatible API", options: { fontSize: 10, color: COLORS.textMuted } }
  ], { x: 1.5, y: 3.3, w: 7, h: 0.8, align: "center", valign: "top" });

  slide9.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 2.8, y: 4.65, w: 2, h: 0.55,
    fill: { color: COLORS.accent, transparency: 30 }, rectRadius: 0.1
  });
  slide9.addText("查看文档", {
    x: 2.8, y: 4.65, w: 2, h: 0.55,
    fontSize: 13, fontFace: "Calibri", color: COLORS.white, align: "center", valign: "middle"
  });

  slide9.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.2, y: 4.65, w: 2, h: 0.55,
    fill: { color: COLORS.accent2, transparency: 30 }, rectRadius: 0.1
  });
  slide9.addText("立即体验", {
    x: 5.2, y: 4.65, w: 2, h: 0.55,
    fontSize: 13, fontFace: "Calibri", color: COLORS.white, align: "center", valign: "middle"
  });

  // Write file
  const outputPath = "d:/workspace/CodeBuddyWorkSpace/QQTalker/QQTalker-Showcase.pptx";
  await pres.writeFile({ fileName: outputPath });
  console.log(`PPT generated successfully: ${outputPath}`);
  return outputPath;
}

createPresentation().then(path => {
  console.log(`Done! Output: ${path}`);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
