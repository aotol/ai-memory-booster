/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import { storeMemory, retrieveMemory, forget, forgetAll } from "./memory.js";
import { getLlmSpec, chat, generate } from "./llm.js";
import configManager from "./configManager.js";

/** Export core AI Memory Booster functions */
export default {
    storeMemory,
    retrieveMemory,
    chat,
    generate,
    forget,
    forgetAll,
    getLlmSpec,
    configManager
};