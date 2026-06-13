from pydantic import BaseModel, Field

class ExtractedSkills(BaseModel):
    """Structured data extracted from resume text by the LLM."""
    skills: list[str] = Field(description="List of technical skills, frameworks, databases, tools, e.g. ['Java', 'Spring Boot', 'React', 'Docker']")
    experience_level: str = Field(description="Assessed experience level, e.g. 'Entry-Level', 'Mid-Level', 'Senior', 'Lead'")
    preferred_roles: list[str] = Field(description="Potential job roles suited for this resume, e.g. ['Backend Developer', 'Fullstack Engineer']")
    summary: str = Field(description="Concise 2-3 sentence summary of the user's professional profile.")

class JobMatch(BaseModel):
    """A single job listing with match metadata."""
    title: str = Field(description="Job title")
    company: str = Field(description="Company name")
    location: str = Field(description="Job location, or 'Remote'")
    description: str = Field(description="Full or snippet of job description")
    url: str = Field(description="URL to apply or view job")
    salary: str = Field(default="Not Specified", description="Salary range if available")
    match_score: int = Field(description="Percentage score representing how well user skills match this job (0 to 100)")
    matching_skills: list[str] = Field(description="Subset of user skills that this job lists or requires")
    missing_skills: list[str] = Field(description="Subset of skills requested by the job description but missing from the user's resume")
    match_reason: str = Field(description="Short explanation of why this job matches the user's profile and what they should learn/highlight.")

class JobMatchResponse(BaseModel):
    """Response returned after matching jobs with user skills."""
    success: bool
    skills: list[str]
    matches: list[JobMatch]
    message: str
