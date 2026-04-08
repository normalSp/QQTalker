import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqlJsAdapter } from '../src/storage/sqljs-adapter';
import { SelfLearningService } from '../src/plugins/self-learning/self-learning-service';
import { SelfLearningStore } from '../src/plugins/self-learning/self-learning-store';
import { runAdvancedLearningAnalysis } from '../src/plugins/self-learning/advanced-analysis';

const tempFiles: string[] = [];

function createService() {
  const filePath = path.resolve(process.cwd(), 'temp', `self-learning-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  tempFiles.push(filePath);
  const store = new SelfLearningStore(new SqlJsAdapter(filePath));
  const service = new SelfLearningService(store);
  return { store, service };
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
});

describe('SelfLearningService advanced flow', () => {
  it('captures realtime signals, runs advanced learning, and approves persona review', async () => {
    const { store, service } = createService();
    await service.initialize();

    const baseTime = Date.now();
    const inputs = [
      { userId: 2001, nickname: 'Alice', text: '我喜欢奶茶哈哈！怎么办呀，宝贝你怎么看', rawMessage: '[CQ:at,qq=2002]我喜欢奶茶哈哈！怎么办呀，宝贝你怎么看' },
      { userId: 2002, nickname: 'Bob', text: '谢谢你呀，我们明天一起去喝奶茶吧', rawMessage: '[CQ:at,qq=2001]谢谢你呀，我们明天一起去喝奶茶吧' },
      { userId: 2001, nickname: 'Alice', text: '听说隔壁群也在聊这个梗，笑死我了哈哈', rawMessage: '听说隔壁群也在聊这个梗，笑死我了哈哈' },
      { userId: 2003, nickname: 'Cindy', text: '我最近在准备考试，老师布置的作业好多', rawMessage: '我最近在准备考试，老师布置的作业好多' },
      { userId: 2002, nickname: 'Bob', text: '加油呀，我支持你，别太焦虑', rawMessage: '[CQ:at,qq=2003]加油呀，我支持你，别太焦虑' },
    ];

    for (let i = 0; i < inputs.length; i += 1) {
      await service.captureMessage({
        groupId: 1001,
        userId: inputs[i].userId,
        nickname: inputs[i].nickname,
        text: inputs[i].text,
        rawMessage: inputs[i].rawMessage,
        isAtBot: i === 0,
        createdAt: baseTime + i * 1000,
      });
    }

    const overview = await service.getOverview();
    expect(overview.messages).toBeGreaterThanOrEqual(5);

    const styles = await service.listStyles(1001, 2001);
    expect(styles.some(item => item.patternType.includes('filler'))).toBe(true);

    const memories = await service.listMemories(1001, 2001);
    expect(memories.some(item => item.key.startsWith('like:'))).toBe(true);

    const report = await service.runLearningCycleForGroup(1001);
    expect(report.sceneScores.length).toBeGreaterThan(0);
    expect(report.clusters.length).toBeGreaterThanOrEqual(1);

    const advancedSummary = await service.getAdvancedSummary(1001);
    expect(advancedSummary?.summary).toContain('分析');

    const reviews = await service.listPersonaReviews(1001);
    expect(reviews.length).toBeGreaterThan(0);

    await service.approvePersonaReview(reviews[0].id!);
    const snapshot = await store.getActivePersonaSnapshot(1001);
    expect(snapshot?.content).toContain('高级学习结果');

    await store.close();
  });

  it('exports, imports, clears, and rebuilds group learning data', async () => {
    const source = createService();
    const target = createService();
    await source.service.initialize();
    await target.service.initialize();

    const baseTime = Date.now();
    const rows = [
      { userId: 3101, nickname: 'Mika', text: '我喜欢抹茶，也想下周一起去探店', rawMessage: '我喜欢抹茶，也想下周一起去探店' },
      { userId: 3102, nickname: 'Nagi', text: '谢谢你提醒我，明天我来做攻略', rawMessage: '[CQ:at,qq=3101]谢谢你提醒我，明天我来做攻略' },
      { userId: 3101, nickname: 'Mika', text: '这个梗真的笑死我了哈哈', rawMessage: '这个梗真的笑死我了哈哈' },
    ];

    for (let i = 0; i < rows.length; i += 1) {
      await source.service.captureMessage({
        groupId: 2002,
        userId: rows[i].userId,
        nickname: rows[i].nickname,
        text: rows[i].text,
        rawMessage: rows[i].rawMessage,
        isAtBot: i === 1,
        createdAt: baseTime + i * 1000,
      });
    }

    await source.service.runLearningCycleForGroup(2002);
    const bundle = await source.service.exportLearningData(2002);
    expect(bundle.scope.groups).toContain(2002);
    expect(bundle.counts.capturedMessages).toBeGreaterThanOrEqual(3);

    const cleared = await source.service.clearLearningData(2002);
    expect(cleared.capturedMessages).toBeGreaterThanOrEqual(3);
    expect((await source.service.getOverview()).messages).toBe(0);

    const imported = await target.service.importLearningData(bundle, 'replace');
    expect(imported.importedGroups).toContain(2002);

    const targetOverview = await target.service.getOverview();
    expect(targetOverview.messages).toBeGreaterThanOrEqual(3);

    const rebuilt = await target.service.rebuildAnalysisSnapshots(2002);
    expect(rebuilt.snapshots.length).toBeGreaterThan(0);
    expect(rebuilt.runs.length).toBeGreaterThan(0);

    await source.store.close();
    await target.store.close();
  });
});

describe('runAdvancedLearningAnalysis', () => {
  it('produces scene, cluster and memory graph summaries', () => {
    const report = runAdvancedLearningAnalysis([
      { groupId: 1, userId: 11, nickname: 'A', text: '我喜欢奶茶哈哈，梗王说明天一起去吗', rawMessage: '[CQ:at,qq=12]我喜欢奶茶哈哈，梗王说明天一起去吗', isAtBot: false, createdAt: 1 },
      { groupId: 1, userId: 12, nickname: 'B', text: '好呀宝贝，梗王又来了，我们一起去，恭喜你考试结束', rawMessage: '[CQ:at,qq=11]好呀宝贝，梗王又来了，我们一起去，恭喜你考试结束', isAtBot: false, createdAt: 2 },
      { groupId: 1, userId: 13, nickname: 'C', text: '听说最近有新梗，梗王这个称呼笑死我了哈哈', rawMessage: '听说最近有新梗，梗王这个称呼笑死我了哈哈', isAtBot: false, createdAt: 3 },
      { groupId: 1, userId: 11, nickname: 'A', text: '我最近在准备项目上线，稍微有点焦虑，不过梗王今天状态不错', rawMessage: '我最近在准备项目上线，稍微有点焦虑，不过梗王今天状态不错', isAtBot: false, createdAt: 4 },
    ], [
      { groupId: 1, userId: 11, key: 'like:奶茶', content: '我喜欢奶茶', importance: 0.9, tags: ['奶茶', '喜欢'], updatedAt: 1 },
      { groupId: 1, userId: 11, key: 'recent:准备项目上线', content: '我最近在准备项目上线', importance: 0.8, tags: ['项目', '上线'], updatedAt: 2 },
    ]);

    expect(report.sceneScores.some(item => item.scene === 'planning')).toBe(true);
    expect(report.slangInsights.length).toBeGreaterThanOrEqual(1);
    expect(report.memoryGraph.nodes.length).toBe(2);
    expect(report.personaPrompt).toContain('高级学习结果');
  });
});
