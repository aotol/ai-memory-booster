import {
    jest
} from '@jest/globals';

// Mock Ollama
jest.unstable_mockModule('ollama', () => ({
    Ollama: jest.fn().mockImplementation(() => ({
        generate: jest.fn(() => Promise.resolve({
            response: "mocked-response"
        })),
        chat: jest.fn(),
        list: jest.fn(() => Promise.resolve({
            models: [{
                model: 'mock-model'
            }]
        })),
        pull: jest.fn(() => Promise.resolve({}))
    }))
}));

// Mock Memory
jest.unstable_mockModule('../core/memory.js', () => ({
    addToVectorStore: jest.fn(),
    queryVectorStore: jest.fn(),
    storeMemory: jest.fn(),
    forget: jest.fn(),
    getMemoryFromCacheById: jest.fn(() => ({})),
    updatetMemoryCache: jest.fn()
}));

// Mock Utils
jest.unstable_mockModule('../core/util.js', () => ({
    cosineSimilarity: jest.fn(() => 0.95),
    adjustVectorSize: jest.fn((v) => v),
    calculateConversationWeight: jest.fn(() => ({
        userMessageWeight: 50,
        aiMessageWeight: 50
    })),
    extractNumber: jest.fn(() => 99), // Force category score > threshold
    mergeConversations: jest.fn(async (convSet) => ({
        deleteList: [],
        mergedList: Array.from(convSet)
    })),
    messageSeparator: " | "
}));

// Mock Debug
jest.unstable_mockModule('../core/debug.js', () => ({
    log: jest.fn()
}));

// Mock Config
jest.unstable_mockModule('../core/configManager.js', () => ({
    default: {
        getAiModel: jest.fn(() => "mock-model"),
        isLearnFromChat: jest.fn(() => true),
        isDebug: jest.fn(() => true),
        isArchive: jest.fn(() => false),
        getCategorySureThreshold: jest.fn(() => 49),
        getTemperature: jest.fn(() => 0.5),
        getTopP: jest.fn(() => 0.9),
        getBaseKeepAlive: jest.fn(() => 3000),
        getExtendedKeepAlive: jest.fn(() => 10000),
        getSimilarityResultCount: jest.fn(() => 5),
        getRolePrompt: jest.fn(() => "mock system prompt"),
        getConsolidateConversationThreshold: jest.fn(() => 256),
        getSummaryCharacterLimit: jest.fn(() => 256),
        getDimension: jest.fn(() => 768),
    }
}));

// Mock LLM categorization functions to always trigger "new knowledge"
jest.unstable_mockModule('../core/llm.js', () => ({
    generateConversationHistoryPrompt: jest.fn(),
    callGenerateAI: jest.fn(() => Promise.resolve("99")), // extractNumber → 99
    consolidateConversation: jest.fn((set) => Promise.resolve(set))
}));

describe('learn.js', () => {
    let learn;
    let memory;
    let util;
    let configManager;

    beforeEach(async () => {
        memory = await import('../core/memory.js');
        util = await import('../core/util.js');
        learn = await import('../core/learn.js');
        configManager = (await import('../core/configManager.js')).default;
    });

    it('should add learning when new knowledge is detected', async () => {
        const conversationArray = [{
            summary: "test Summary",
            userMessage: "test user message",
            userMessageWeight: 50,
            aiMessage: "test ai message",
            aiMessageWeight: 30,
            timestamp: 1234567890
        }];

        const cacheId = '123';
        const userMessage = 'Remember this message I am a test. It is important.';
        const aiMessage = 'Understand.';

        memory.queryVectorStore.mockResolvedValueOnce([]); // No existing embedding
        memory.addToVectorStore.mockResolvedValueOnce(true);

        await learn.learnFromChat(conversationArray, cacheId, userMessage, aiMessage);

        expect(util.extractNumber).toHaveBeenCalled();
        expect(configManager.getCategorySureThreshold).toHaveBeenCalled();
    });

    it('should skip learning if similarity is high', async () => {
        // Force high similarity → skip learning
        memory.queryVectorStore.mockResolvedValueOnce([{
            embedding: [1, 1, 1]
        }]);
        util.cosineSimilarity.mockReturnValueOnce(0.99);

        const conversationSet = new Set([{
            userMessage: 'X',
            aiMessage: 'Y'
        }]);
        await learn.learnFromChat(conversationSet, '123', 'user msg', 'ai msg');

        expect(util.mergeConversations).not.toHaveBeenCalled(); // Early exit
        expect(memory.storeMemory).not.toHaveBeenCalled();
    });
});