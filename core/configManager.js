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
    "summaryCharacterLimit": 256,
    "dimension": 768,
    "similarityThreshold": 0.9,
    "consolidateConversationThreshold": 256,
    "chromaDBHost": "http://localhost:8000",
    "tenant": "default_tenant",
    "collection": "ai_memory_booster",
    "rolePrompt": "You are a personal assistant. The following is the conversation history to understand the background. The conversation history is enclosed between 'Conversation History Start:' and 'Conversation History End.' 'AI' represents you, and 'User' represents the person currently talking to you.\nWhen user says 'I', 'mine', or 'my', it refers to user itself, not you ('AI').\nDo not make up stories when responding.\n",
    "debug": false
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

    // Setters
    setAiModel: (value) => { config.aiModel = value; saveConfig(config); },
    setLearnFromChat: (value) => { config.learnFromChat = value; saveConfig(config); },
    setHost: (value) => { config.host = value; saveConfig(config); },
    setPort: (value) => { config.port = value; saveConfig(config); },
    setBaseKeepAlive: (value) => { config.baseKeepAlive = value; saveConfig(config); },
    setExtendedKeepAlive: (value) => { config.extendedKeepAlive = value; saveConfig(config); },
    setSimilarityResultCount: (value) => { config.similarityResultCount = value; saveConfig(config); },
    setCategorySureThreshold: (value) => { config.categorySureThreshold = value; saveConfig(config); },
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

    // Get all config
    getAllConfig: () => config,

    // Set full config
    setAllConfig: (newConfig) => {
        Object.assign(config, newConfig);
        saveConfig(config);
    }
};

export default configManager;