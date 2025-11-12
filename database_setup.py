from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL, SERVER_IMAGES_DIR
import os

Base = declarative_base()

class Detection(Base):
    __tablename__ = 'detections'

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False)
    class_name = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=False)
    image_path = Column(String(255), nullable=False)
    bbox_x = Column(Integer, nullable=False)
    bbox_y = Column(Integer, nullable=False)
    bbox_width = Column(Integer, nullable=False)
    bbox_height = Column(Integer, nullable=False)
    metadata_json = Column(Text)  # JSON string for additional data

def init_database():
    """Initialize the database and create tables"""
    engine = create_engine(DATABASE_URL, echo=False)

    # Create tables
    Base.metadata.create_all(engine)

    # Create images directory
    os.makedirs(SERVER_IMAGES_DIR, exist_ok=True)

    return engine

def get_session(engine):
    """Get a database session"""
    Session = sessionmaker(bind=engine)
    return Session()

if __name__ == "__main__":
    print("Initializing database...")
    engine = init_database()
    print("Database initialized successfully!")
