"""
Service-to-Service Authentication Manager
Handles automatic token fetching from Spring Boot backend for multiple admin accounts.
Supports token caching and refresh logic.
"""
import os
import json
import logging
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import jwt
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

SPRING_URL = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")
ADMIN_CREDENTIALS = os.getenv("SERVICE_ADMIN_CREDENTIALS", "")  # JSON format or env-based


class TokenCache:
    """In-memory cache for admin tokens with expiry tracking."""
    
    def __init__(self):
        self.cache: dict[str, dict] = {}  # {admin_email: {token, expires_at}}
    
    def set(self, admin_email: str, token: str, expires_at: datetime):
        """Store token with expiry time."""
        self.cache[admin_email] = {
            "token": token,
            "expires_at": expires_at
        }
        logger.debug(f"Cached token for {admin_email} (expires: {expires_at})")
    
    def get(self, admin_email: str) -> Optional[str]:
        """Get token if still valid."""
        if admin_email not in self.cache:
            return None
        
        entry = self.cache[admin_email]
        if datetime.utcnow() < entry["expires_at"]:
            logger.debug(f"Token cache hit for {admin_email}")
            return entry["token"]
        
        logger.debug(f"Token expired for {admin_email}, will refresh")
        del self.cache[admin_email]
        return None
    
    def clear(self, admin_email: Optional[str] = None):
        """Clear cache for specific admin or all."""
        if admin_email:
            self.cache.pop(admin_email, None)
            logger.info(f"Cleared cache for {admin_email}")
        else:
            self.cache.clear()
            logger.info("Cleared all token cache")


token_cache = TokenCache()


class AdminCredentials:
    """Manages admin credentials from environment."""
    
    @staticmethod
    def parse_credentials() -> dict[str, dict]:
        """
        Parse admin credentials from environment.
        
        Supports two formats:
        
        1. Comma-separated list of env vars:
           SERVICE_ADMIN_CREDENTIALS="ADMIN_EMAIL_1,ADMIN_EMAIL_2"
           ADMIN_EMAIL_1="email1@example.com:password1"
           ADMIN_EMAIL_2="email2@example.com:password2"
        
        2. JSON format:
           SERVICE_ADMIN_CREDENTIALS='{"admin1": {"email": "admin1@example.com", "password": "pass1"}}'
        
        Returns: dict mapping admin email to {"email": str, "password": str}
        """
        creds_config = ADMIN_CREDENTIALS.strip()
        
        if not creds_config:
            logger.warning("SERVICE_ADMIN_CREDENTIALS not configured. Using fallback format.")
            return AdminCredentials._get_fallback_credentials()
        
        # Try JSON format first
        if creds_config.startswith("{"):
            try:
                parsed = json.loads(creds_config)
                result = {}
                for key, cred in parsed.items():
                    if isinstance(cred, dict) and "email" in cred and "password" in cred:
                        result[cred["email"]] = cred
                    else:
                        logger.warning(f"Skipping malformed credential: {key}")
                
                if result:
                    logger.info(f"Loaded {len(result)} admin credential(s) from JSON")
                    return result
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON credentials: {e}")
        
        # Try comma-separated env vars format
        if "," in creds_config:
            result = {}
            env_var_names = creds_config.split(",")
            for var_name in env_var_names:
                var_name = var_name.strip()
                cred_value = os.getenv(var_name, "")
                if ":" in cred_value:
                    email, password = cred_value.split(":", 1)
                    result[email.strip()] = {
                        "email": email.strip(),
                        "password": password.strip()
                    }
            
            if result:
                logger.info(f"Loaded {len(result)} admin credential(s) from env vars")
                return result
        
        # Fallback: try single admin format
        return AdminCredentials._get_fallback_credentials()
    
    @staticmethod
    def _get_fallback_credentials() -> dict[str, dict]:
        """Fallback: Try ADMIN_EMAIL and ADMIN_PASSWORD env vars."""
        admin_email = os.getenv("ADMIN_EMAIL", "").strip()
        admin_password = os.getenv("ADMIN_PASSWORD", "").strip()
        
        if admin_email and admin_password:
            logger.info(f"Loaded fallback admin credentials from ADMIN_EMAIL and ADMIN_PASSWORD")
            return {
                admin_email: {
                    "email": admin_email,
                    "password": admin_password
                }
            }
        
        logger.error("No admin credentials configured! Please set SERVICE_ADMIN_CREDENTIALS or ADMIN_EMAIL/ADMIN_PASSWORD")
        return {}


class ServiceAuthenticator:
    """
    Handles service-to-service authentication.
    Automatically fetches tokens from Spring Boot and manages caching/refresh.
    """
    
    def __init__(self):
        self.credentials = AdminCredentials.parse_credentials()
        self.primary_admin = None
        
        if self.credentials:
            self.primary_admin = next(iter(self.credentials.keys()))
            logger.info(f"Service authenticator ready. Primary admin: {self.primary_admin}")
    
    async def get_token(self, admin_email: Optional[str] = None) -> str:
        """
        Get a valid JWT token for the specified admin.
        If not specified, uses the first/primary admin.
        Uses cached token if available and not expired.
        
        Args:
            admin_email: Admin email to authenticate as. If None, uses primary admin.
        
        Returns:
            JWT token string
        
        Raises:
            ValueError: If admin not found or authentication fails
        """
        if not admin_email:
            admin_email = self.primary_admin
        
        if not admin_email:
            raise ValueError("No admin email specified and no primary admin configured")
        
        if admin_email not in self.credentials:
            raise ValueError(f"Admin '{admin_email}' not found in credentials")
        
        # Check cache first
        cached_token = token_cache.get(admin_email)
        if cached_token:
            return cached_token
        
        # Fetch new token
        logger.info(f"Fetching fresh token for admin: {admin_email}")
        return await self._fetch_token_from_spring_boot(admin_email)
    
    async def _fetch_token_from_spring_boot(self, admin_email: str) -> str:
        """Authenticate with Spring Boot and get JWT token."""
        credentials = self.credentials[admin_email]
        
        login_url = f"{SPRING_URL}/api/auth/login"
        payload = {
            "email": credentials["email"],
            "password": credentials["password"]
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(login_url, json=payload)
                response.raise_for_status()
                
                data = response.json()
                token = data.get("token")
                
                if not token:
                    logger.error(f"Login response missing token: {data}")
                    raise ValueError("Server returned no token")
                
                # Parse token expiry from JWT (basic extraction)
                # JWT format: header.payload.signature
                # Payload is base64-encoded JSON
                import base64
                try:
                    parts = token.split(".")
                    if len(parts) == 3:
                        # Decode payload (add padding if needed)
                        payload_part = parts[1]
                        padding = 4 - (len(payload_part) % 4)
                        if padding != 4:
                            payload_part += "=" * padding
                        
                        decoded = base64.urlsafe_b64decode(payload_part)
                        payload_json = json.loads(decoded)
                        
                        # exp is Unix timestamp
                        if "exp" in payload_json:
                            exp_time = datetime.fromtimestamp(payload_json["exp"])
                            token_cache.set(admin_email, token, exp_time)
                            logger.info(f"✓ Authenticated as {admin_email} (token expires: {exp_time})")
                            return token
                except Exception as e:
                    logger.warning(f"Could not parse token expiry: {e}")
                
                # Fallback: cache for 1 hour if we can't parse expiry
                expires_at = datetime.utcnow() + timedelta(hours=1)
                token_cache.set(admin_email, token, expires_at)
                logger.info(f"✓ Authenticated as {admin_email} (token cached for 1 hour)")
                return token
        
        except httpx.HTTPStatusError as e:
            logger.error(f"Login failed for {admin_email}: {e.response.status_code} — {e.response.text}")
            raise ValueError(f"Authentication failed: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Failed to authenticate with Spring Boot: {e}")
            raise
    
    async def get_tokens_for_all_admins(self) -> dict[str, str]:
        """Get valid tokens for all configured admins."""
        tokens = {}
        for admin_email in self.credentials:
            try:
                token = await self.get_token(admin_email)
                tokens[admin_email] = token
            except Exception as e:
                logger.error(f"Failed to get token for {admin_email}: {e}")
        return tokens
    
    def list_admins(self) -> list[str]:
        """List all configured admin emails."""
        return list(self.credentials.keys())
    
    def clear_cache(self, admin_email: Optional[str] = None):
        """Clear token cache."""
        token_cache.clear(admin_email)


# Singleton instance
authenticator = ServiceAuthenticator()


# JWT Authorization helper for client requests (admin verification)
JWT_SECRET = os.getenv("JWT_SECRET")

def verify_admin_token(authorization: Optional[str] = Header(None)) -> str:
    """
    Verifies that the request contains a valid JWT token signed by JWT_SECRET,
    and that the token has the 'role' claim set to 'ADMIN'.
    Returns the token string on success.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format. Must start with 'Bearer '")
    
    token = authorization.split(" ")[1]
    
    if not JWT_SECRET:
        logger.error("JWT_SECRET is not configured in environment variables!")
        raise HTTPException(status_code=500, detail="JWT authentication is not configured on server")
        
    try:
        # Decode token using HS256, HS384, or HS512 (matches Spring Boot's Key HMAC algorithms)
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256", "HS384", "HS512"])
        
        # Verify role is ADMIN
        role = payload.get("role")
        if role != "ADMIN":
            logger.warning(f"Access denied: role is '{role}', expected 'ADMIN'")
            raise HTTPException(status_code=403, detail="Access denied. Admin role required.")
            
        return token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
