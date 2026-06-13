import os
import logging
import httpx
import feedparser
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Fallback seed jobs are removed to prevent displaying fake jobs to users.


def fetch_wwr_jobs(keywords: List[str] = None) -> List[Dict[str, Any]]:
    """
    Fetches remote jobs from We Work Remotely (WWR) RSS feed.
    Caches or parses on the fly. Completely legal and stable.
    """
    url = "https://weworkremotely.com/categories/remote-programming-jobs.rss"
    logger.info(f"Fetching remote developer jobs from WWR RSS: {url}")
    
    try:
        # Fetch content with httpx
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
            response.raise_for_status()
            
        # Parse XML feed
        feed = feedparser.parse(response.text)
        jobs = []
        
        for entry in feed.entries:
            title_parts = entry.title.split(":")
            company = title_parts[0].strip() if len(title_parts) > 1 else "We Work Remotely"
            job_title = title_parts[1].strip() if len(title_parts) > 1 else entry.title
            
            # Extract basic description text
            desc = entry.description if hasattr(entry, "description") else entry.summary
            # Strip simple HTML if any (RSS summary is usually HTML)
            import re
            clean_desc = re.sub(r'<[^>]+>', '', desc)
            
            jobs.append({
                "title": job_title,
                "company": company,
                "location": "Remote",
                "description": clean_desc[:800] + ("..." if len(clean_desc) > 800 else ""),
                "url": entry.link,
                "salary": "Not Specified" # RSS feed doesn't consistently provide salary
            })
        
        logger.info(f"Successfully retrieved {len(jobs)} jobs from We Work Remotely RSS")
        
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
        
    except Exception as e:
        logger.error(f"Failed to fetch jobs from We Work Remotely: {e}")
        return []

def fetch_jsearch_jobs(keywords: str, location: str = "india") -> List[Dict[str, Any]]:
    """
    Fetches jobs from JSearch (RapidAPI) if credentials are set in environment.
    """
    api_key = os.getenv("JSEARCH_API_KEY")
    
    if not api_key:
        logger.info("JSearch API key not configured (JSEARCH_API_KEY). Skipping JSearch.")
        return []
        
    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": api_key
    }
    
    query = f"{keywords} in {location}" if location else keywords
    params = {
        "query": query,
        "page": "1",
        "num_pages": "1"
    }
    
    logger.info(f"Fetching jobs from JSearch API for query: '{query}'")
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
        data = response.json()
        results = data.get("data", [])
        jobs = []
        
        for item in results:
            # Salary extraction
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
            
        logger.info(f"Retrieved {len(jobs)} jobs from JSearch API")
        return jobs
    except Exception as e:
        logger.error(f"Failed to fetch jobs from JSearch API: {e}")
        return []

def retrieve_all_jobs(skills: List[str], role: str = None) -> List[Dict[str, Any]]:
    """
    Unified manager that fetches jobs based on user skills and target role.
    """
    if not skills:
        logger.warning("No skills provided for job search. Returning empty list.")
        return []
        
    # Query string for JSearch is the target role!
    # If role is not provided, fallback to top skills
    query_str = role if role else " ".join(skills[:3])
    
    # 1. Try JSearch API
    jobs = fetch_jsearch_jobs(query_str)
    
    # 2. Try We Work Remotely RSS feed
    # For WWR we query with search keywords (role or skills[:3])
    if not jobs:
        wwr_keywords = [role] if role else skills[:3]
        jobs = fetch_wwr_jobs(wwr_keywords)
        
    # Deduplicate by title + company
    seen = set()
    deduped = []
    for job in jobs:
        key = (job["title"].lower(), job["company"].lower())
        if key not in seen:
            seen.add(key)
            deduped.append(job)
            
    return deduped
