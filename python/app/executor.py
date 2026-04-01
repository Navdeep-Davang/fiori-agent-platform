import json
import logging
import asyncio
import time
from typing import AsyncIterator, List, Dict, Any
from .config import LLM_PROVIDER, LLM_API_KEY, GOOGLE_API_KEY, LLM_MODEL
from . import mcp_client

logger = logging.getLogger(__name__)

async def run(payload: dict) -> AsyncIterator[str]:
    """Orchestrates the LLM inference loop with MCP tool calls."""
    agent_config = payload.get("agentConfig", {})
    effective_tools = payload.get("effectiveTools", [])
    user_message = payload.get("message", "")
    history = payload.get("history", [])
    user_token = payload.get("userToken", "")
    
    # Pre-process system prompt and history
    system_prompt = agent_config.get("systemPrompt", "You are a helpful assistant.")
    messages = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_message})
    
    # Map effectiveTools into LLM schemas
    llm_tools = []
    for tool in effective_tools:
        llm_tools.append({
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["inputSchema"]
        })
    
    # LLM execution branching
    try:
        if LLM_PROVIDER == "anthropic":
            async for event in _run_anthropic(system_prompt, messages, llm_tools, effective_tools, user_token):
                yield event
        elif LLM_PROVIDER == "google-genai":
            async for event in _run_google_genai(system_prompt, messages, llm_tools, effective_tools, user_token):
                yield event
        else:
            yield f'data: {json.dumps({"type": "error", "message": f"Unsupported LLM provider: {LLM_PROVIDER}"})}\n\n'
            
    except Exception as e:
        logger.exception(f"Exception in executor.run: {e}")
        yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
    
    # Final done event
    yield f'data: {json.dumps({"type": "done", "sessionId": payload.get("sessionId"), "messageId": None})}\n\n'

async def _run_anthropic(system_prompt: str, messages: List[Dict], anthropic_tools: List[Dict], effective_tools: List[Dict], user_token: str) -> AsyncIterator[str]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=LLM_API_KEY)
    
    # Anthropic tools need 'input_schema'
    # Wait, we need to handle the tool-call loop. 
    # Anthropic streaming API simplifies token-by-token but we must manage recursion ourselves for tool results.
    
    current_messages = list(messages)
    max_turns = 10
    
    for _ in range(max_turns):
        async with client.messages.stream(
            model=LLM_MODEL,
            system=system_prompt,
            messages=current_messages,
            tools=anthropic_tools,
            max_tokens=4096
        ) as stream:
            
            # Accumulated assistant message to store in history
            accumulated_content = []
            tool_calls_this_turn = []
            
            async for chunk in stream:
                if chunk.type == "text":
                    yield f'data: {json.dumps({"type": "token", "content": chunk.text})}\n\n'
                    accumulated_content.append({"type": "text", "text": chunk.text})
                elif chunk.type == "tool_use":
                    tool_calls_this_turn.append({
                        "id": chunk.id,
                        "name": chunk.name,
                        "input": chunk.input
                    })
                    yield f'data: {json.dumps({"type": "tool_call", "toolName": chunk.name, "args": chunk.input})}\n\n'

            final_msg = await stream.get_final_message()
            # If no tools were called, we are done
            if not tool_calls_this_turn:
                break
                
            # Execute tool calls
            current_messages.append({"role": "assistant", "content": final_msg.content})
            tool_results_content = []
            
            for tool_call in tool_calls_this_turn:
                tool_name = tool_call["name"]
                # Find tool metadata in effective_tools (it's a list)
                tool_meta = next((t for t in effective_tools if t["name"] == tool_name), None)
                if not tool_meta:
                    result = json.dumps({"error": f"Tool {tool_name} not allowed"})
                else:
                    start_time = time.time()
                    result = await mcp_client.call_tool(
                        tool_meta["mcpServerUrl"],
                        tool_name,
                        tool_call["input"],
                        user_token
                    )
                    duration = int((time.time() - start_time) * 1000)
                    yield f'data: {json.dumps({"type": "tool_result", "toolName": tool_name, "summary": "Found data", "durationMs": duration})}\n\n'
                
                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call["id"],
                    "content": result
                })
            
            current_messages.append({"role": "user", "content": tool_results_content})

async def _run_google_genai(system_prompt: str, messages: List[Dict], tools_schema: List[Dict], effective_tools: List[Dict], user_token: str) -> AsyncIterator[str]:
    # Implementation using google-generativeai SDK
    from google import generativeai as genai
    from google.generativeai.types import content_types
    
    genai.configure(api_key=GOOGLE_API_KEY)
    
    # Convert schemas to Gemini format
    gemini_tools = []
    if tools_schema:
        # Gemini expects functions in a specific format
        fns = []
        for t in tools_schema:
            fns.append({
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"]
            })
        gemini_tools = [{"function_declarations": fns}]
    
    model = genai.GenerativeModel(
        model_name=LLM_MODEL,
        system_instruction=system_prompt,
        tools=gemini_tools
    )
    
    # Gemini Chat session handles history
    # First convert our message format to Gemini format
    gemini_history = []
    # Gemini role names are 'user' and 'model'
    for m in messages[:-1]:
        gemini_history.append({"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]})
    
    chat = model.start_chat(history=gemini_history)
    current_prompt = messages[-1]["content"]
    
    max_turns = 10
    for _ in range(max_turns):
        response = await chat.send_message_async(current_prompt, stream=True)
        
        has_tool_call = False
        tool_results_parts = []
        
        async for chunk in response:
            for part in chunk.candidates[0].content.parts:
                if part.text:
                    yield f'data: {json.dumps({"type": "token", "content": part.text})}\n\n'
                if part.function_call:
                    has_tool_call = True
                    tool_name = part.function_call.name
                    args = dict(part.function_call.args)
                    
                    yield f'data: {json.dumps({"type": "tool_call", "toolName": tool_name, "args": args})}\n\n'
                    
                    # Execute tool
                    tool_meta = next((t for t in effective_tools if t["name"] == tool_name), None)
                    if not tool_meta:
                        result_str = json.dumps({"error": "Tool not allowed"})
                    else:
                        start_time = time.time()
                        result_str = await mcp_client.call_tool(
                            tool_meta["mcpServerUrl"],
                            tool_name,
                            args,
                            user_token
                        )
                        duration = int((time.time() - start_time) * 1000)
                        yield f'data: {json.dumps({"type": "tool_result", "toolName": tool_name, "summary": "Tool called", "durationMs": duration})}\n\n'
                    
                    tool_results_parts.append(
                        content_types.Part.from_function_response(
                            name=tool_name,
                            response={"result": result_str}
                        )
                    )
        
        if not has_tool_call:
            break
            
        current_prompt = tool_results_parts
