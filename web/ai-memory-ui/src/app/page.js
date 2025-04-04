"use client";
/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from 'remark-breaks';

export default function Home() {
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [mode, setMode] = useState("chat"); 
    const [userMessage, setUserMessage] = useState("");
    const [aiMessage, setAiMessage] = useState("");
    const [memoryQuery, setMemoryQuery] = useState("");
    const [memorySummary, setMemorySummary] = useState("");
    const [retrievedMemories, setRetrievedMemories] = useState([]);
    const [llmSpec, setLlmSpec] = useState(null);
    const [version, setVersion] = useState("");
    const [showSpec, setShowSpec] = useState(false);
    const [config, setConfig] = useState({});
    const [configText, setConfigText] = useState(""); // For editing JSON
    const chatEndRef = useRef(null); // Auto-scroll ref
    const [isSending, setIsSending] = useState(false);
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]); 

    const handleModeChange = (event) => {
        setMode(event.target.value);
    };

    // Load configuration when the page opens
    useEffect(() => {
        fetchConfig();
        fetchSystem();
    }, []);

    // Send AI Message
    const sendMessage = async () => {
        if (!chatInput.trim() || isSending) return;
        const userMessage = chatInput.trim();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setChatInput("");
    
        // Ensure user message is displayed immediately
        setMessages((prev) => [...prev, { sender: "User", text: userMessage }]);
    
        const endpoint = mode === "chat" ? "/api/chat" : "/api/generate";
    
        try {
            setIsSending(true); // Disable button
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userMessage, timeZone }),
            });
    
            if (!response.body) return;
    
            const reader = response.body.getReader();
            let aiMessage = ""; // Store the response text
    
            // Add an empty AI response placeholder in the chat
            setMessages((prev) => [...prev, { sender: "AI", text: "" }]);
    
            const updateLastMessage = (text) => {
                setMessages((prev) => {
                    const updatedMessages = [...prev];
                    updatedMessages[updatedMessages.length - 1] = { sender: "AI", text };
                    return updatedMessages;
                });
            };
    
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
    
                const token = new TextDecoder().decode(value); // Not needed anymore
                aiMessage += token; // Directly append the token
                updateLastMessage(aiMessage);
            }
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setIsSending(false); // Re-enable button after response
        }
    };

    // Store Memory
    const storeMemory = async () => {
        if (!memorySummary.trim() && !userMessage.trim()) return;

        const finalUserMessage = userMessage.trim() || memorySummary.trim();
        const finalAiMessage = aiMessage.trim() || "OK";

        try {
            const response = await fetch("/api/store-memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    summary: memorySummary, 
                    userMessage: finalUserMessage, 
                    aiMessage: finalAiMessage 
                }),
            });

            const data = await response.json();
            alert(data.message);
            setMemorySummary("");
            setUserMessage("");
            setAiMessage("");
        } catch (error) {
            console.error("Error storing memory:", error);
        }
    };

    // Retrieve Memory
    const retrieveMemory = async () => {
        try {
            const response = await fetch("/api/retrieve-memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userMessage: memoryQuery }),
            });

            const data = await response.json();
            setRetrievedMemories(data.reverse());
            alert("Memory Retrieved.");
        } catch (error) {
            console.error("Error retrieving memory:", error);
        }
    };

    const handleDeleteMemory = async (id) => {
        try {
            const response = await fetch(`/api/forget?id=${id}`, { method: "GET" });
            if (response.ok) {
                setRetrievedMemories((prevMemories) => prevMemories.filter((memory) => memory.id !== id));
            } else {
                alert("Failed to delete memory");
                console.error("Failed to delete memory");
            }
        } catch (error) {
            alert(error);
            console.error("Error deleting memory:", error);
        }
    };

    // Fetch LLM Model Specs
    const fetchLlmSpec = async () => {
        try {
            const response = await fetch("/api/spec");
            const data = await response.json();
            setLlmSpec(data);
            setShowSpec(true);
        } catch (error) {
            console.error("Error fetching LLM spec:", error);
        }
    };

    // Fetch system info
    const fetchSystem = async () => {
        try {
            const response = await fetch("/api/system");
            const data = await response.json();
            const version = data.version;
            setVersion(version);
        } catch (error) {
            console.error("Error fetching LLM spec:", error);
        }
    };

    // Forget all stored memory
    const forgetMemory = async () => {
        try {
            if (!confirm("Are you sure to delete all the memories?")) {
                return;
            }
            const response = await fetch("/api/forget", { method: "GET" });
            const data = await response.json();
            let responseMessage = data.message;
            console.log("responseMessage = " + responseMessage);
            setMessages([]);
            setRetrievedMemories([]);
            alert(responseMessage);
        } catch (error) {
            console.error("Error forgetting memory:", error);
        }
    };

    // Fetch Config
    const fetchConfig = async (confirm = false) => {
        try {
            const response = await fetch("/api/config");
            const data = await response.json();
            setConfig(data);
            setConfigText(JSON.stringify(data, null, 2)); // Pretty JSON format
            if (confirm) {
                alert("Config reloaded.");
            }
        } catch (error) {
            console.error("Error fetching config:", error);
        }
    };

    // Update Config
    const updateConfig = async () => {
        try {
            const updatedConfig = JSON.parse(configText); // Parse edited JSON
            const response = await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedConfig),
            });

            const data = await response.json();
            alert(data.message);
            setConfig(data.config);
        } catch (error) {
            console.error("Error updating config:", error);
            alert("Invalid JSON format!");
        }
    };

    return (
        <div className="flex flex-col items-center min-h-screen p-4 bg-gray-100">
            <h1 className="text-2xl font-bold mb-4">AI Memory Booster Chat <span className="text-xs text-gray-500 font-thin">(Version: {version})</span></h1>
            {/* Chat / Generate Toggle */}
            <div className="flex items-center mb-4 space-x-4">
                <label className="font-semibold">Mode:</label>

                <label className="flex items-center space-x-2">
                    <input
                        type="radio"
                        name="mode"
                        value="chat"
                        checked={mode === "chat"}
                        onChange={handleModeChange}
                        className="h-4 w-4"
                    />
                    <span>Chat</span>
                </label>

                <label className="flex items-center space-x-2">
                    <input
                        type="radio"
                        name="mode"
                        value="generate"
                        checked={mode === "generate"}
                        onChange={handleModeChange}
                        className="h-4 w-4"
                    />
                    <span>Generate</span>
                </label>
            </div>
            {/* Chat Window */}
            <div className="w-full max-w-2xl bg-white shadow-lg rounded-lg p-4 h-96 overflow-y-auto mb-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`p-2 my-1 ${msg.sender === "User" ? "text-blue-700" : "text-green-700"}`}>
                        <div className="inline-flex">
                            <strong>{msg.sender}:&nbsp;</strong>
                            <span>
                                <ReactMarkdown remarkPlugins={[remarkBreaks]}>{msg.text}</ReactMarkdown>
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="flex w-full max-w-2xl">
                <input
                    type="text"
                    className="flex-grow p-2 border rounded-l-lg"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />&nbsp;
                <button className={`px-4 py-2 rounded-r-lg transition-colors ${isSending ? "bg-gray-400 cursor-not-allowed text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`} disabled={isSending} onClick={sendMessage}>
                    Send
                </button>
            </div>

            {/* LLM Spec Modal */}
            {showSpec && llmSpec && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg w-96">
                        <h2 className="text-lg font-semibold">LLM Model Specification</h2>
                        <p><strong>Model:</strong> {llmSpec.model}</p>
                        <p><strong>Parameters:</strong> {llmSpec.parameter}</p>
                        <p><strong>Family:</strong> {llmSpec.family}</p>
                        <p><strong>Quantization Level:</strong> {llmSpec.quantization_level}</p>
                        <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded-lg" onClick={() => setShowSpec(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Retrieve Memory Section */}
            <div className="mt-6 w-full max-w-2xl bg-white shadow-lg rounded-lg p-4">
                <h2 className="text-lg font-semibold">Retrieve Memory</h2>
                <input
                    type="text"
                    className="w-full p-2 border rounded-lg mt-2"
                    placeholder="Enter search query..."
                    value={memoryQuery}
                    onChange={(e) => setMemoryQuery(e.target.value)}
                />
                {/* Display Retrieved Memories */}
                <div className="mt-4">
                    {retrievedMemories.length > 0 ? (
                        retrievedMemories.map((memory, index) => (
                            <div key={index} className="p-2 border-b">
                                <div className="text-xs text-gray-500">
                                    {/* Delete button using Unicode cross (✖) */}
                                    <span><button
                                        onClick={() => handleDeleteMemory(memory.id)}
                                        className="text-red-500 hover:text-red-700 ml-0 p-1 rounded-full"
                                        aria-label="Delete Memory"
                                    >✖</button></span>
                                    <span>{new Date(memory.timestamp).toLocaleString()}</span>&nbsp;|&nbsp;
                                    <span>{memory.id}</span>
                                </div>
                                <strong>Summary:</strong> {memory.summary}
                                <br />
                                <span className="text-blue-700"><strong>User:&nbsp;</strong> {memory.userMessage}</span><span className="text-xs text-gray-500">(Weight: {memory.userMessageWeight})</span>
                                <br />
                                <span className="text-green-700"><strong>AI:&nbsp;</strong> {memory.aiMessage}</span><span className="text-xs text-gray-500">(Weight: {memory.aiMessageWeight})</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No memories found.</p>
                    )}
                </div>

                <button className="bg-green-500 text-white px-4 py-2 rounded-lg mt-2" onClick={retrieveMemory}>
                    Retrieve
                </button>
                &nbsp;
                {/* Forget Memory Button */}
                <button className="mt-4 bg-red-500 text-white px-4 py-2 rounded-lg" onClick={forgetMemory}>
                    Forget All Memories
                </button>
            &nbsp;
            </div>

            {/* Store Memory Section */}
            <div className="mt-6 w-full max-w-2xl bg-white shadow-lg rounded-lg p-4">
                <h2 className="text-lg font-semibold">Store Memory</h2>
                <input
                type="text"
                className="w-full p-2 border rounded-lg mt-2"
                placeholder="Enter summary..."
                value={memorySummary}
                onChange={(e) => setMemorySummary(e.target.value)}
                />
                <input
                type="text"
                className="w-full p-2 border rounded-lg mt-2"
                placeholder="Enter user message..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                />
                <input
                type="text"
                className="w-full p-2 border rounded-lg mt-2"
                placeholder="Enter AI message..."
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                />
                <button className="bg-blue-500 text-white px-4 py-2 rounded-lg mt-2" onClick={storeMemory}>
                    Store
                </button>
            </div>

            {/* Config Management Section */}
            <div className="mt-6 w-full max-w-2xl bg-white shadow-lg rounded-lg p-4">
                <h2 className="text-lg font-semibold">Configuration Management</h2>
                <button className="bg-gray-500 text-white px-4 py-2 rounded-lg mt-2" onClick={() => fetchConfig(true)}>  
                    Reload Config
                </button>
                <textarea
                    className="w-full p-2 border rounded-lg mt-2 h-48"
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                />
                <button className="bg-blue-500 text-white px-4 py-2 rounded-lg mt-2" onClick={updateConfig}>
                    Update Config
                </button>
                &nbsp;
                {/* Show LLM Spec Button */}
                <button className="mt-4 bg-gray-600 text-white px-4 py-2 rounded-lg" onClick={fetchLlmSpec}>
                Show LLM Spec
            </button>
            </div>
        </div>
    );
}
