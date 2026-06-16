import os
import logging
import httpx
import feedparser
import asyncio
import time
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# In-memory caches with TTL
_wwr_cache = {
    "jobs": [],
    "timestamp": 0.0
}
WWR_CACHE_TTL = 3600  # Cache WWR RSS feed for 1 hour

_jsearch_cache = {}  # {query_str: {"jobs": [...], "timestamp": ...}}
JSEARCH_CACHE_TTL = 1800  # Cache JSearch queries for 30 minutes


async def fetch_wwr_jobs(keywords: List[str] = None) -> List[Dict[str, Any]]:
    """
    Fetches remote jobs from We Work Remotely (WWR) RSS feed.
    Caches parsed feed in memory to minimize network calls.
    """
    url = "https://weworkremotely.com/categories/remote-programming-jobs.rss"
    now = time.time()
    
    # Check if cache is still valid
    if _wwr_cache["jobs"] and (now - _wwr_cache["timestamp"] < WWR_CACHE_TTL):
        logger.info(f"✓ WWR RSS cache hit (age: {now - _wwr_cache['timestamp']:.1f}s)")
        jobs = _wwr_cache["jobs"]
    else:
        logger.info(f"Fetching remote developer jobs from WWR RSS: {url}")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                
            # Parse XML feed
            feed = feedparser.parse(response.text)
            parsed_jobs = []
            
            for entry in feed.entries:
                title_parts = entry.title.split(":")
                company = title_parts[0].strip() if len(title_parts) > 1 else "We Work Remotely"
                job_title = title_parts[1].strip() if len(title_parts) > 1 else entry.title
                
                # Extract basic description text
                desc = entry.description if hasattr(entry, "description") else entry.summary
                import re
                clean_desc = re.sub(r'<[^>]+>', '', desc)
                
                parsed_jobs.append({
                    "title": job_title,
                    "company": company,
                    "location": "Remote",
                    "description": clean_desc[:800] + ("..." if len(clean_desc) > 800 else ""),
                    "url": entry.link,
                    "salary": "Not Specified"
                })
            
            logger.info(f"Successfully retrieved and cached {len(parsed_jobs)} jobs from We Work Remotely RSS")
            _wwr_cache["jobs"] = parsed_jobs
            _wwr_cache["timestamp"] = now
            jobs = parsed_jobs
        except Exception as e:
            logger.error(f"Failed to fetch jobs from We Work Remotely: {e}")
            # Use expired cache as fallback if network fails
            if _wwr_cache["jobs"]:
                logger.warning("Using expired WWR cache due to network failure")
                return _wwr_cache["jobs"]
            return []

    # Filter by keyword if provided
    if keywords:
        filtered = []
        keywords_lower = [k.lower() for k in keywords]
        for job in jobs:
            match_text = (job["title"] + " " + job["description"]).lower()
            if any(kw in match_text for kw in keywords_lower):
                filtered.append(job)
        logger.info(f"Filtered to {len(filtered)} WWR jobs matching keywords {keywords}")
        return filtered
        
    return jobs


async def fetch_jsearch_jobs(keywords: str, location: str = "india") -> List[Dict[str, Any]]:
    """
    Fetches jobs from JSearch (RapidAPI) if credentials are set in environment.
    Caches results by query string in memory to avoid rate limit exhaustion.
    """
    api_key = os.getenv("JSEARCH_API_KEY")
    if not api_key:
        logger.info("JSearch API key not configured (JSEARCH_API_KEY). Skipping JSearch.")
        return []
        
    query = f"{keywords} in {location}" if location else keywords
    now = time.time()
    
    # Check cache
    if query in _jsearch_cache and (now - _jsearch_cache[query]["timestamp"] < JSEARCH_CACHE_TTL):
        logger.info(f"✓ JSearch cache hit for query '{query}'")
        return _jsearch_cache[query]["jobs"]
        
    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": api_key
    }
    
    params = {
        "query": query,
        "page": "1",
        "num_pages": "1"
    }
    
    logger.info(f"Fetching jobs from JSearch API for query: '{query}'")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
        data = response.json()
        results = data.get("data", [])
        jobs = []
        
        for item in results:
            salary_min = item.get("job_min_salary")
            salary_max = item.get("job_max_salary")
            salary_currency = item.get("job_salary_currency", "USD")
            salary_period = item.get("job_salary_period", "YEAR")
            
            salary_str = "Not Specified"
            if salary_min and salary_max:
                salary_str = f"{salary_currency} {int(salary_min):,} - {int(salary_max):,} / {salary_period.lower()}"
            elif salary_min:
                salary_str = f"{salary_currency} {int(salary_min):,}+ / {salary_period.lower()}"
                
            jobs.append({
                "title": item.get("job_title"),
                "company": item.get("employer_name", "Unknown Company"),
                "location": item.get("job_location", "Remote/Hybrid"),
                "description": item.get("job_description", ""),
                "url": item.get("job_apply_link", "https://google.com"),
                "salary": salary_str
            })
            
        logger.info(f"Retrieved and cached {len(jobs)} jobs from JSearch API")
        _jsearch_cache[query] = {
            "jobs": jobs,
            "timestamp": now
        }
        return jobs
    except Exception as e:
        logger.error(f"Failed to fetch jobs from JSearch API: {e}")
        return []


async def retrieve_all_jobs(skills: List[str], role: str = None) -> List[Dict[str, Any]]:
    """
    Unified manager that fetches jobs based on user skills and target role asynchronously.
    Fetches WWR RSS and JSearch concurrently if needed.
    """
    if not skills:
        logger.warning("No skills provided for job search. Returning empty list.")
        return []
        
    query_str = role if role else " ".join(skills[:3])
    wwr_keywords = [role] if role else skills[:3]
    
    # Run fetchers concurrently to reduce overall latency
    results = await asyncio.gather(
        fetch_jsearch_jobs(query_str),
        fetch_wwr_jobs(wwr_keywords),
        return_exceptions=True
    )
    
    jsearch_jobs = results[0] if not isinstance(results[0], Exception) else []
    wwr_jobs = results[1] if not isinstance(results[1], Exception) else []
    
    # Prioritize JSearch jobs, fallback to WWR
    jobs = jsearch_jobs if jsearch_jobs else wwr_jobs
        
    # Deduplicate by title + company
    seen = set()
    deduped = []
    for job in jobs:
        key = (job["title"].lower(), job["company"].lower())
        if key not in seen:
            seen.add(key)
            deduped.append(job)
            
    return deduped
