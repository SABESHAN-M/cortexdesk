"""
CortexDesk — Backend JWT Verification & Authentication Dependency

Verifies Supabase access tokens on FastAPI routes using Supabase's published
asymmetric JWKS endpoint.

Security Architecture:
- Cryptographic Verification: Asymmetric signature verification using PyJWT and cryptography.
- Explicit Algorithm Whitelist: Strictly limited to ["RS256", "ES256"]; blind 'alg' header acceptance is prohibited.
- Cached Key Set: Employs bounded-time caching (lifespan=300s, timeout=10s) to prevent request-time bottlenecks while handling key rotation automatically.
- Strict Claim Validation: Enforces expiration ('exp'), issuer ('iss'), audience ('aud'), and user identifier ('sub').
- Zero Credential Exposure: Never logs or echoes access tokens in console logs or error responses.
- Safe Error Handling: Yields HTTP 401 with standard WWW-Authenticate headers on any failure without triggering unhandled 500 exceptions.
"""

from functools import lru_cache
import logging
from typing import Optional, List
import jwt
from jwt import PyJWKClient, PyJWKClientError
from pydantic import BaseModel
from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import get_settings, Settings

logger = logging.getLogger(__name__)

# Security: Restrict accepted signing algorithms strictly to known asymmetric standards
ALLOWED_ALGORITHMS: List[str] = ["RS256", "ES256"]

security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    user_id: str
    email: Optional[str] = None
    raw_token: str


@lru_cache()
def get_jwks_client(jwks_url: str) -> PyJWKClient:
    """
    Returns a cached PyJWKClient configured with bounded timeout,
    in-memory key caching, and automatic key-rotation retrieval.
    """
    return PyJWKClient(
        jwks_url,
        cache_keys=True,
        max_cached_keys=16,
        cache_jwk_set=True,
        lifespan=300.0,
        timeout=10.0,
    )


def verify_token(
    token: str,
    settings: Settings,
    jwks_client: Optional[PyJWKClient] = None,
) -> AuthenticatedUser:
    """
    Cryptographically verifies a Supabase JWT access token against the project's
    JWKS endpoint and claims policies.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or empty access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clean_token = token.strip()

    # 1. Resolve signing key from JWKS
    client = jwks_client or get_jwks_client(settings.supabase_jwks_url)

    try:
        signing_key = client.get_signing_key_from_jwt(clean_token)
    except PyJWKClientError as e:
        logger.warning("JWKS key retrieval failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: unable to retrieve valid signing key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.warning("Unexpected JWKS error during key lookup: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signing key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Decode and cryptographically verify signature & claims
    try:
        payload = jwt.decode(
            clean_token,
            key=signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
                "require": ["exp", "iss", "sub"],
            },
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning("Token verification failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.warning("Unhandled error during JWT decoding: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Validate user identity claim
    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str) or not user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing valid subject (sub) claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("email")
    if email is not None and not isinstance(email, str):
        email = None

    return AuthenticatedUser(
        user_id=user_id,
        email=email,
        raw_token=clean_token,
    )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """
    FastAPI dependency that extracts and cryptographically verifies the
    Supabase Bearer token from the request Authorization header.
    """
    token: Optional[str] = None
    if credentials:
        token = credentials.credentials
    else:
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        parts = auth_header.strip().split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization header format. Expected 'Bearer <token>'",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = parts[1]

    return verify_token(token, settings=settings)
