from sqlalchemy import Column, Integer, String, Text, DECIMAL, DateTime, ForeignKey, Boolean, LargeBinary
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    price = Column(DECIMAL(10, 2), nullable=False)
    content = Column(Text, nullable=False)
    emotion_icon = Column(String(255))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="comments")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)  # WebAuthn User ID (base64url or UUID)
    username = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=True)
    profile_image = Column(Text, nullable=True)  # Base64 encoded image
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    credentials = relationship("UserCredential", back_populates="user")

class UserCredential(Base):
    __tablename__ = "user_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    credential_id = Column(String, unique=True, index=True, nullable=False) # Base64URL encoded
    public_key = Column(String, nullable=False) # Base64URL encoded
    sign_count = Column(Integer, default=0)
    transports = Column(String, nullable=True) # JSON or comma-separated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="credentials")

class AuthChallenge(Base):
    __tablename__ = "auth_challenges"

    challenge_id = Column(String, primary_key=True) # The challenge string itself or a unique ID
    user_id = Column(String, nullable=True) # Optional, linked to user if known
    challenge = Column(String, nullable=False) # Base64URL encoded challenge
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
