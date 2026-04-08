import json
import re
from datetime import datetime
import pandas as pd
from collections import defaultdict
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import warnings
warnings.filterwarnings('ignore')

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

class QQTalkerLogAnalyzer:
    def __init__(self, log_file):
        self.log_file = log_file
        self.logs = []
        self.events = []
        self.messages = []
        self.errors = []
        
    def parse_logs(self):
        """解析日志文件"""
        print(f"正在解析日志文件: {self.log_file}")
        
        with open(self.log_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # 提取JSON日志行
        lines = content.split('\n')
        valid_logs = []
        
        for line in lines:
            line = line.strip()
            if line.startswith('{"level":'):
                try:
                    log_entry = json.loads(line)
                    valid_logs.append(log_entry)
                except:
                    continue
        
        self.logs = valid_logs
        print(f"成功解析 {len(valid_logs)} 条日志记录")
        return valid_logs
    
    def extract_events(self):
        """提取事件和消息数据"""
        df = pd.DataFrame(self.logs)
        
        if df.empty:
            print("没有找到有效的日志数据")
            return
        
        # 转换时间戳
        df['timestamp'] = pd.to_datetime(df['time'], unit='ms')
        df['hour'] = df['timestamp'].dt.hour
        df['date'] = df['timestamp'].dt.date
        
        # 提取消息内容
        df['message_content'] = df['msg'].astype(str)
        
        # 分类事件类型
        df['event_type'] = 'other'
        df.loc[df['message_content'].str.contains('收到消息事件', na=False), 'event_type'] = 'message'
        df.loc[df['message_content'].str.contains('收到事件: meta_event', na=False), 'event_type'] = 'meta_event'
        df.loc[df['message_content'].str.contains('AI插聊', na=False), 'event_type'] = 'ai_chatter'
        df.loc[df['message_content'].str.contains('TTS转换', na=False), 'event_type'] = 'tts'
        df.loc[df['message_content'].str.contains('stt', case=False, na=False), 'event_type'] = 'stt'
        df.loc[df['level'] >= 40, 'event_type'] = 'error'
        
        self.events_df = df
        return df
    
    def analyze_message_patterns(self):
        """分析消息模式"""
        df = self.events_df
        
        # 按小时统计消息量
        hourly_stats = df[df['event_type'] == 'message'].groupby('hour').size()
        
        # 按日期统计
        daily_stats = df.groupby(['date', 'event_type']).size().unstack(fill_value=0)
        
        # 群组活跃度（从日志中提取群组ID）
        group_messages = df[df['event_type'] == 'message']
        group_ids = []
        
        for msg in group_messages['message_content']:
            match = re.search(r'group_id=(\d+)', str(msg))
            if match:
                group_ids.append(match.group(1))
        
        group_activity = pd.Series(group_ids).value_counts().head(10)
        
        return {
            'hourly_stats': hourly_stats,
            'daily_stats': daily_stats,
            'group_activity': group_activity
        }
    
    def analyze_service_usage(self):
        """分析服务使用情况"""
        df = self.events_df
        
        # AI调用次数
        ai_calls = len(df[df['message_content'].str.contains('AI|发送消息到AI', case=False, na=False)])
        
        # TTS调用次数
        tts_calls = len(df[df['event_type'] == 'tts'])
        
        # STT调用次数
        stt_calls = len(df[df['event_type'] == 'stt'])
        
        # 消息总数
        total_messages = len(df[df['event_type'] == 'message'])
        
        # 错误数
        error_count = len(df[df['level'] >= 40])
        
        return {
            'ai_calls': ai_calls,
            'tts_calls': tts_calls,
            'stt_calls': stt_calls,
            'total_messages': total_messages,
            'error_count': error_count,
            'total_events': len(df)
        }
    
    def create_visualizations(self):
        """创建可视化图表"""
        df = self.events_df
        patterns = self.analyze_message_patterns()
        usage = self.analyze_service_usage()
        
        print("\n=== QQTalker机器人数据分析报告 ===\n")
        
        # 1. 服务使用总览
        print("服务使用统计:")
        print(f"- 总消息数: {usage['total_messages']}")
        print(f"- AI调用次数: {usage['ai_calls']}")
        print(f"- TTS调用次数: {usage['tts_calls']}")
        print(f"- STT调用次数: {usage['stt_calls']}")
        print(f"- 错误数: {usage['error_count']}")
        print(f"- 总事件数: {usage['total_events']}")
        
        # 2. 事件类型分布
        event_dist = df['event_type'].value_counts()
        
        fig1 = px.pie(
            values=event_dist.values,
            names=event_dist.index,
            title='事件类型分布',
            color_discrete_sequence=px.colors.qualitative.Set3
        )
        fig1.write_html('event_distribution.html')
        
        # 3. 每小时消息量
        hourly_fig = px.bar(
            x=patterns['hourly_stats'].index,
            y=patterns['hourly_stats'].values,
            title='每小时消息量分布',
            labels={'x': '小时', 'y': '消息数'},
            color_discrete_sequence=['#6c8eff']
        )
        hourly_fig.write_html('hourly_messages.html')
        
        # 4. 每日趋势
        daily_fig = make_subplots(specs=[[{"secondary_y": True}]])
        
        if 'message' in patterns['daily_stats'].columns:
            daily_fig.add_trace(
                go.Scatter(
                    x=patterns['daily_stats'].index,
                    y=patterns['daily_stats']['message'],
                    mode='lines+markers',
                    name='消息数',
                    line=dict(color='#38bdf8', width=3)
                ),
                secondary_y=False,
            )
        
        daily_fig.update_layout(title='每日消息趋势')
        daily_fig.update_xaxes(title_text='日期')
        daily_fig.update_yaxes(title_text='消息数', secondary_y=False)
        daily_fig.write_html('daily_trend.html')
        
        # 5. 群组活跃度
        if not patterns['group_activity'].empty:
            group_fig = px.bar(
                x=patterns['group_activity'].values,
                y=patterns['group_activity'].index,
                orientation='h',
                title='最活跃的10个群组',
                labels={'x': '消息数', 'y': '群组ID'},
                color_discrete_sequence=['#a78bfa']
            )
            group_fig.write_html('group_activity.html')
        
        # 6. 服务使用对比
        services = ['AI Calls', 'TTS Calls', 'STT Calls', 'Messages']
        values = [usage['ai_calls'], usage['tts_calls'], usage['stt_calls'], usage['total_messages']]
        
        service_fig = px.bar(
            x=services,
            y=values,
            title='各项服务使用次数对比',
            labels={'x': '服务类型', 'y': '调用次数'},
            color=services,
            color_discrete_sequence=px.colors.qualitative.Pastel
        )
        service_fig.write_html('service_usage.html')
        
        print("\n图表已生成:")
        print("- event_distribution.html: 事件类型分布")
        print("- hourly_messages.html: 每小时消息量")
        print("- daily_trend.html: 每日消息趋势")
        print("- group_activity.html: 群组活跃度")
        print("- service_usage.html: 服务使用对比")
        
        return {
            'usage': usage,
            'patterns': patterns,
            'event_dist': event_dist
        }
    
    def generate_html_report(self, analysis_results):
        """生成HTML报告"""
        usage = analysis_results['usage']
        
        html_content = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QQTalker机器人数据分析报告</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            line-height: 1.6;
            min-height: 100vh;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
        }}
        .header h1 {{
            color: #6c8eff;
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 700;
        }}
        .header p {{
            color: #666;
            font-size: 1.1em;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }}
        .stat-card {{
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            backdrop-filter: blur(10px);
        }}
        .stat-card:hover {{
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.15);
        }}
        .stat-card.cyan {{ border-top: 4px solid #38bdf8; }}
        .stat-card.purple {{ border-top: 4px solid #a78bfa; }}
        .stat-card.pink {{ border-top: 4px solid #f472b6; }}
        .stat-card.orange {{ border-top: 4px solid #fb923c; }}
        .stat-card.success {{ border-top: 4px solid #4ade80; }}
        .stat-value {{
            font-size: 2.5em;
            font-weight: 700;
            margin: 10px 0;
        }}
        .stat-card.cyan .stat-value {{ color: #38bdf8; }}
        .stat-card.purple .stat-value {{ color: #a78bfa; }}
        .stat-card.pink .stat-value {{ color: #f472b6; }}
        .stat-card.orange .stat-value {{ color: #fb923c; }}
        .stat-card.success .stat-value {{ color: #4ade80; }}
        .stat-label {{
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        .section {{
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }}
        .section h2 {{
            color: #6c8eff;
            margin-bottom: 20px;
            font-size: 1.8em;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }}
        .chart-container {{
            margin: 30px 0;
            text-align: center;
        }}
        .chart-iframe {{
            width: 100%;
            height: 500px;
            border: none;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }}
        .insights {{
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-left: 4px solid #38bdf8;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
        }}
        .insights h3 {{
            color: #0c4a6e;
            margin-bottom: 10px;
        }}
        .insights ul {{
            margin-left: 20px;
        }}
        .insights li {{
            margin: 8px 0;
        }}
        .footer {{
            text-align: center;
            color: rgba(255, 255, 255, 0.8);
            padding: 20px;
            margin-top: 40px;
        }}
        @media (max-width: 768px) {{
            .container {{ padding: 10px; }}
            .header {{ padding: 20px; }}
            .header h1 {{ font-size: 1.8em; }}
            .section {{ padding: 20px; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 QQTalker机器人数据分析报告</h1>
            <p>基于运行日志的深度分析 | 生成本报告时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card cyan">
                <div class="stat-label">总消息数</div>
                <div class="stat-value">{usage['total_messages']:,}</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-label">AI调用次数</div>
                <div class="stat-value">{usage['ai_calls']:,}</div>
            </div>
            <div class="stat-card pink">
                <div class="stat-label">TTS调用次数</div>
                <div class="stat-value">{usage['tts_calls']:,}</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-label">STT调用次数</div>
                <div class="stat-value">{usage['stt_calls']:,}</div>
            </div>
            <div class="stat-card success">
                <div class="stat-label">总事件数</div>
                <div class="stat-value">{usage['total_events']:,}</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📊 事件类型分布</h2>
            <div class="chart-container">
                <iframe src="event_distribution.html" class="chart-iframe"></iframe>
            </div>
            <div class="insights">
                <h3>📈 关键洞察</h3>
                <ul>
                    <li>消息事件占总事件的比例反映了机器人的活跃度</li>
                    <li>meta_event主要是心跳事件，显示了系统的稳定性</li>
                    <li>错误事件数量 ({usage['error_count']}) 表明系统运行相对稳定</li>
                </ul>
            </div>
        </div>
        
        <div class="section">
            <h2>⏰ 时间分布分析</h2>
            <div class="chart-container">
                <iframe src="hourly_messages.html" class="chart-iframe"></iframe>
            </div>
            <div class="insights">
                <h3>🕐 活跃时段分析</h3>
                <ul>
                    <li>通过每小时消息量分布，可以识别用户活跃高峰期</li>
                    <li>有助于优化AI插聊和定时任务的触发时间</li>
                </ul>
            </div>
        </div>
        
        <div class="section">
            <h2>📈 每日趋势</h2>
            <div class="chart-container">
                <iframe src="daily_trend.html" class="chart-iframe"></iframe>
            </div>
            <div class="insights">
                <h3>📊 趋势分析</h3>
                <ul>
                    <li>每日消息趋势显示机器人的使用模式</li>
                    <li>可以识别工作日与周末的使用差异</li>
                    <li>有助于预测系统负载和资源需求</li>
                </ul>
            </div>
        </div>
        
        <div class="section">
            <h2>👥 群组活跃度</h2>
            <div class="chart-container">
                <iframe src="group_activity.html" class="chart-iframe"></iframe>
            </div>
            <div class="insights">
                <h3>🏘️ 社群分析</h3>
                <ul>
                    <li>识别最活跃的群组，有助于了解主要用户群体</li>
                    <li>不同群组的活跃度差异反映了机器人的应用场景</li>
                </ul>
            </div>
        </div>
        
        <div class="section">
            <h2>🛠️ 服务使用对比</h2>
            <div class="chart-container">
                <iframe src="service_usage.html" class="chart-iframe"></iframe>
            </div>
            <div class="insights">
                <h3>💡 服务优化建议</h3>
                <ul>
                    <li>AI调用与消息数的比例反映了对话深度</li>
                    <li>TTS和STT的使用情况显示语音功能的受欢迎程度</li>
                    <li>根据使用数据可调整服务配置和资源分配</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>📊 本报告由 CodeBuddy 数据分析引擎自动生成 | 数据驱动决策，智能优化体验</p>
        </div>
    </div>
</body>
</html>
"""
        
        with open('qqtalker_analysis_report.html', 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print("\n✅ 分析报告已生成: qqtalker_analysis_report.html")

# 主程序
if __name__ == "__main__":
    # 指定日志文件路径
    log_file = "日志/1.txt"
    
    analyzer = QQTalkerLogAnalyzer(log_file)
    
    # 解析日志
    logs = analyzer.parse_logs()
    
    # 提取事件
    events_df = analyzer.extract_events()
    
    # 创建可视化
    results = analyzer.create_visualizations()
    
    # 生成HTML报告
    analyzer.generate_html_report(results)
    
    print("\n🎉 数据分析完成！请打开 qqtalker_analysis_report.html 查看完整报告")