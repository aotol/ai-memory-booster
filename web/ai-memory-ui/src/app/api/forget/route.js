/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams?.get("id");
    const apiUrl = id
    ? `${process.env.AI_MEMORY_BOOSTER_API_URL}/forget?id=${id}`
    : `${process.env.AI_MEMORY_BOOSTER_API_URL}/forget`;
    const response = await fetch(apiUrl, { method: "GET" });
    const data = await response.json();
    return Response.json(data);

}