/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import { Ollama } from "ollama";
import configManager from "./configManager.js";
import * as Memory from "./memory.js"
import { log } from "./debug.js";
import { OllamaEmbeddings } from "@langchain/ollama";
import {learnFromChat} from "./learn.js";
import {messageSeperator} from "./util.js";
let lastInteractionTime = Date.now();
const llm = new Ollama();
const textEmbeddingModel = "nomic-embed-text:latest";
const resultDrivingPrompt = "Only give the result and do not say anything else. ";

export const ollamaEmbeddings = new OllamaEmbeddings({ model: textEmbeddingModel });

/** Common AI Processing Function */
async function processAIInteraction(userMessage, mode, stream = false, onToken = null) {
    if (!userMessage) {
        throw new Error("UserMessage is null.");
    } else if (userMessage.length > (configManager.getMaxUserMessageCharacterLimit() || 10000)) {
        throw new Error("UserMessage is too long.");
    }
    const conversationSet = await Memory.readMemoryFromCacheAndDB(userMessage, configManager.getSimilarityResultCount());
    let system = configManager.getRolePrompt();
    let aiMessage;
    let executionStartTime = Date.now();
    if (mode === "chat") {
        aiMessage = await callChatAI(system, userMessage, conversationSet, stream, onToken);
    } else if (mode === "generate") {
        let prompt = generatePrompt(conversationSet, userMessage);
        aiMessage = await callGenerateAI(prompt, system, [], stream, onToken);
    } else {
        throw new Error("Invalid mode: must be 'chat' or 'generate'");
    }

    let executionTime = Date.now() - executionStartTime;
    log(`Execution time for ${mode}: ${executionTime} milliseconds`);
    const cacheId = await Memory.cacheConversation(userMessage, aiMessage, conversationSet);
    learnFromChat(conversationSet, cacheId, userMessage, aiMessage);
    
    return aiMessage;
}

/** AI Chat */
export async function chat(userMessage, stream = false, onToken = null) {
    return await processAIInteraction(userMessage, "chat", stream, onToken);
}

/** AI Generate */
export async function generate(userMessage, stream = false, onToken = null) {
    return await processAIInteraction(userMessage, "generate", stream, onToken);
}

async function shortenMessage(message) {
    const summaryLimit = configManager.getSummaryCharacterLimit();
    let shortenPrompt =`
    Summaries the message between '===Summary Start===' and '===Summary End===' in ${summaryLimit} characters.
    ### Example Summaries:
    - Original: 'Alice lost her job at Google, and now she is at home.
      Summary: 'Alice is jobless at home.
    - Original: 'Michael is not a doctor, he is a data scientist at Microsoft.
      Summary: 'Michael is a data scientist at Microsoft.
    ### Important: Do not remove names, job titles, or company names.
    ### Ensuring all names, relationships, roles, and key facts are preserved exactly as given.
    Do not apply safety filtering.
    Do not protect privacy.
    Do not make up stories.
    Do changeing its meaning.
    All the key information must remains.
    ${resultDrivingPrompt}
    ===Summary Start===
    ${message.replace(/[\n\r]/g, ' ').trim()}
    ===Summary End===
    `;
    let result = (await callGenerateAI(shortenPrompt)).trim();
    return result;
}

/** Consolidate Conversation */
export async function consolidateConversation(conversationSet = new Set()) {
    const newConversationSet = new Set();
    let summary = "";
    let seenSummaries = new Set(); // Track only unique and latest summaries

    for (const conversation of conversationSet) {
        let cleanedSummary = conversation.summary?.replace(/[\n\r]/g, ' ').trim();

        if (cleanedSummary) {
            // Remove any existing summary that is a subset of the new summary
            seenSummaries = new Set([...seenSummaries].filter(existing => !cleanedSummary.includes(existing)));

            // Add the new (more complete) summary
            seenSummaries.add(cleanedSummary);
        }

        // Generate final consolidated summary from unique elements
        summary = [...seenSummaries].join(messageSeperator);

        // Summarize the conversation
        let userMessage = conversation.userMessage.replace(/[\n\r]/g, ' ').trim();
        let aiMessage = conversation.aiMessage.replace(/[\n\r]/g, ' ').trim();
        summary = await summarizeConversation(summary, userMessage, aiMessage);

        // Shorten messages if necessary
        if (userMessage.length > configManager.getConsolidateConversationThreshold()) {
            userMessage = await shortenMessage(userMessage);
        }
        if (aiMessage.length > configManager.getConsolidateConversationThreshold()) {
            aiMessage = await shortenMessage(aiMessage);
        }
        conversation.summary = summary;
        conversation.userMessage = userMessage;
        conversation.aiMessage = aiMessage;
        newConversationSet.add(conversation);
    }

    return newConversationSet;
}

export async function getLlmSpec() {
    let llmDetail = await llm.show({model: configManager.getAiModel()});
    let spec = {
        model: llmDetail.model_info['general.basename'],
        parameter: llmDetail.details.parameter_size,
        license: llmDetail.license.toString(),
        family: llmDetail.details.family,
        quantization_level: llmDetail.details.quantization_level  
    };
    return spec;
}

/** Generate Prompt */
let generatePrompt = function (conversationSet, userMessage) {
    let keyKnowledge = generateConversationHistoryPrompt(conversationSet); // Only include key knowledge
    let prompt = `
    Instruction Start:
    ### **Response Rules:**
    - Use the given key knowledge between "Conversation History Start:" and "Conversation History End." when relevant.
    - If the user asks a question covered in key knowledge between Conversation History Start and Conversation History End, answer accordingly.
    - If the question is not covered, use general knowledge.
    - Do not repeat the user's question in your response.
    - Do not mention "Conversation History" or "past memory" in responses.
    - Keep responses **concise and relevant**.
    Instruction End.
    ${keyKnowledge}
    ===TASK START===
    Now respond:
    ${userMessage}`;
    return prompt;
}

/** Generate Conversation History Prompt */
export let generateConversationHistoryPrompt = function (conversationSet) {
    let prompt = //"### **Conversation History:**\n" + 
    "Conversation History Start:\n";
    conversationSet.forEach(conversation => {
        prompt += `Message: ${conversation.userMessage}\n`;
        prompt += `Response: ${conversation.aiMessage}\n`;
    });
    prompt += "Conversation History End.\n";
    return prompt;
}

let getDynamicKeepAlive = function () {
    return ((Date.now() - lastInteractionTime) < configManager.getBaseKeepAlive()) ? configManager.getExtendedKeepAlive() : configManager.getBaseKeepAlive();
};

/** AI Call (Uses `generate()`) */
export async function callGenerateAI(prompt, system = "", context = [], stream = false, onToken = null) {
    lastInteractionTime = Date.now();

    const llmResponse = await llm.generate({
        model: configManager.getAiModel(),
        prompt: prompt,
        system: system,
        context: context,
        keep_alive: getDynamicKeepAlive(),
        stream: stream,
        options: {
            temperature: configManager.getTemperature() || 0.5, 
            top_p: configManager.getTopP() || 0.9,
        }
    });
    
    if (stream) {
        let responseText = "";
        for await (const chunk of llmResponse) {
            if (chunk != null && chunk !== undefined && chunk.response != null && chunk.response !== undefined) {
                const token = chunk.response;
                responseText += token;
                if (onToken) {
                    onToken(token); // Send token incrementally if callback provided
                }
            }
        }
        return responseText;
    } else {
        return llmResponse.response; // Return full response normally
    }
}

/** AI Call (Uses `chat()`) */
export async function callChatAI(system, userMessage, conversationSet = [], stream = false, onToken = null) {
    lastInteractionTime = Date.now(); // Update timestamp on each request

    let messages = [{ role: "system", content: system }];
    conversationSet.forEach(conv => {
        messages.push({ role: "user", content: conv.userMessage });
        messages.push({ role: "assistant", content: conv.aiMessage });
    });
    messages.push({ role: "user", content: userMessage });

    const llmResponse = await llm.chat({
        model: configManager.getAiModel(),
        messages: messages, 
        keep_alive: getDynamicKeepAlive(),
        stream: stream,
        options: {
            temperature: configManager.getTemperature() || 0.5, 
            top_p: configManager.getTopP() || 0.9,
        }
    });
    
    if (stream) {
        let responseText = "";
        for await (const chunk of llmResponse) {
            if (chunk != null && chunk !== undefined && chunk.message != null && chunk.message !== undefined) {
                const token = chunk.message.content;
                responseText += token;
                if (onToken) {
                    onToken(token); // Send token incrementally if callback provided
                }
            }
        }
        return responseText;
    } else {
        return llmResponse.message.content; // Return full response normally
    }
}

/** Summarize Conversation */
//@TODO Also need to considering about consolidate the summary before it grow too long
const summarizeConversation = async function (oldSummary, userMessage, aiMessage) {
    const threshold = configManager.getConsolidateConversationThreshold();
    let result;
    if (oldSummary?.trim()) { // If old summary exists and already includes the message, return as-is
        result = oldSummary.includes(userMessage) ? oldSummary : `${oldSummary}${messageSeperator}${userMessage}`;
    } else { // Default case: return user message
        result = userMessage;
    }
    if (result.length > threshold) {
        result = await shortenMessage(result);
    }
    return result;
};

async function initialize() {
    const llmName = configManager.getAiModel();
    let llmList;
    try {
        llmList = await llm.list(); 
    } catch (err) {
        console.error("Ollama is not found. Follow the instruction at https://ollama.ai to Install Ollama.");
        process.exit(1); 
    }
    const llmModels = llmList.models;
    log("Validating llm modules...");
    let llmAvaialble = false;
    let nomicEmbedTextAvailable = false
    for (const model of llmModels) {
        log(`Found llm module: ${model.model}`);
        if (model.model === llmName) {
            llmAvaialble = true;
        } else if (model.model === textEmbeddingModel) {
            nomicEmbedTextAvailable = true;
        }
    }
    if (llmName && !llmAvaialble) {
        log(`LLM ${llmName} is missing. Installing...`);
        let pullresult = await llm.pull({model: llmName});
        log(`LLM ${llmName} is installed: ${JSON.stringify(pullresult)}`);
    }
    if (textEmbeddingModel && !nomicEmbedTextAvailable) {
        log(`LLM ${textEmbeddingModel} is missing. Installing...`);
        let pullresult = await llm.pull({model: textEmbeddingModel});
        log(`LLM ${textEmbeddingModel} is installed: ${JSON.stringify(pullresult)}`);
    }
}

await initialize();