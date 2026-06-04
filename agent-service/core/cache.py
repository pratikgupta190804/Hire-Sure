"""
Solution 2: LLM Response Caching
Simple in-memory cache for LLM responses to avoid redundant API calls.
Dramatically reduces API usage when similar prompts are processed.
"""
import json
import hashlib
import logging
from functools import wraps
from datetime import datetime, timedelta
from typing import Any, Callable

logger = logging.getLogger(__name__)

_response_cache = {}  # {cache_key: {response, timestamp}}
CACHE_TTL = 3600  # Cache for 1 hour


def _generate_cache_key(prefix: str, func_name: str, *args, **kwargs) -> str:
    """Generate a unique cache key from function name and arguments."""
    # Create a hashable representation
    key_parts = [prefix, func_name]
    
    # Add args (skip 'self' and state objects)
    for arg in args:
        if arg is None or isinstance(arg, (str, int, float, bool)):
            key_parts.append(str(arg))
    
    # Add kwargs
    for k, v in sorted(kwargs.items()):
        if v is None or isinstance(v, (str, int, float, bool)):
            key_parts.append(f"{k}={v}")
    
    key_str = ":".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()


def cache_llm_response(prefix: str = "llm"):
    """
    Decorator to cache LLM responses.
    Reduces API calls when similar prompts are processed.
    
    Usage:
        @cache_llm_response(prefix="validator")
        async def validate_problem(state: ProblemState) -> dict:
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = _generate_cache_key(prefix, func.__name__, *args, **kwargs)
            
            # Check cache
            if cache_key in _response_cache:
                entry = _response_cache[cache_key]
                age = datetime.utcnow() - entry["timestamp"]
                
                if age < timedelta(seconds=CACHE_TTL):
                    logger.info(f"✓ Cache hit for {func.__name__} (age: {age.total_seconds():.0f}s)")
                    return entry["response"]
                else:
                    logger.debug(f"Cache expired for {func.__name__}")
                    del _response_cache[cache_key]
            
            # Execute function
            logger.debug(f"Cache miss for {func.__name__}, executing...")
            result = await func(*args, **kwargs)
            
            # Store in cache
            _response_cache[cache_key] = {
                "response": result,
                "timestamp": datetime.utcnow()
            }
            logger.debug(f"Cached response for {func.__name__}")
            
            return result
        
        return wrapper
    return decorator


def get_cache_stats() -> dict:
    """Get cache statistics."""
    return {
        "total_cached": len(_response_cache),
        "cache_size_bytes": sum(
            len(json.dumps(entry["response"]).encode())
            for entry in _response_cache.values()
        ),
        "entries": [
            {
                "age_seconds": (datetime.utcnow() - entry["timestamp"]).total_seconds(),
                "key": key[:16] + "..."
            }
            for key, entry in _response_cache.items()
        ]
    }


def clear_cache(prefix: str = None):
    """
    Clear cache.
    
    Args:
        prefix: If provided, only clear entries matching this prefix.
                If None, clear all cache.
    """
    if prefix is None:
        _response_cache.clear()
        logger.info("Cleared all LLM response cache")
    else:
        keys_to_remove = [k for k in _response_cache.keys() if k.startswith(prefix)]
        for k in keys_to_remove:
            del _response_cache[k]
        logger.info(f"Cleared {len(keys_to_remove)} cache entries for prefix: {prefix}")


# Cache statistics endpoint helper
def get_cache_info():
    """Get detailed cache information."""
    stats = get_cache_stats()
    return {
        "status": "ok",
        "cached_responses": stats["total_cached"],
        "cache_size_kb": stats["cache_size_bytes"] / 1024,
        "entries": stats["entries"]
    }
