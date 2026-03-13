"""
SQLAlchemy модель узла графа дорог.
"""
from datetime import datetime

from sqlalchemy import DateTime, Double, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class GraphNode(Base):
    """
    Узел графа дорог месторождения.
    node_type: road, bkns, gu, custom
    """
    __tablename__ = "graph_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Исходный индекс из массива GRAPH.nodes
    node_idx: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    lat: Mapped[float] = mapped_column(Double, nullable=False)
    lon: Mapped[float] = mapped_column(Double, nullable=False)
    node_type: Mapped[str] = mapped_column(String(20), nullable=False, default="road")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<GraphNode idx={self.node_idx} type={self.node_type!r} ({self.lat}, {self.lon})>"
