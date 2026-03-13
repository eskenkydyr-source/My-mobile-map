"""
SQLAlchemy модель ребра графа дорог.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class GraphEdge(Base):
    """
    Направленное ребро графа дорог.
    from_node и to_node — ссылаются на node_idx узлов.
    """
    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_node: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("graph_nodes.node_idx", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_node: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("graph_nodes.node_idx", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<GraphEdge {self.from_node}→{self.to_node} {self.distance_m}m>"
