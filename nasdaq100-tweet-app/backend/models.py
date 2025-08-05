from sqlalchemy import Column, Integer, String, Text, DECIMAL, DateTime
from sqlalchemy.sql import func
from database import Base

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False)
    price = Column(DECIMAL(10, 2), nullable=False)
    content = Column(Text, nullable=False)
    emotion_icon = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())
