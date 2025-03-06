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
import remarkGfm from "remark-gfm"; // Enables GitHub-style tables
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function Home() {
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [userMessage, setUserMessage] = useState("");
    const [aiMessage, setAiMessage] = useState("");
    const [memoryQuery, setMemoryQuery] = useState("");
    const [memorySummary, setMemorySummary] = useState("");
    const [retrievedMemories, setRetrievedMemories] = useState([]);
    const [llmSpec, setLlmSpec] = useState(null);
    const [showSpec, setShowSpec] = useState(false);
    const [config, setConfig] = useState({});
    const [configText, setConfigText] = useState(""); // For editing JSON
    const chatEndRef = useRef(null); // Auto-scroll ref

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]); 

    // Load configuration when the page opens
    useEffect(() => {
        fetchConfig();
    }, []);

    // Send AI Message
    const sendMessage = async () => {
        if (!chatInput.trim()) return;

        setMessages([...messages, { sender: "User", text: chatInput.trim() }]);
        setChatInput("");

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userMessage: chatInput.trim() }),
            });

            const data = await response.json();
            if (data.aiMessage) {
                setMessages((prev) => [...prev, { sender: "AI", text: data.aiMessage }]);
            }
        } catch (error) {
            console.error("Error:", error);
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
        if (!memoryQuery.trim()) return;
        try {
            const response = await fetch("/api/retrieve-memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userMessage: memoryQuery }),
            });

            const data = await response.json();
            setRetrievedMemories(data);
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
    const fetchConfig = async () => {
        try {
            const response = await fetch("/api/config");
            const data = await response.json();
            setConfig(data);
            setConfigText(JSON.stringify(data, null, 2)); // Pretty JSON format
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
            <h1 className="text-2xl font-bold mb-4">AI Memory Booster Chat</h1>
            {/* Chat Window */}
            <div className="w-full max-w-2xl bg-white shadow-lg rounded-lg p-4 h-96 overflow-y-auto mb-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`p-2 my-1 ${msg.sender === "User" ? "text-blue-700" : "text-green-700"}`}>
                        <div className="inline-flex">
                            <strong>{msg.sender}:&nbsp;</strong>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]} // Enables GitHub-style tables & formatting
                                components={{
                                    code({ node, inline, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || "");
                                        return !inline && match ? (
                                            <SyntaxHighlighter
                                                style={atomDark} // Dark theme for code blocks
                                                language={match[1]}
                                                PreTag="div"
                                                {...props}
                                            >
                                                {String(children).replace(/\n$/, "")}
                                            </SyntaxHighlighter>
                                        ) : (
                                            <code className="bg-gray-200 p-1 rounded">{children}</code>
                                        );
                                    }
                                }}
                            >
                            {msg.text}
                        </ReactMarkdown>
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
                />
                <button className="bg-blue-500 text-white px-4 py-2 rounded-r-lg" onClick={sendMessage}>
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
                                <span className="text-blue-700"><strong>User:&nbsp;</strong> {memory.userMessage}</span>
                                <br />
                                <span className="text-green-700"><strong>AI:&nbsp;</strong> {memory.aiMessage}</span>
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
                <button className="bg-gray-500 text-white px-4 py-2 rounded-lg mt-2" onClick={fetchConfig}>
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
