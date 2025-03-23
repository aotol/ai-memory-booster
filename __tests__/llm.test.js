import {
  jest
} from '@jest/globals';

jest.unstable_mockModule('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    generate: jest.fn(),
    list: jest.fn().mockResolvedValue({
      models: []
    }),
    pull: jest.fn().mockResolvedValue({})
  }))
}));

jest.unstable_mockModule('../core/configManager.js', () => ({
  default: {
    getMaxUserMessageCharacterLimit: jest.fn(() => 10000),
    isLearnFromChat: jest.fn(() => true),
    getSimilarityResultCount: jest.fn(() => 5),
    getRolePrompt: jest.fn(() => "mock system prompt"),
    getConsolidateConversationThreshold: jest.fn(() => 256),
    getSummaryCharacterLimit: jest.fn(() => 256),
    getAiModel: jest.fn(() => "mock-model"),
    getTemperature: jest.fn(() => 0.5),
    getTopP: jest.fn(() => 0.9),
    getBaseKeepAlive: jest.fn(() => 3000),
    getExtendedKeepAlive: jest.fn(() => 10000)
  }
}));

jest.unstable_mockModule('../core/memory.js', () => ({
  readMemoryFromCacheAndDB: jest.fn(() => Promise.resolve([])),
  cacheConversation: jest.fn(() => Promise.resolve('mock-cache-id')),
  queryVectorStore: jest.fn(),
  addToVectorStore: jest.fn()
}));

jest.unstable_mockModule('../core/learn.js', () => ({
  learnFromChat: jest.fn()
}));

jest.unstable_mockModule('../core/debug.js', () => ({
  log: jest.fn()
}));

describe('llm.js', () => {
  it('chat() should return message content', async () => {
    const llmModule = await import('../core/llm.js');
    const ollamaInstance = (await import('ollama')).Ollama.mock.results[0].value;

    ollamaInstance.chat.mockResolvedValueOnce({
      message: {
        content: 'mocked chat response'
      }
    });

    const res = await llmModule.chat('hello');
    expect(res).toBe('mocked chat response');
  });

  it('generate() should return generation response', async () => {
    const llmModule = await import('../core/llm.js');
    const ollamaInstance = (await import('ollama')).Ollama.mock.results[0].value;

    ollamaInstance.generate.mockResolvedValueOnce({
      response: 'mocked generation response'
    });

    const res = await llmModule.generate('generate something');
    expect(res).toBe('mocked generation response');
  });
});