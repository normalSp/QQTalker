module.exports = {
  id: 'example-echo',
  name: 'ExampleEcho',

  async onMessage(context) {
    if (context.isAtBot && context.finalText.includes('示例插件')) {
      console.log('[ExampleEcho] received:', context.finalText);
    }
  },

  async handleCommand(context) {
    if (context.normalizedText !== '/echo_plugin') {
      return { handled: false };
    }
    return {
      handled: true,
      reply: '示例插件工作正常，你已经成功接入一个外部 QQTalker 插件了喵~',
    };
  },

  beforeChat() {
    return {
      pluginId: 'example-echo',
      sections: ['外部示例插件已启用：如用户提到“示例插件”，可简短确认插件链路正常。'],
    };
  },

  getDashboardRoutes() {
    return [
      {
        method: 'GET',
        path: '/api/example-plugin/ping',
        handler: () => ({
          data: {
            success: true,
            plugin: 'example-echo',
          },
        }),
      },
    ];
  },
};
