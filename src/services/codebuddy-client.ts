import OpenAI from 'openai';
import { logger } from '../logger';
import { config } from '../types/config';
import type { ChatMessage } from './session-manager';
import { DEFAULT_PERSONA_SYSTEM_PROMPT, PERSONAL_MODE_SYSTEM_PREFIX } from './persona-service';




const SYSTEM_PROMPT = DEFAULT_PERSONA_SYSTEM_PROMPT;

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
    options?: { stream?: boolean; systemPrefix?: string; systemPrompt?: string; isPersonalMode?: boolean; model?: string }
  ): Promise<string> {
    // \u6784\u9020 system prompt
    let systemContent = options?.systemPrompt || SYSTEM_PROMPT;
    if (!options?.systemPrompt && options?.isPersonalMode) {
      // \u79C1\u804A\u6A21\u5F0F: \u52A0\u4E0A\u79C1\u804A\u524D\u7F00 + \u57FA\u7840 prompt
      systemContent = PERSONAL_MODE_SYSTEM_PREFIX + '\n\n---\n\n' + SYSTEM_PROMPT;
    } else if (!options?.systemPrompt && options?.systemPrefix) {
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
      ', \u5386\u53F2\u6D88\u606F\u6570: ' + (history?.length || 0) +
      ', \u5386\u53F2\u6458\u8981: ' + (history || []).map((m, i) =>
        `[${i}][${m.role}] ${(m.content || '').substring(0, 40)}`
      ).join(' ||| ') +
      ' | \u5F53\u524D: ' + userMessage.substring(0, 60)
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: options?.model || config.aiModel,
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
