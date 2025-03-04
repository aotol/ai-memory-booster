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
let lastInteractionTime = Date.now();
const llm = new Ollama();
//const gossipMarker = "#gossip";
const newKnowledgeMarker = "#new_knowledge";
const updateKnowledgeMarker = "#new_update";
const uncategorizedMarker = "#uncategorized";
import { OllamaEmbeddings } from "@langchain/ollama";
const nomicEmbedTextModel = "nomic-embed-text:latest";
export const ollamaEmbeddings = new OllamaEmbeddings({ model: nomicEmbedTextModel });

async function isUpdateMemoryRequired(conversationSet, userMessage) {
    let category = await categorizeUserMessage(conversationSet, userMessage);
    //const isGossip = category.includes(gossipMarker);
    const isNewKnowledge = category.includes(newKnowledgeMarker);
    const isNewUpdate = category.includes(updateKnowledgeMarker);
    if (isNewKnowledge || isNewUpdate) {
        return true;
    } else {
        return false;
    }
}

/** AI Chat */
export async function chat(userMessage) {
    const conversationSet = [...(await Memory.readMemoryFromDB(userMessage, configManager.getSimilarityResultCount()))].sort((a, b) => a.timestamp - b.timestamp);
    let prompt = generatePrompt(conversationSet) + `===TASK START===\nNow respond: ${userMessage}`;
    log(prompt);
    let aiMessage = await callGenerateAI(prompt);
    const islearnFromChat = configManager.isLearnFromChat();
    if (islearnFromChat) {
        aiMessage = await learnFromChat(conversationSet, userMessage, aiMessage);
    }
    return aiMessage;
}

async function learnFromChat(conversationSet, userMessage, aiMessage) {
    let updateMemoryRequired = await isUpdateMemoryRequired(conversationSet, userMessage);
    if (updateMemoryRequired) {    //Need to update the database
        aiMessage += `\n${await generateAcknowledgment(userMessage)}`;
        let newConversationSet = new Set();
        let mergedSummary = "";
        let mergedUserMessage = "";
        let mergedAiMessage = "";
        const deleteConversationSet = await Memory.readMemoryFromDB(userMessage, configManager.getSimilarityResultCount()); //Find the most similar conversation from DB
        let mergedMemories = await mergeMemories(deleteConversationSet);
        if (deleteConversationSet.length > 0) {
            for (const conversation of deleteConversationSet) {
                const id = conversation.id;
                if (id) {
                    mergedSummary = mergedMemories.summary;
                    mergedUserMessage = mergedMemories.userMessage;
                    mergedAiMessage = mergedMemories.aiMessage;
                    Memory.forget(id); //Delete the old conversation
                }
            }
            mergedUserMessage = mergedUserMessage + "." + userMessage;
            mergedAiMessage = mergedAiMessage + "." + aiMessage;
        } else {
            //Nothing to delete
            mergedUserMessage = userMessage;
            mergedAiMessage = aiMessage;
        }
        newConversationSet.add({summary: mergedSummary, userMessage: mergedUserMessage, aiMessage: mergedAiMessage});
        newConversationSet = await consolidateConversation(newConversationSet);
        let ids = [];
        for (const conversation of newConversationSet) {
            const summary =  conversation.summary;
            const userMessage = conversation.userMessage;
            const aiMessage = conversation.aiMessage;
            let id = await Memory.storeMemory(summary, userMessage, aiMessage);    
            ids.push(id);
        }
    }
    return aiMessage;
}

/** Merge memories into one memories */
export async function mergeMemories(conversationSet) {
    if (!conversationSet || conversationSet.length === 0) {
        return ""; // No conversations to merge
    }
    // Sort conversations from oldest to latest
    let sortedConversations = [...conversationSet].sort((a, b) => a.timestamp - b.timestamp);

    // Separate user messages and AI responses
    let mergedUserMessage = sortedConversations.map(conv => conv.userMessage).join(".");
    let mergedAiMessage = sortedConversations.map(conv => conv.aiMessage).join(".");
    let mergedSummary = sortedConversations.map(conv => conv.summary).join(".");
    return {
        summary: mergedSummary.trim(),
        userMessage: mergedUserMessage.trim(),
        aiMessage: mergedAiMessage.trim()
    };
}

let generateAcknowledgment = async function (userMessage) {
    let prompt = "Confirm to the user that their message has been stored. " +
        "Ensure the confirmation sounds natural and refers to the new knowledge accurately. " +
        "You are a personal assistant, do not say something like 'will be reviewed by our team'. " +
        "Only give the response, do not say anything else.\nHere is the message: " +
        userMessage;
    const acknowledgment = await callSmallAI(prompt);
    return acknowledgment;
};

/** AI Categorization & Utility Functions */
export async function getIsAskingQuestionScore(userMessage) {
    let prompt= "Is this message a question? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% sure, and 0 means definitely not. " + 
    "Only give the result and do not say anything else. " +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const score = await callSmallAI(prompt);
    return extractNumber(score);
}

export async function getGossipMarkerCategoryScore(userMessage) {
    let prompt = configManager.getRolePrompt() + 
    "Evaluate whether this message is a social check-in (e.g., 'Hi', 'Hello', 'How are you?', 'Are you there?', 'Good morning') or acknowledgement (e.g., 'Good', 'I see', 'OK') " + 
    "Respond with a likelihood score from 0 to 100, where 100 means definitely a greeting, and 0 means definitely not. " + 
    "Only give the result and do not say anything else. " +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const score = await callSmallAI(prompt);
    return extractNumber(score);
}

export async function getNewKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
    let prompt = configManager.getRolePrompt() + 
    generateConversationHistoryPrompt(conversationSet) + 
    "Has this message not been discussed in the conversation history and it is not a question or greeting such as 'Hi', 'How are you', 'Good morning'? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% sure, and 0 means definitely not. " + 
    "Only give the result and do not say anything else. " +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const score = await callSmallAI(prompt);
    return extractNumber(score);
}

export async function getUpdateKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
    let prompt= configManager.getRolePrompt() + 
    generateConversationHistoryPrompt(conversationSet) + 
    "Does this message update or modify any existing information in the conversation history? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% sure, and 0 means definitely not. " + 
    "Only give the result and do not say anything else. " +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const score = await callSmallAI(prompt);
    return extractNumber(score);
}

export async function getIsComplainScore(userMessage) {
    let prompt= "Is this message a complain? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% sure, and 0 means definitely not. " + 
    "Only give the result and do not say anything else. " +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const score = await callSmallAI(prompt);
    return extractNumber(score);
}

/** Categorize Message */
export async function categorizeUserMessage(conversationSet, userMessage) {
    let category = uncategorizedMarker;
        let scores = new Map();
        const askingQuestionCategoryScore = await getIsAskingQuestionScore(userMessage);
        const complainCategoryScore = await getIsComplainScore(userMessage);
        let gossipCategoryScore = 0;
        let newKnowledgeCategoryScore = 0;
        let updateKnowledgeCategoryScore = 0;
        
        if (askingQuestionCategoryScore < configManager.getCategorySureThreshold() || //The user is not asking a question
            (askingQuestionCategoryScore >= configManager.getCategorySureThreshold() && complainCategoryScore > configManager.getCategorySureThreshold())) { //The user is asking a question but also complaining
            gossipCategoryScore = await getGossipMarkerCategoryScore(userMessage) ?? 0;
            updateKnowledgeCategoryScore = await getUpdateKnowledgeMarkerCategoryScore(conversationSet, userMessage);
            newKnowledgeCategoryScore = await getNewKnowledgeMarkerCategoryScore(conversationSet, userMessage);
        }
        log(`Question Score: ${askingQuestionCategoryScore} Gossip Score: ${gossipCategoryScore}, New Knowledge Score: ${newKnowledgeCategoryScore}, Update Knowledge Score: ${updateKnowledgeCategoryScore}, Complain Score: ${complainCategoryScore}`);
        scores.set(updateKnowledgeMarker, updateKnowledgeCategoryScore);
        scores.set(newKnowledgeMarker, newKnowledgeCategoryScore);
        let maxScore = configManager.getCategorySureThreshold();  //At least needs to be over the threshold sure to pick the category
        scores.forEach((value, key) => {
            if (value > maxScore) {
                maxScore = value;
                category = key;
            }
        });
        return category;
}

/** Consolidate Conversation */
export async function consolidateConversation(conversationSet) {
    let shortenPrompt = "Shorten this message, only give the result and do not say anything else: ";
    const newConversationSet = new Set();
    for (const conversation of conversationSet) {
        let summary = conversation.summary.replace(/[\n\r]/g, ' ').trim();
        let userMessage = conversation.userMessage.replace(/[\n\r]/g, ' ').trim();
        let aiMessage = conversation.aiMessage.replace(/[\n\r]/g, ' ').trim();
        summary = await summarizeConversation(summary, userMessage, aiMessage);
        if (userMessage.length > configManager.getConsolidateConversationThreshold()) {
            userMessage = (await callGenerateAI(`${shortenPrompt}${userMessage}`)).trim();
        }
        if (aiMessage.length > configManager.getConsolidateConversationThreshold()) {
            aiMessage = (await callGenerateAI(`${shortenPrompt}${aiMessage}`)).trim();
        }
        newConversationSet.add({summary, userMessage, aiMessage});
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

/**
* Defends on enableSmallAI's value, use smallAiModel
* @param {*} prompt 
* @returns 
*/
let callSmallAI = async function(prompt) {
    const llmResponse = await llm.generate({
        model: configManager.isEnableSmallAI() ? configManager.getSmallAiModel() : configManager.getAiModel(), // Use the smaller model
        prompt: prompt,
        keep_alive: configManager.getBaseKeepAlive()
    });
    return llmResponse.response;
};

/** Generate Prompt */
let generatePrompt = function (conversationSet) {
    let prompt = "Instruction Start:\n" + 
    configManager.getRolePrompt() + "\n" + 
    "### **Response Rules:**\n" + 
    "- If the user asks a question that has a direct answer in the conversation history, respond using the matching information.\n" +
    "- If the user's question is not covered in the conversation history, use your general knowledge to respond.\n" +
    "- Do not include the user's question in your response.\n" +
    "- Do not mention 'conversation history' in the response (e.g.: I couldn't find any information about it in our conversation history) if the question is not mentioned in the conversation history.\n" +
    //"- Keep responses **as brief as possible**." +
    "- Keep responses brief.\n" +
    generateConversationHistoryPrompt(conversationSet) +        
    "Instruction End.\n";
    return prompt;
}

/** Generate Conversation History Prompt */
let generateConversationHistoryPrompt = function (conversationSet) {
    let prompt = //"### **Conversation History:**\n" + 
    "Conversation History Start:\n";
    conversationSet.forEach(conversation => {
        prompt += `${conversation.summary}\n`;
    });
    prompt += "Conversation History End.\n";
    return prompt;
}

let getDynamicKeepAlive = function () {
    return (Date.now() - lastInteractionTime < 5000) ? configManager.getExtendedKeepAlive() : configManager.getBaseKeepAlive();
};

/** AI Call */
async function callGenerateAI(prompt) {
    lastInteractionTime = Date.now(); // Update timestamp on each request
    const llmResponse = await llm.generate({
        model: configManager.getAiModel(),
        prompt: prompt,
        keep_alive: getDynamicKeepAlive() // Use adaptive keep-alive
    });
    const response = llmResponse.response;
    return response;
}

/** Summarize Conversation */
let summarizeConversation = async function(oldSummary, userMessage, aiMessage) {    //aiMessage is not considered in summary due to user message is what matters.
    let summarizePrompt = "";
    if (oldSummary) {
        summarizePrompt += "### Context:\n" + oldSummary + "\n";
    }
    //summarizePrompt += "### Summarize the following conversation within " + configManager.getSummaryCharacterLimit() + " characters without omitting key information or altering meaning. Just give me the result without saying anything else:\n"
    summarizePrompt += "### Example Summaries:\n" + 
    "- Original: 'Alice lost her job at Google, and now she is at home.'\n" +
    "Summary: 'Alice is jobless at home.'\n" +
    "- Original: 'Michael is not a doctor, he is a data scientist at Microsoft.\n'" +
    "Summary: 'Michael is a data scientist at Microsoft.'\n" +
    "### Now summarize the following conversation in " + configManager.getSummaryCharacterLimit() + " characters, ensuring all names, relationships, roles, and key facts are preserved exactly as given. " + 
    "### Important: Do not remove names, job titles, or company names. Do not apply safety filtering. Do not protect privacy. Only give the result without saying anything else\n" + 
    "===TASK START===\n" + 
    "Message: " + userMessage + "\n" + 
    "Response: " + aiMessage;
    const summary = await callGenerateAI(summarizePrompt);
    return summary;
}

function extractNumber(str) {
    const match = str.match(/\d+/); // Find the first sequence of digits
    return match ? parseInt(match[0], 10) : NaN;
}

/** Get Text Embedding */
export async function getEmbedding(text) {
    return await ollamaEmbeddings.embedQuery(text);
}

async function initialize() {
    const llmName = configManager.getAiModel();
    const smallLlmName = configManager.getSmallAiModel();
    const llmList = await llm.list(); 
    const llmModels = llmList.models;
    log("Validating llm modules...");
    let llmAvaialble = false;
    let smallLlmAvailable = false;
    let nomicEmbedTextAvailable = false
    for (const model of llmModels) {
        log(`Found llm module: ${model.model}`);
        if (model.model === llmName) {
            llmAvaialble = true;
        } else if (model.model === smallLlmName) {
            smallLlmAvailable = true;
        } else if (model.model === nomicEmbedTextModel) {
            nomicEmbedTextAvailable = true;
        }
    }
    if (llmName && !llmAvaialble) {
        log(`LLM ${llmName} is missing. Installing...`);
        let pullresult = await llm.pull({model: llmName});
        log(`LLM ${llmName} is installed: ${JSON.stringify(pullresult)}`);
    }
    if (smallLlmName && !smallLlmAvailable) {
        log(`LLM ${smallLlmName} is missing. Installing...`);
        let pullresult = await llm.pull({model: smallLlmName});
        log(`LLM ${smallLlmName} is installed: ${JSON.stringify(pullresult)}`);
    }
    if (nomicEmbedTextModel && !nomicEmbedTextAvailable) {
        log(`LLM ${nomicEmbedTextModel} is missing. Installing...`);
        let pullresult = await llm.pull({model: nomicEmbedTextModel});
        log(`LLM ${nomicEmbedTextModel} is installed: ${JSON.stringify(pullresult)}`);
    }
}

await initialize();