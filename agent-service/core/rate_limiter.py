"""
Solution 4: Rate Limiter
Token bucket rate limiter to stay under Groq/Gemini limits.
Ensures smooth operation without hitting API quotas.
"""
import time
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Token bucket rate limiter.
    Prevents exceeding API rate limits by spacing out requests.
    
    Example:
        limiter = RateLimiter(requests_per_minute=25)
        
        # In your agent:
        await limiter.acquire()
        response = llm.invoke(prompt)
    """
    
    def __init__(self, requests_per_minute: int = 25, name: str = "default"):
        """
        Initialize rate limiter.
        
        Args:
            requests_per_minute: Max requests per minute (e.g., 25 req/min = 2.4s between requests)
            name: Name for logging purposes
        """
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute  # seconds between requests
        self.last_request_time = 0
        self.name = name
        self.requests_count = 0
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    async def acquire(self):
        """
        Wait if necessary to respect rate limits.
        Call this before making an API request.
        """
        elapsed = time.time() - self.last_request_time
        
        if elapsed < self.min_interval:
            wait_time = self.min_interval - elapsed
            self.logger.debug(f"Rate limiting: waiting {wait_time:.2f}s (limit: {self.requests_per_minute} req/min)")
            await asyncio.sleep(wait_time)
        
        self.last_request_time = time.time()
        self.requests_count += 1
        self.logger.debug(f"Rate limit acquired (total requests: {self.requests_count})")
    
    def get_stats(self) -> dict:
        """Get rate limiter statistics."""
        return {
            "limiter_name": self.name,
            "rate_limit": f"{self.requests_per_minute} req/min",
            "min_interval_seconds": self.min_interval,
            "total_requests": self.requests_count,
            "last_request_age_seconds": time.time() - self.last_request_time
        }
    
    def reset(self):
        """Reset the rate limiter."""
        self.last_request_time = 0
        self.requests_count = 0
        self.logger.info(f"Rate limiter '{self.name}' reset")


# Global limiters for different LLM providers
_limiters = {}


def get_limiter(provider: str = "groq", requests_per_minute: int = None) -> RateLimiter:
    """
    Get or create a rate limiter for a specific LLM provider.
    
    Args:
        provider: "groq", "gemini", "together", or "ollama"
        requests_per_minute: Override default limit (use provider defaults if None)
    
    Returns:
        RateLimiter instance
    """
    if provider not in _limiters:
        # Default limits per provider
        default_limits = {
            "groq": 25,         # Safe limit: 30 req/min, use 25 for safety margin
            "gemini": 3,        # Safe limit: 5 req/min, use 3 for safety margin
            "together": 200,    # Safe limit: 300 req/min, use 200 for safety margin
            "ollama": 1000,     # Self-hosted: no limit, but use reasonable default
        }
        
        limit = requests_per_minute or default_limits.get(provider, 20)
        _limiters[provider] = RateLimiter(requests_per_minute=limit, name=provider)
    
    return _limiters[provider]


def get_all_limiter_stats() -> dict:
    """Get statistics for all active rate limiters."""
    return {
        "active_limiters": len(_limiters),
        "limiters": {name: limiter.get_stats() for name, limiter in _limiters.items()}
    }


def reset_all_limiters():
    """Reset all rate limiters."""
    for limiter in _limiters.values():
        limiter.reset()
    logger.info(f"Reset {len(_limiters)} rate limiters")


# Usage in agents:
# limiter = get_limiter("groq")
# await limiter.acquire()
# response = llm.invoke(prompt)
