import json
import logging
import time
from typing import AsyncIterator, List, Dict, Any
from .config import LLM_PROVIDER, LLM_API_KEY, LLM_MODEL
from . import mcp_client
from . import adk_engine
from .chat_tooling import token_for_mcp

logger = logging.getLogger(__name__)


async def run(payload: dict) -> AsyncIterator[str]:
    """Orchestrates the LLM inference loop with MCP tool calls."""
    # Gemini path: Google ADK owns prompt assembly, tools, and streaming (see adk_engine).
    if LLM_PROVIDER == "google-genai":
        try:
            async for event in adk_engine.run_adk_chat(payload):
                yield event
        except Exception as e:
            logger.exception(f"Exception in executor.run: {e}")
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": payload.get("sessionId"), "messageId": None})}\n\n'
        return

    agent_config = payload.get("agentConfig", {})
    effective_tools = payload.get("effectiveTools", [])
    user_message = payload.get("message", "")
    history = payload.get("history", [])
    user_token = payload.get("userToken", "")

    system_prompt = agent_config.get("systemPrompt", "You are a helpful assistant.")
    messages = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_message})

    llm_tools = []
    for tool in effective_tools:
        llm_tools.append({
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["inputSchema"]
        })

    try:
        if LLM_PROVIDER == "anthropic":
            async for event in _run_anthropic(system_prompt, messages, llm_tools, effective_tools, user_token):
                yield event
        elif LLM_PROVIDER == "openai":
            async for event in _run_openai(system_prompt, messages, llm_tools, effective_tools, user_token):
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
                        token_for_mcp(tool_meta, user_token),
                    )
                    duration = int((time.time() - start_time) * 1000)
                    yield f'data: {json.dumps({"type": "tool_result", "toolName": tool_name, "summary": "Found data", "durationMs": duration})}\n\n'
                
                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call["id"],
                    "content": result
                })
            
            current_messages.append({"role": "user", "content": tool_results_content})


async def _run_openai(
    system_prompt: str,
    messages: List[Dict],
    tools_schema: List[Dict],
    effective_tools: List[Dict],
    user_token: str,
) -> AsyncIterator[str]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=LLM_API_KEY)
    oa_messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for m in messages:
        oa_messages.append({"role": m["role"], "content": m["content"]})

    oa_tools = []
    for t in tools_schema:
        schema = t.get("input_schema") if isinstance(t.get("input_schema"), dict) else {}
        oa_tools.append(
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": (t.get("description") or "")[:1024],
                    "parameters": schema if schema else {"type": "object", "properties": {}},
                },
            }
        )

    max_turns = 10
    current = list(oa_messages)

    for _ in range(max_turns):
        kwargs: Dict[str, Any] = {"model": LLM_MODEL, "messages": current}
        if oa_tools:
            kwargs["tools"] = oa_tools
        resp = await client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message

        if msg.tool_calls:
            assistant_msg = {"role": "assistant", "content": msg.content, "tool_calls": []}
            for tc in msg.tool_calls:
                assistant_msg["tool_calls"].append(
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"},
                    }
                )
            current.append(assistant_msg)

            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield f'data: {json.dumps({"type": "tool_call", "toolName": name, "args": args})}\n\n'

                tool_meta = next((t for t in effective_tools if t["name"] == name), None)
                if not tool_meta:
                    result = json.dumps({"error": f"Tool {name} not allowed"})
                else:
                    start_time = time.time()
                    result = await mcp_client.call_tool(
                        tool_meta["mcpServerUrl"],
                        name,
                        args,
                        token_for_mcp(tool_meta, user_token),
                    )
                    duration = int((time.time() - start_time) * 1000)
                    yield f'data: {json.dumps({"type": "tool_result", "toolName": name, "summary": "Found data", "durationMs": duration, "args": args})}\n\n'

                current.append({"role": "tool", "tool_call_id": tc.id, "content": result})
        else:
            text = msg.content or ""
            step = 32
            for i in range(0, len(text), step):
                yield f'data: {json.dumps({"type": "token", "content": text[i : i + step]})}\n\n'
            break

