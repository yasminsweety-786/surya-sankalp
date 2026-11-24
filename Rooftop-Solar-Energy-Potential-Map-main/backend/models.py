from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), unique=True, nullable=True, index=True)
    auth_provider = Column(String(50), default="local", nullable=False)  # "firebase", "local", "guest"
    firstname = Column(String(50), nullable=True)
    lastname = Column(String(50), nullable=True)
    email = Column(String(120), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())

    polygons = relationship("Polygon", back_populates="user")
    solar_estimations = relationship("SolarEstimation", back_populates="user")

    def __repr__(self):
        return f"<User {self.id}: {self.email or self.firebase_uid}>"


class Polygon(Base):
    __tablename__ = "polygons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    firebase_uid = Column(String(128), nullable=True, index=True)
    session_id = Column(String(128), nullable=True, index=True)
    coordinates = Column(Text, nullable=False)
    image_path = Column(String(255), nullable=True)
    image_url = Column(String(1024), nullable=True)
    source_bounds = Column(Text, nullable=True)  # JSON {minLat, maxLat, minLng, maxLng}
    created_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="polygons")
    detections = relationship("RooftopDetection", back_populates="polygon", cascade="all, delete-orphan")
    solar_estimations = relationship("SolarEstimation", back_populates="polygon")

    def __repr__(self):
        return f"<Polygon {self.id}>"


class RooftopDetection(Base):
    __tablename__ = "rooftop_detections"

    id = Column(Integer, primary_key=True, index=True)
    polygon_id = Column(Integer, ForeignKey("polygons.id"), nullable=False)
    confidence = Column(Float, nullable=False)
    polygon_points = Column(Text, nullable=False)  # JSON [[x,y], [x,y], ...]
    pixel_area = Column(Float, nullable=False)  # Actual contour area in pixels
    real_area_m2 = Column(Float, nullable=True)  # Scaled area in square meters
    conversion_method = Column(String(100), nullable=False)
    uncertainty_status = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())

    polygon = relationship("Polygon", back_populates="detections")

    def __repr__(self):
        return f"<RooftopDetection {self.id} for Polygon {self.polygon_id}: {self.real_area_m2} m²>"


class SolarEstimation(Base):
    __tablename__ = "solar_estimations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    firebase_uid = Column(String(128), nullable=True, index=True)
    session_id = Column(String(128), nullable=True, index=True)
    polygon_id = Column(Integer, ForeignKey("polygons.id"), nullable=True)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    start_date = Column(String(8), nullable=False)
    end_date = Column(String(8), nullable=False)
    efficiency = Column(Float, nullable=False)
    
    rooftop_area_m2 = Column(Float, nullable=False)
    usable_area_factor = Column(Float, nullable=False, default=0.70)
    usable_area_m2 = Column(Float, nullable=False)
    annual_energy_potential = Column(Float, nullable=False)
    
    data_origin = Column(String(50), nullable=False)  # "LIVE_API", "CACHED", "REGIONAL_FALLBACK_ESTIMATE"
    is_fallback = Column(Boolean, default=False, nullable=False)
    fallback_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="solar_estimations")
    polygon = relationship("Polygon", back_populates="solar_estimations")

    def __repr__(self):
        return f"<SolarEstimation {self.id}: {self.annual_energy_potential} Wh>"
