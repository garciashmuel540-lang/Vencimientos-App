"""Servicio de consulta de Vigía. Ejecutar en la red de la tienda con TLS."""
import os
from contextlib import closing
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class Lookup(BaseModel):
    mode: Literal["barcode", "name"]
    query: str = Field(min_length=1, max_length=128)


def https_origin(key):
    value = os.environ[key].rstrip("/")
    parts = urlsplit(value)
    if (parts.scheme != "https" or not parts.hostname or parts.username or
            parts.password or parts.path or parts.query or parts.fragment):
        raise ValueError(f"{key} debe ser un origen HTTPS")
    return value


def read_products(connection, mode, query):
    import pyodbc
    fields = "barcode, name, price, stock"
    if mode == "barcode":
        sql = f"SELECT TOP (1) {fields} FROM dbo.VigiaCatalog WHERE barcode = ?"
        value = query
    else:
        literal = "".join("~" + c if c in "~%_[" else c for c in query)
        sql = (f"SELECT TOP (26) {fields} FROM dbo.VigiaCatalog "
               "WHERE name LIKE ? ESCAPE '~' ORDER BY name, barcode")
        value = "%" + literal + "%"
    with closing(pyodbc.connect(connection, timeout=5, autocommit=True)) as db:
        db.timeout = 7
        rows = db.cursor().execute(sql, value).fetchall()
    return [dict(zip(("barcode", "name", "price", "stock"), row)) for row in rows]


def create_app():
    origin = https_origin("VIGIA_ORIGIN")
    auth = https_origin("VIGIA_URL") + "/auth/v1/user"
    key = os.environ["VIGIA_PUBLIC_KEY"]
    store = os.environ["RMH_STORE_ID"]
    connection = os.environ["RMH_ODBC_CONNECTION"]
    if not all((key, store.strip(), connection.strip())):
        raise ValueError("Configuración de tienda incompleta")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=[origin], allow_methods=["POST"],
                       allow_headers=["Authorization", "Content-Type"], allow_private_network=True)

    @app.post("/products")
    def products(body: Lookup, authorization: str = Header(default="")):
        query = body.query.strip()
        if not query or (body.mode == "name" and len(query) < 2):
            raise HTTPException(422)
        if not authorization.startswith("Bearer ") or not authorization[7:].strip():
            raise HTTPException(401)
        try:
            user = httpx.get(auth, headers={"apikey": key, "Authorization": authorization}, timeout=5)
            if user.status_code in (401, 403):
                raise HTTPException(401)
            user.raise_for_status()
            permissions = user.json().get("app_metadata") or {}
            if permissions.get("rmh_store") != store or permissions.get("rmh_live_read") is not True:
                raise HTTPException(403)
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, "Identificación temporalmente indisponible") from None
        try:
            rows = read_products(connection, body.mode, query)
            for row in rows:
                for field in ("price", "stock"):
                    if row[field] is not None:
                        row[field] = float(row[field])
            return JSONResponse({"store": store, "captured_at": datetime.now(timezone.utc).isoformat(),
                                 "products": rows[:25], "more": len(rows) > 25},
                                headers={"Cache-Control": "no-store"})
        except Exception:
            raise HTTPException(503, "Consulta a RMH temporalmente indisponible") from None

    return app
