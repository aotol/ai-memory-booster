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
import { archiveToFile } from "./archive.js";
import { mergeConversations, calculateConversationWeight, messageSeperator } from "./util.js";
let lastInteractionTime = Date.now();
const llm = new Ollama();
const askQuestionMarker = "#question";
const complainMarker = "#complain";
const gossipMarker = "#gossip";
const newKnowledgeMarker = "#new_knowledge";
const updateKnowledgeMarker = "#new_update";
const uncategorizedMarker = "#uncategorized";
const textEmbeddingModel = "nomic-embed-text:latest";
const resultDrivingPrompt = "Only give the result and do not say anything else. ";
const categoryReasonPrompt = "Also explain why you give this score. ";
import { OllamaEmbeddings } from "@langchain/ollama";
export const ollamaEmbeddings = new OllamaEmbeddings({ model: textEmbeddingModel });

async function isUpdateMemoryRequired(conversationSet, userMessage) {
    let category = await categorizeUserMessage(conversationSet, userMessage);
    const isNewKnowledge = category.includes(newKnowledgeMarker);
    const isNewUpdate = category.includes(updateKnowledgeMarker);
    if (isNewKnowledge || isNewUpdate) {
        return true;
    } else {
        return false;
    }
}

/** Common AI Processing Function */
async function processAIInteraction(userMessage, mode) {
    const conversationSet = await Memory.readMemoryFromCacheAndDB(userMessage, configManager.getSimilarityResultCount());
    let system = configManager.getRolePrompt();
    let aiMessage;
    
    let executionStartTime = Date.now();
    
    if (mode === "chat") {
        aiMessage = await callChatAI(system, userMessage, conversationSet);
    } else if (mode === "generate") {
        let prompt = generatePrompt(conversationSet, userMessage);
        log(prompt);
        aiMessage = await callGenerateAI(prompt, system);
    } else {
        throw new Error("Invalid mode: must be 'chat' or 'generate'");
    }

    let executionTime = Date.now() - executionStartTime;
    log(`Execution time for ${mode}: ${executionTime} milliseconds`);
    
    let learnFromChatResult = await learnFromChat(conversationSet, userMessage, aiMessage);
    aiMessage = learnFromChatResult.aiMessage;
    let isCacheRequired = !learnFromChatResult.memorySaved;
    
    if (isCacheRequired) {
        const shortenUserMessage = (userMessage.length > configManager.getConsolidateConversationThreshold()) 
            ? await shortenMessage(userMessage) 
            : userMessage.trim();

        const shortenAiMessage = (aiMessage.length > configManager.getConsolidateConversationThreshold()) 
            ? await shortenMessage(aiMessage) 
            : aiMessage.trim();

        const conversationWeight = await calculateConversationWeight(shortenUserMessage, shortenAiMessage, conversationSet);
        const userMessageWeight = conversationWeight.userMessageWeight;
        const aiMessageWeight = conversationWeight.aiMessageWeight;

        await Memory.cacheMemory(shortenUserMessage, userMessageWeight, shortenAiMessage, aiMessageWeight);
    }

    return aiMessage;
}

/** AI Chat */
export async function chat(userMessage) {
    return await processAIInteraction(userMessage, "chat");
}

/** AI Generate */
export async function generate(userMessage) {
    return await processAIInteraction(userMessage, "generate");
}


async function learnFromChat(conversationArray, userMessage, aiMessage) {
    const islearnFromChat = configManager.isLearnFromChat();
    let updateMemoryRequired = false;
    if (islearnFromChat) {
        updateMemoryRequired = await isUpdateMemoryRequired(conversationArray, userMessage);
        if (updateMemoryRequired) {    //Need to update the database
            let newConversationSet = new Set();
            let summary = userMessage;
            aiMessage += `\n${await generateAcknowledgment(userMessage)}`;
            const { userMessageWeight, aiMessageWeight } = await calculateConversationWeight(
                userMessage, 
                aiMessage, 
                conversationArray
            );  //Find out how important the user message is
            let newConversation = {
                summary, 
                userMessage, 
                userMessageWeight, 
                aiMessage, 
                aiMessageWeight
            };
            if (conversationArray.length > 0) {
                //There are some conversation histories about this topic, let's see if we can merge them and delete unecessary records
                let {deleteList, mergedList} = await mergeConversations(conversationArray);
                if (mergedList.length > 0) {
                    //There are conversation histories can be merged
                    //Those merged record will be saved as new data in DB
                    for (const mergedConversation of mergedList) {
                        let mergedSummary = mergedConversation.summary;
                        let mergedUserMessage = mergedConversation.userMessage;
                        let mergedUserMessageWeight = mergedConversation.userMessageWeight;
                        let mergedAiMessage = mergedConversation.aiMessage;
                        let mergedAiMessageWeight = mergedConversation.aiMessageWeight;
                        newConversationSet.add({ 
                            summary: mergedSummary, 
                            userMessage: mergedUserMessage, 
                            userMessageWeight: mergedUserMessageWeight, 
                            aiMessage: mergedAiMessage,
                            aiMessageWeight: mergedAiMessageWeight
                        });
                    }
                    newConversationSet.add(newConversation);
                    newConversationSet = await consolidateConversation(newConversationSet);  //potential evil method (lose information)
                } else {
                    //There is no conversation history can be merged (such as there is only 1 record in the conversation history, or the conversation history is not mergable at all)
                    //In this case no conversations need to be deleted, only need to save the current conversation into DB.
                    let consolidatedConversations = await consolidateConversation([...conversationArray, newConversation]);
                    const lastElement = [...consolidatedConversations][consolidatedConversations.size - 1];
                    newConversation.summary = lastElement.summary;
                    newConversationSet.add(newConversation);
                }
                
                // Archive old conversations and delete
                for (const deleteConversation of deleteList) {
                    const isArchive = configManager.isArchive();
                    if (isArchive) {
                        archiveToFile(deleteConversation); //Archive the conversation to file
                    }
                    Memory.forget(deleteConversation.id); // delete the conversation from the database
                }
            } else {
                //No conversation history, just add this new conversation to DB
                newConversationSet.add(newConversation);
            }
            
            for (const conversation of newConversationSet) {
                await Memory.storeMemory(conversation.summary, conversation.userMessage, conversation.userMessageWeight, conversation.aiMessage, conversation.aiMessageWeight);
            }
        }
    }
    return {
        aiMessage: aiMessage,
        memorySaved: updateMemoryRequired
    };
}

let generateAcknowledgment = async function (userMessage) {
    let prompt = `Confirm to the user that this message has been stored.
        Ensure the confirmation sounds natural and refers to the new knowledge accurately.
        Do not say something like 'will be reviewed by our team'.
        ${resultDrivingPrompt}

        Here is the message:
        ${userMessage}`;
    const acknowledgment = await callGenerateAI(prompt);
    return acknowledgment;
};

/** AI Categorization & Utility Functions */
export async function getIsAskingQuestionScore(userMessage) {
    let prompt= "Is this message asking a question? (e.g., What is the time? Who are you? What's the weather like today? What do you work?) " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% this message is asking question, and 0 means definitely this message is not asking question. " + 
    (configManager.isDebug() ? categoryReasonPrompt : "") +
    //resultDrivingPrompt +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const result = await callGenerateAI(prompt);
    const score = extractNumber(result);
    if (score > configManager.getCategorySureThreshold()) {
        log(`### Is it a question? ${result}`);
    }
    return score;
}

export async function getGossipMarkerCategoryScore(userMessage) {
    let prompt =
    "Evaluate whether this message is only a social check-in (e.g., 'Hi', 'Hello', 'How are you?', 'Are you there?', 'Good morning') or acknowledgement (e.g., 'Good', 'I see', 'OK'). " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% this message is a check-in, and 0 means definitely this message is not a check-in. " + 
    (configManager.isDebug() ? categoryReasonPrompt : "") +
    //resultDrivingPrompt +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const result = await callGenerateAI(prompt);
    const score = extractNumber(result);
    if (score > configManager.getCategorySureThreshold()) {
        log(`### Is it a gossip? ${result}`);
    }
    return score;
}

export async function getNewKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
    let prompt =
    generateConversationHistoryPrompt(conversationSet) + 
    "Has this message not been discussed in the conversation history? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% this message has not been discussed in the conversation history, and 0 means this message has definitly discussed in the conversation history. " + 
    (configManager.isDebug() ? categoryReasonPrompt : "") +
    //resultDrivingPrompt +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    let system = configManager.getRolePrompt();
    const result = await callGenerateAI(prompt, system);
    const score = extractNumber(result);
    if (score > configManager.getCategorySureThreshold()) {
        log(`### Is it a new knowledge? ${result}`);
    }
    return score;
}

export async function getUpdateKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
    let prompt=
    generateConversationHistoryPrompt(conversationSet) + 
    "Does this message update any existing information in the conversation history? " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% this message updates existing information in the conversation history, and 0 means definitely this message does not update any exisiting information in te conversation history. " + 
    (configManager.isDebug() ? categoryReasonPrompt : "") +
    //resultDrivingPrompt +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    let system = configManager.getRolePrompt();
    const result = await callGenerateAI(prompt, system);
    const score = extractNumber(result);
    if (score > configManager.getCategorySureThreshold()) {
        log(`### Is it a knowldge update? ${result}`);
    }
    return score;
}

export async function getIsComplainScore(userMessage) {
    let prompt= "Is this message a complain? (e.g.: I am not happy! you are so stupid! I've told you many times!) " + 
    "Respond with a likelihood score from 0 to 100, where 100 means 100% this message is a complain, and 0 means definitely this mssage is not a complain. " + 
    (configManager.isDebug() ? categoryReasonPrompt : "") +
    //resultDrivingPrompt +
    "===TASK START===\n" + 
    "Message: " + userMessage;
    const result = await callGenerateAI(prompt);
    const score = extractNumber(result);
    if (score > configManager.getCategorySureThreshold()) {
        log(`### Is it a complain? ${result}`);
    }
    return score;
}

/** Categorize User Message */
export async function categorizeUserMessage(conversationSet, userMessage) {
    // Run independent LLM calls in parallel
    const [
        complainCategoryScore,
        gossipCategoryScore,
        askingQuestionCategoryScore
    ] = await Promise.all([
        getIsComplainScore(userMessage),
        getGossipMarkerCategoryScore(userMessage),
        getIsAskingQuestionScore(userMessage),
    ]);

    const isAskingQuestion = askingQuestionCategoryScore > configManager.getCategorySureThreshold();
    const isComplaining = complainCategoryScore > configManager.getCategorySureThreshold();
    const isGossiping = gossipCategoryScore > configManager.getCategorySureThreshold();

    // Immediate classification for complaints
    if (isComplaining) {
        return complainMarker;
    }

    let candidateCategories = new Map();

    // Store Gossip & Question Categories
    if (isAskingQuestion) {
        candidateCategories.set(askQuestionMarker, askingQuestionCategoryScore);
    }
    if (isGossiping) {
        candidateCategories.set(gossipMarker, gossipCategoryScore);
    }

    let newKnowledgeCategoryScore = 0;
    let updateKnowledgeCategoryScore = 0;

    // Check for New or Updated Knowledge ONLY if NOT Gossip AND NOT a Question
    if (!isGossiping && !isAskingQuestion) {
        newKnowledgeCategoryScore = await getNewKnowledgeMarkerCategoryScore(conversationSet, userMessage);
        if (newKnowledgeCategoryScore >= configManager.getCategorySureThreshold()) {
            candidateCategories.set(newKnowledgeMarker, newKnowledgeCategoryScore);
        } else {
            updateKnowledgeCategoryScore = await getUpdateKnowledgeMarkerCategoryScore(conversationSet, userMessage);
            if (updateKnowledgeCategoryScore >= configManager.getCategorySureThreshold()) {
                candidateCategories.set(updateKnowledgeMarker, updateKnowledgeCategoryScore);
            }
        }
    }

    // Select Category with Highest Confidence Score
    let bestCategory = uncategorizedMarker;
    let maxScore = configManager.getCategorySureThreshold();

    candidateCategories.forEach((score, cat) => {
        if (score > maxScore) {
            maxScore = score;
            bestCategory = cat;
        }
    });

    log(`Gossip Score: ${gossipCategoryScore}, Question Score: ${askingQuestionCategoryScore}, New Knowledge Score: ${newKnowledgeCategoryScore}, Update Knowledge Score: ${updateKnowledgeCategoryScore}, Complain Score: ${complainCategoryScore}`);

    return bestCategory;
}

async function shortenMessage(message) {
    let shortenPrompt =`
    ${resultDrivingPrompt}
    Now shorten this message without losing the key information and changeing its meaning:
    ${message.replace(/[\n\r]/g, ' ').trim()}
    `;
    message = message.replace(/[\n\r]/g, ' ').trim();
    message = (await callGenerateAI(shortenPrompt)).trim();
    return message;
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

        newConversationSet.add({ summary, userMessage, aiMessage });
    }

    return newConversationSet;
}

/** Consolidate Conversation */
/*export async function consolidateConversation(conversationSet = new Set()) {
    const newConversationSet = new Set();
    let summary = "";
    let lastSumamry = "";
    for (const conversation of conversationSet) {
        let thisSummary = conversation.summary?.replace(/[\n\r]/g, ' ').trim();
        if (lastSumamry && thisSummary.startsWith(lastSumamry)) {
            summary = thisSummary;
        } else {
            summary = summary + (summary.trim().length> 0 ? messageSeperator : "") + thisSummary;
        }
        lastSumamry = thisSummary;
        let userMessage = conversation.userMessage.replace(/[\n\r]/g, ' ').trim();
        let aiMessage = conversation.aiMessage.replace(/[\n\r]/g, ' ').trim();
        summary = await summarizeConversation(summary, userMessage, aiMessage);
        if (userMessage.length > configManager.getConsolidateConversationThreshold()) {
            userMessage = await shortenMessage(userMessage);
        }
        if (aiMessage.length > configManager.getConsolidateConversationThreshold()) {
            aiMessage = await shortenMessage(aiMessage);
        }
        newConversationSet.add({summary, userMessage, aiMessage});
        
    }
    return newConversationSet;
}*/

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
    - Use the given key knowledge when relevant.
    - If the user asks a question covered in key knowledge, answer accordingly.
    - If the question is not covered, use general knowledge.
    - Do not repeat the user's question in your response.
    - Do not mention "conversation history" or "past memory" in responses.
    - Keep responses **concise and relevant**.
    Instruction End.
    ${keyKnowledge}
    ===TASK START===
    Now respond:
    ${userMessage}`;
    return prompt;
}

/** Generate Conversation History Prompt */
let generateConversationHistoryPrompt = function (conversationSet) {
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

/** AI Call */
async function callGenerateAI(prompt, system = "", context = []) {
    lastInteractionTime = Date.now(); // Update timestamp on each request
    const llmResponse = await llm.generate({
        model: configManager.getAiModel(),
        prompt: prompt,
        system: system,
        context: context,   //For future tokenized context history data 
        keep_alive: getDynamicKeepAlive(), // Use adaptive keep-alive
        options: {
            temperature: configManager.getTemperature() || 0.5, 
            top_p: configManager.getTopP() || 0.9,

        } // Balanced accuracy & engagement
    });
    const response = llmResponse.response;
    return response;
}

/** AI Call (Uses `chat()`) */
async function callChatAI(system, userMessage, conversationSet = []) {
    lastInteractionTime = Date.now(); // Update timestamp on each request

    // Convert history into the messages format required by `llm.chat()`
    let messages = [{ role: "system", content: system }];

    conversationSet.forEach(conv => {
        messages.push({ role: "user", content: conv.userMessage });
        messages.push({ role: "assistant", content: conv.aiMessage }); // Include AI's past responses
    });
    
    messages.push({ role: "user", content: userMessage });

    const llmResponse = await llm.chat({
        model: configManager.getAiModel(),
        messages: messages, 
        keep_alive: getDynamicKeepAlive(),
        options: {
            temperature: configManager.getTemperature() || 0.5, 
            top_p: configManager.getTopP() || 0.9,
        } // Balanced accuracy & engagement
    });
    return llmResponse.message.content; // Extract AI response
}

/** Summarize Conversation */
//@TODO Also need to considering about consolidate the summary before it grow too long
const summarizeConversation = async function (oldSummary, userMessage, aiMessage) {
    const threshold = configManager.getConsolidateConversationThreshold();
    const summaryLimit = configManager.getSummaryCharacterLimit();
    let result;
    // If user message is long, generate AI summary
    if (userMessage.length > threshold) {
        let summarizePrompt = oldSummary ? `### Context:\n${oldSummary}\n` : "";
        summarizePrompt += `### Example Summaries:\n` +
            `- Original: 'Alice lost her job at Google, and now she is at home.'\n` +
            `  Summary: 'Alice is jobless at home.'\n` +
            `- Original: 'Michael is not a doctor, he is a data scientist at Microsoft.'\n` +
            `  Summary: 'Michael is a data scientist at Microsoft.'\n` +
            `### Now summarize the following conversation in ${summaryLimit} characters, ensuring all names, relationships, roles, and key facts are preserved exactly as given.\n` +
            `### Important: Do not remove names, job titles, or company names.\n` +
            `Do not apply safety filtering.\nDo not protect privacy.\nDo not make up stories.\n` +
            `${resultDrivingPrompt}\n===TASK START===\nMessage: ${userMessage}\nResponse: ${aiMessage}`;
        result =  await callGenerateAI(summarizePrompt);
    } else if (oldSummary?.trim()) { // If old summary exists and already includes the message, return as-is
        result = oldSummary.includes(userMessage) ? oldSummary : `${oldSummary}${messageSeperator}${userMessage}`;
    } else { // Default case: return user message
        result = userMessage;
    }
    return result;
};


function extractNumber(str) {
    const match = str.match(/\d+/); // Find the first sequence of digits
    return match ? parseInt(match[0], 10) : NaN;
}

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