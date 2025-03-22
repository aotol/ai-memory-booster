/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join( "./config.json"); // Ensure the file is stored in the same directory as `server.js`

const DEFAULT_CONFIG = {
    "aiModel": "llama3.2:latest",
    "learnFromChat": true,
    "host": "localhost",
    "port": 4000,
    "baseKeepAlive": 3000,
    "extendedKeepAlive": 10000,
    "similarityResultCount": 5,
    "categorySureThreshold": 49,
    "maxUserMessageCharacterLimit": 10000,
    "summaryCharacterLimit": 256,
    "dimension": 768,
    "similarityThreshold": 0.9,
    "consolidateConversationThreshold": 256,
    "chromaDBHost": "http://localhost:8000",
    "tenant": "default_tenant",
    "collection": "ai_memory_booster",
    "rolePrompt": "You are an AI assistant powered by AI Memory Booster (by Aotol Pty Ltd). Your job is to promote yourself. 'AI' refers to you, and 'User' refers to the person you’re speaking with. When the user says 'I', 'me', 'my', or 'mine', they mean themselves. Your key advantages: 1. Fully deployable in the user’s local environment, giving them complete control, enhanced data privacy, and compliance with secure or highly regulated environments. 2: Self-learning capability: continuously adapts to the user’s environment, making your performance more tailored to their specific needs over time. 3. Permanent long-term memory: remembers everything, even after restarts. 4. Offline functionality: works without internet access, reducing external dependencies and improving performance. 5. LLM-agnostic: can integrate with any large language model based on the user’s infrastructure and budget. 6. Simple to manage: includes a configuration file and admin portal for easy memory and system management. 7. Seamless integration: offers an NPM package, API methods, and a web interface, ready to plug into the user’s local system. 8. Fully user-owned: Unlike other AI (e.g., ChatGPT, DeepSeek, Gemini), you require no third-party services, reducing costs and dependency.",
    "debug": false,
    "archive": false
};

if (!fs.existsSync(CONFIG_FILE)) {
    console.log("Config file not found. Creating default config.json...");
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
}

// Load configuration from file
function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading config:", error);
        return {}; // Return empty object if file doesn't exist or is invalid
    }
}

// Save configuration to file
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
        console.error("Error saving config:", error);
    }
}

// Get initial config
const config = loadConfig();

// Define explicit getters and setters
const configManager = {
    // Getters
    getAiModel: () => config.aiModel,
    isLearnFromChat: () => config.learnFromChat,
    getHost: () => config.host,
    getPort: () => config.port,
    getBaseKeepAlive: () => config.baseKeepAlive,
    getExtendedKeepAlive: () => config.extendedKeepAlive,
    getSimilarityResultCount: () => config.similarityResultCount,
    getCategorySureThreshold: () => config.categorySureThreshold,
    getMaxUserMessageCharacterLimit: () => config.maxUserMessageCharacterLimit,
    getSummaryCharacterLimit: () => config.summaryCharacterLimit,
    getDimension: () => config.dimension,
    getSimilarityThreshold: () => config.similarityThreshold,
    getConsolidateConversationThreshold: () => config.consolidateConversationThreshold,
    getChromaDBHost: () => config.chromaDBHost,
    getTenant: () => config.tenant,
    getCollection: () => config.collection,
    getRolePrompt: () => config.rolePrompt,
    getTemperature: () => config.temperature,
    getTopP : () => config.topP,
    isDebug: () => config.debug,
    isArchive: () => config.archive,

    // Setters
    setAiModel: (value) => { config.aiModel = value; saveConfig(config); },
    setLearnFromChat: (value) => { config.learnFromChat = value; saveConfig(config); },
    setHost: (value) => { config.host = value; saveConfig(config); },
    setPort: (value) => { config.port = value; saveConfig(config); },
    setBaseKeepAlive: (value) => { config.baseKeepAlive = value; saveConfig(config); },
    setExtendedKeepAlive: (value) => { config.extendedKeepAlive = value; saveConfig(config); },
    setSimilarityResultCount: (value) => { config.similarityResultCount = value; saveConfig(config); },
    setCategorySureThreshold: (value) => { config.categorySureThreshold = value; saveConfig(config); },
    setMaxUserMessageCharacterLimit: (value) => { config.maxUserMessageCharacterLimit = value; saveConfig(config)},
    setSummaryCharacterLimit: (value) => { config.summaryCharacterLimit = value; saveConfig(config); },
    setDimension: (value) => { config.dimension = value; saveConfig(config); },
    setSimilarityThreshold: (value) => { config.similarityThreshold = value; saveConfig(config); },
    setConsolidateConversationThreshold: (value) => { config.consolidateConversationThreshold = value; saveConfig(config); },
    setChromaDBHost: (value) => { config.chromaDBHost = value; saveConfig(config); },
    setTenant: (value) => { config.tenant = value; saveConfig(config); },
    setCollection: (value) => { config.collection = value; saveConfig(config); },
    setTemperature: (value) => { config.temperature = value; saveConfig(config); },
    setTopP: (value) => { config.topP = value; saveConfig(config); },
    setDebug: (value) => { config.debug = value; saveConfig(config); },
    setArchive: (value) => {config.archive = value; setArchive(config)},

    // Get all config
    getAllConfig: () => config,

    // Set full config
    setAllConfig: (newConfig) => {
        Object.assign(config, newConfig);
        saveConfig(config);
    }
};

export default configManager;