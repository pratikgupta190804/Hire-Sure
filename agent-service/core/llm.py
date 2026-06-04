import os
import logging
from functools import lru_cache
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# Allow switching primary LLM via environment variable
PRIMARY_LLM = os.getenv("PRIMARY_LLM", "groq").lower()  # "groq", "gemini", "together", or "ollama"


@lru_cache(maxsize=1)
def get_primary_llm() -> BaseChatModel:
    """
    Primary LLM with best free tier limits.
    Configurable via PRIMARY_LLM env var: groq (default) | gemini | together | ollama
    
    Limits comparison:
    - Groq (default): 30+ req/min ✅ Best for free tier
    - Gemini: 5 req/min ⚠️ Limited
    - Together.ai: 300+ req/min 🚀 Excellent
    - Ollama: Unlimited (self-hosted) 🔥 Perfect
    """
    if PRIMARY_LLM == "gemini":
        logger.info("Using Gemini as primary LLM (⚠️ limited free tier: 5 req/min)")
        return ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.7,
            max_retries=2,
        )
    
    elif PRIMARY_LLM == "together":
        logger.info("Using Together.ai as primary LLM (300+ req/min)")
        try:
            from langchain_together import Together
            return Together(
                model="meta-llama/Llama-3-70b-chat-hf",
                api_key=os.getenv("TOGETHER_API_KEY"),
                temperature=0.7,
            )
        except ImportError:
            logger.warning("Together.ai not installed. Install: pip install together")
            logger.warning("Falling back to Groq...")
            return get_groq_llm()
    
    elif PRIMARY_LLM == "ollama":
        logger.info("Using Ollama as primary LLM (self-hosted, unlimited)")
        try:
            from langchain_ollama import OllamaLLM
            return OllamaLLM(
                model="llama2",
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                temperature=0.7,
            )
        except ImportError:
            logger.warning("Ollama not installed. Install: pip install ollama")
            logger.warning("Falling back to Groq...")
            return get_groq_llm()
    
    else:  # default: groq
        logger.info("Using Groq as primary LLM (30+ req/min) ✅")
        return get_groq_llm()


@lru_cache(maxsize=1)
def get_groq_llm() -> BaseChatModel:
    """Groq Llama 3.3 70B — excellent free tier (30+ req/min)."""
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.7,
        max_retries=2,
    )


@lru_cache(maxsize=1)
def get_fallback_llm() -> BaseChatModel:
    """Fallback LLM (Gemini) for when primary fails."""
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.7,
        max_retries=2,
    )


def get_llm_with_fallback() -> BaseChatModel:
    """
    Returns primary LLM with fallback chain.
    If primary fails (rate limit, error), automatically switches to fallback.
    
    Usage: 
        llm = get_llm_with_fallback()
        response = llm.invoke(prompt)
    """
    primary = get_primary_llm()
    fallback = get_fallback_llm()
    return primary.with_fallbacks([fallback])