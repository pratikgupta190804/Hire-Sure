import logging
import json
import re
from typing import List, Dict, Any
from schemas.resume import JobMatch
from core.llm import get_llm_with_fallback
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an AI career assistant on a Coding and Career Platform. Your task is to evaluate how well a candidate's skills match a specific job description.

For each job, you must compute:
1. 'match_score': An integer percentage (0-100) reflecting skill alignment.
2. 'matching_skills': Which of the candidate's skills are mentioned or highly relevant to the job.
3. 'missing_skills': Critical skills required/desired by the job that are missing from the candidate's list.
4. 'match_reason': A 1-2 sentence encouraging, professional explanation. Be specific about their strengths and what they might need to learn.

Respond with ONLY valid JSON array containing objects with these exact keys:
[
  {
    "title": "Job Title",
    "match_score": 85,
    "matching_skills": ["Java", "Spring Boot"],
    "missing_skills": ["Docker", "Kubernetes"],
    "match_reason": "Your strong backend skills align with the core stack, though learning containerization will make you a perfect candidate."
  },
  ...
]
Do not return any markdown fences or explanation.
"""

def heuristic_match(user_skills: List[str], job: Dict[str, Any]) -> Dict[str, Any]:
    """
    Performs a fast keyword-based matching score for pre-filtering or fallback.
    """
    job_text = (job["title"] + " " + job["description"]).lower()
    
    # Clean user skills
    matched = []
    missing = []
    
    # We want to search for user skills in the job text.
    for skill in user_skills:
        # Regex search for word boundary of the skill
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, job_text):
            matched.append(skill)
            
    # Simple score based on matched skills count
    # Let's say if a job has at least 1 match, start with 50%. Add 10% for each additional skill, up to 95%.
    if not matched:
        score = 15
    else:
        score = min(50 + (len(matched) - 1) * 15, 95)
        
    # Standard fallback explanation
    reason = f"This job mentions {', '.join(matched[:3]) if matched else 'some fields'} that align with your profile."
    
    return {
        "title": job["title"],
        "company": job["company"],
        "location": job["location"],
        "description": job["description"],
        "url": job["url"],
        "salary": job["salary"],
        "match_score": score,
        "matching_skills": matched,
        "missing_skills": [], # Heuristic does not know what is missing
        "match_reason": reason
    }

async def match_jobs_with_llm(user_skills: List[str], jobs: List[Dict[str, Any]]) -> List[JobMatch]:
    """
    Evaluates a list of jobs against user skills using LLM for top jobs.
    Uses fallback heuristic matching for remaining jobs to optimize latency and api limits.
    """
    if not jobs:
        return []
        
    logger.info(f"Matching {len(jobs)} jobs with user skills: {user_skills}")
    
    # Step 1: Run heuristic match on all jobs to get baseline scores and sort
    evaluated_jobs = [heuristic_match(user_skills, job) for job in jobs]
    evaluated_jobs.sort(key=lambda x: x["match_score"], reverse=True)
    
    # Step 2: Use the LLM to refine the TOP 5 matches and generate detailed explanations
    top_n = min(5, len(evaluated_jobs))
    top_jobs = evaluated_jobs[:top_n]
    remaining_jobs = evaluated_jobs[top_n:]
    
    llm_results = []
    
    if top_jobs:
        logger.info(f"Refining top {top_n} matches using LLM...")
        llm = get_llm_with_fallback()
        
        prompt = f"""Candidate Skills: {user_skills}
 
Evaluate the following {top_n} jobs:
"""
        for i, j in enumerate(top_jobs):
            prompt += f"""
[{i}] Job Title: {j['title']}
Company: {j['company']}
Description: {j['description'][:500]}
---
"""
        prompt += "\nEvaluate each job and return a JSON array with match details matching the schema."
        
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt)
        ]
        
        try:
            response = await llm.ainvoke(messages)
            raw = response.content.strip()
            
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()
            
            parsed_llm = json.loads(raw)
            
            # Map LLM results back to our structured top jobs
            for i, item in enumerate(parsed_llm):
                if i < len(top_jobs):
                    orig = top_jobs[i]
                    llm_results.append(JobMatch(
                        title=orig["title"],
                        company=orig["company"],
                        location=orig["location"],
                        description=orig["description"],
                        url=orig["url"],
                        salary=orig["salary"],
                        match_score=int(item.get("match_score", orig["match_score"])),
                        matching_skills=item.get("matching_skills", orig["matching_skills"]),
                        missing_skills=item.get("missing_skills", []),
                        match_reason=item.get("match_reason", orig["match_reason"])
                    ))
        except Exception as e:
            logger.error(f"LLM matching failed: {e}. Falling back entirely to heuristic.")
            # If LLM fails, we just fall back to heuristic for top jobs
            for orig in top_jobs:
                llm_results.append(JobMatch(**orig))
                
    # Combine LLM refined results with heuristic-based remaining results
    final_matches = list(llm_results)
    for orig in remaining_jobs:
        final_matches.append(JobMatch(**orig))
        
    # Sort final matches by match score descending
    final_matches.sort(key=lambda x: x.match_score, reverse=True)
    return final_matches
