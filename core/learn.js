/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import configManager from "./configManager.js";
import * as Memory from "./memory.js"
import { log } from "./debug.js";
import { archiveToFile } from "./archive.js";
import { mergeConversations, calculateConversationWeight, extractNumber } from "./util.js";
const askQuestionMarker = "#question";
const complainMarker = "#complain";
const gossipMarker = "#gossip";
const newKnowledgeMarker = "#new_knowledge";
const updateKnowledgeMarker = "#new_update";
const uncategorizedMarker = "#uncategorized";
const categoryReasonPrompt = "Also explain why you give this score. ";
import {generateConversationHistoryPrompt, callGenerateAI, consolidateConversation} from "./llm.js"

export async function learnFromChat(conversationArray, cacheId = null, userMessage, aiMessage) {
    const islearnFromChat = configManager.isLearnFromChat();
    let updateMemoryRequired = false;
    if (islearnFromChat) {
        updateMemoryRequired = await isUpdateMemoryRequired(conversationArray, userMessage);
        if (updateMemoryRequired) {    //Need to update the database
            const messageStoredConfirmation = " Your message has been stored.";
            let newConversationSet = new Set();
            let summary = userMessage;
            //Update cache for AI response
            if (cacheId) {
                let cachedMemory = Memory.getMemoryFromCacheById(cacheId);
                aiMessage += `\n${messageStoredConfirmation}`;
                cachedMemory.aiMessage = aiMessage;
                Memory.updatetMemoryCache(cachedMemory);
            }
            
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
    return updateMemoryRequired;
}  //Learn from chat end

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

/** Categorize User Message */
async function categorizeUserMessage(conversationSet, userMessage) {
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

/** AI Categorization & Utility Functions */
async function getIsAskingQuestionScore(userMessage) {
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

async function getGossipMarkerCategoryScore(userMessage) {
    let prompt =
    "Evaluate whether this message is a greeting or acknowledge (e.g., 'Hi', 'Hello', 'How are you?', 'Are you there?', 'Good morning', 'Good', 'I see', 'OK'). " + 
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

async function getNewKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
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

async function getUpdateKnowledgeMarkerCategoryScore(conversationSet, userMessage) {
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

async function getIsComplainScore(userMessage) {
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
