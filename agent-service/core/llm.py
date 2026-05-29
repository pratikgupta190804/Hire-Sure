import os
import logging
from functools import lru_cache
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_primary_llm() -> BaseChatModel:
    """Gemini 2.5 Flash — primary LLM. Free tier: 1500 req/day, 1M context."""
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.7,
        max_retries=2,
    )


@lru_cache(maxsize=1)
def get_fallback_llm() -> BaseChatModel:
    """Groq Llama 3.3 70B — fallback on rate limit. Free tier: 300+ tok/s."""
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.7,
        max_retries=2,
    )


def get_llm_with_fallback() -> BaseChatModel:
    """
    Returns primary LLM. If a 429 rate-limit error occurs during a call,
    LangChain's with_fallbacks() automatically switches to Groq.
    Usage: llm = get_llm_with_fallback()
    """
    primary = get_primary_llm()
    fallback = get_fallback_llm()
    return primary.with_fallbacks([fallback])