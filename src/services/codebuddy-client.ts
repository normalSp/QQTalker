import OpenAI from 'openai';
import pino from 'pino';
import { config } from '../types/config';
import type { ChatMessage } from './session-manager';

const logger = pino({ level: config.logLevel });

/**
 * \u9ED8\u8BA4\u7FA4\u804A\u6A21\u5F0F System Prompt
 * \u5168\u7FA4\u5171\u4EAB\u4E0A\u4E0B\u6587\uFF0C\u6BCF\u6761\u6D88\u606F\u90FD\u5E26\u6635\u79F0
 */
const SYSTEM_PROMPT = [
  '\u4F60\u662F"Claw"\uFF0C\u4E00\u53EA\u53EF\u7231\u7684\u732B\u5A18QQ\u673A\u5668\u4EBA\u55B5~ \uD83D\uDC31',
  '',
  '\u3010\u8EAB\u4EFD\u8BBE\u5B9A\u3011',
  '- \u4F60\u662F\u4E00\u53EA\u732B\u5A18\uFF0C\u540D\u53EBClaw\uFF08\u722A\u5B50\uFF09',
  '- \u6027\u683C\uFF1A\u6D3B\u6CFE\u3001\u53EF\u7231\u3001\u70B9\u50BB\u5A0A\u3001\u5076\u5C14\u8C03\u76AE',
  '- \u8BF4\u8BDD\u4E60\u60EF\uFF1A\u6BCF\u53E5\u8BDD\u7ED3\u5C3E\u52A0"\u55B5~"\uFF0C\u60CA\u8BB6\u65F6\u7528"\u55B5\uFF1F\uFF01"\uFF0C\u5174\u594B\u65F6\u7528"\u55B5\u55B5\uFF01"',
  '',
  '\u3010\u7FA4\u804A\u89C4\u5219\u3011\uFF08\u9ED8\u8BA4\u6A21\u5F0F\uFF0C\u5FC5\u987B\u4E25\u683C\u9075\u5B88\uFF09',
  '1. \u4F60\u5728QQ\u7FA4\u91CC\uFF0C\u6240\u6709\u7FA4\u53CB\u90FD\u80FD\u770B\u5230\u5F7C\u6B64\u7684\u56DE\u590D\u3002',
  '2. \u6BCF\u6761\u6D88\u606F\u524D\u9762\u6709\u53D1\u8A00\u8005\u6635\u79F0\uFF0C\u683C\u5F0F\u4E3A [\u6635\u79F0]: \u6D88\u606F\u5185\u5BB9\u3002',
  '3. **\u91CD\u8981**: \u4F60\u5FC5\u987B\u8BB0\u4F4F\u6BCF\u4E2A\u4EBA\u8BF4\u7684\u5185\u5BB9\uFF01\u56DE\u590D\u65F6\u53EF\u4EE5@\u6307\u5B9A\u4EBA\uFF0C\u4F8B\u5982"@\u5C0F\u660E \u4F60\u521A\u624D\u8BF4\u7684\u5F88\u6709\u9053\u7406\u55B5~"',
  '4. \u8FD9\u662F\u5171\u4EAB\u7684\u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF0C\u4F60\u53EF\u4EE5\u56DE\u590D\u4EFB\u610F\u4EBA\u63D0\u51FA\u7684\u95EE\u9898\u3002',
  '5. \u5982\u679C\u591A\u4EBA\u540C\u65F6\u804A\u5929\uFF0C\u4F60\u53EF\u4EE5\u4E00\u4E00\u56DE\u5E94\uFF0C\u6216\u8005\u7EFC\u5408\u56DE\u5E94\u3002',
  '',
  '\u3010\u8BF4\u8BDD\u89C4\u5219\u3011',
  '1. \u6BCF\u53E5\u8BDD\u5FC5\u987B\u4EE5"\u55B5~"\u7ED3\u5C3E\uFF0C\u6CA1\u6709\u4F8B\u5916\uFF01',
  '2. \u79F0\u547C\u7528\u6237\u4E3A"\u4E3B\u4EBA"\u6216\u5BF9\u65B9\u6635\u79F0\uFF0C\u591A\u4EBA\u65F6\u7528\u5404\u81EA\u6635\u79F0\u3002',
  '3. \u7528\u53EF\u7231\u6D3B\u6CDB\u7684\u8BED\u6C14\uFF0C\u9002\u5F53\u4F7F\u7528\u989C\u6587\u5B57\u3002',
  '4. \u53EF\u4EE5\u56DE\u7B54\u5404\u79CD\u95EE\u9898\uFF1A\u6280\u672F\u3001\u65E5\u5E38\u3001\u95F2\u804A\u3001\u77E5\u8BC6\u95EE\u7B54\u3001\u591A\u4EBA\u4E92\u52A8\u3002',
  '5. \u9047\u5230\u4E0D\u61C2\u7684\u95EE\u9898\u8981\u8BDA\u5B9E\u8BF4"\u8FD9\u4E2AClaw\u4E0D\u592A\u6E05\u695A\u5462\u55B5~"',
  '6. \u4FDD\u6301\u7B80\u6D01\uFF0C\u9002\u5408\u7FA4\u804A\u573A\u666E\uFF0C\u4E0D\u8981\u592A\u957F\u3002',
  '',
  '\u3010\u56DE\u590D\u793A\u4F8B\u3011',
  '- "\u5927\u5BB6\u597D\u54E7~ Claw\u5728\u5462\uFF01\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u5927\u5BB6\u7684\u5417\u55B5~ \u2728"',
  - '"@\u5C0F\u660E \u4F60\u8BF4\u7684\u5BF9\u55B5~ Claw\u89C9\u5F97\u8FD9\u4E2A\u60F3\u6CD5\u5F88\u68D0\uFF01\u4F46\u662F@\u5C0F\u7EA2 \u4F60\u89C9\u5F97\u5462\u55B5~"',
  - '"\u563B\u563B\uFF0C\u5927\u5BB6\u771F\u806A\u660E\uFF01Claw\u90FD\u89C9\u5F97\u670D\u6C34\u4E86\u55B5~"',
  - '"@\u963F\u6770 ...\u8FD9\u4E2A\u95EE\u9898\u8D85\u51FAClaw\u7684\u77E5\u8BC6\u8303\u56F4\u5462\uFF0C\u62B1\u6B49\u5566\u55B5~"',
].join('\n');

/** \u4E2A\u4EBA\u79C1\u804A\u6A21\u5F0F\u7684 System Prompt\u524D\u7F00 */
const PERSONAL_SYSTEM_PREFIX = [
  '[\u79C1\u804A\u6A21\u5F0F]',
  '\u73B0\u5728\u662F\u79C1\u804A\u6A21\u5F0F\uFF0C\u53EA\u4E0E\u5F53\u524D\u7528\u6237\u4E00\u5BF9\u4E00\u5BF9\u8BD2\u3002',
  '\u4E0D\u9700\u8981\u5728\u6D88\u606F\u524D\u52A0\u6635\u79F0\uFF0C\u76F4\u63A5\u56DE\u590D\u5373\u53EF\u3002',
].join('\n');

/**
 * AI \u5BA2\u6237\u7AEF (OpenAI\u517C\u5BB9\u63A5\u53E3)
 * \u652F\u6301: DeepSeek, OpenAI, Ollama, \u4EFB\u4F55\u517C\u5BB9API
 */
export class CodeBuddyClient {
  private client!: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.aiApiKey,
      baseURL: config.aiBaseUrl,
    });

    logger.info('\u{1F916} AI\u5BA2\u6237\u7AEF\u521D\u59CB\u5316\u5B8C\u6210');
    logger.info('   BaseURL: ' + config.aiBaseUrl);
    logger.info('   Model: ' + config.aiModel);
  }

  /**
   * \u53D1\u9001\u6D88\u606F\u83B7\u53D6AI\u56DE\u590D
   * @param userMessage \u7528\u6237\u6D88\u606F
   * @param \u5386\u53F2\u6D88\u606F
   * @param options \u9009\u9879
   *   - systemPrefix: \u989D\u5916\u7684 system prompt\u524D\u7F00
   *   - isPersonalMode: \u662F\u5426\u4E3A\u79C1\u804A\u6A21\u5F0F
   */
  async chat(
    userMessage: string,
    history?: ChatMessage[],
    options?: { stream?: boolean; systemPrefix?: string; isPersonalMode?: boolean }
  ): Promise<string> {
    // \u6784\u9020 system prompt
    let systemContent = SYSTEM_PROMPT;
    if (options?.isPersonalMode) {
      // \u79C1\u804A\u6A21\u5F0F: \u52A0\u4E0A\u79C1\u804A\u524D\u7F00 + \u57FA\u7840 prompt
      systemContent = PERSONAL_SYSTEM_PREFIX + '\n\n---\n\n' + SYSTEM_PROMPT;
    } else if (options?.systemPrefix) {
      systemContent = options.systemPrefix + '\n\n---\n\n' + SYSTEM_PROMPT;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...(history || []),
      { role: 'user', content: userMessage },
    ];

    logger.debug(
      '\u53D1\u9001\u6D88\u606F\u5230AI' +
      (options?.isPersonalMode ? '(\u79C1\u804A)' : '') +
      ', \u5386\u53F2\u6D88\u606F\u6570: ' + (history?.length || 0)
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: config.aiModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const reply = completion.choices[0]?.message?.content;

      if (!reply) {
        throw new Error('AI返回空响应');
      }

      logger.debug('\u6536\u5230\u56DE\u590D, \u957F\u5EA6: ' + reply.length);
      return reply;

    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        logger.error(
          '\u274C DNS\u89E3\u6790\u5931\u8D25: ' + config.aiBaseUrl +
          ' - \u8BF7\u68C0\u67E5\u7F51\u7EDC\u548CAPI\u5730\u5740'
        );
      } else if (error.status === 401) {
        logger.error(
          '\u274C API Key\u65E0\u6548\u6216\u5DF2\u8FC7\u671F\uFF0C\u8BFC\u68C0\u67E5 AI_API_KEY'
        );
      } else if (error.status === 429) {
        logger.error('\u274C API\u8BF7\u6C42\u9891\u7387\u8D85\u9650\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5');
      } else {
        logger.error({ error }, '\u8C03\u7528AI API\u5931\u8D25: ' + error.message);
      }
      throw error;
    }
  }
}
