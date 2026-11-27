import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from live import create_app


class LiveCatalogTest(unittest.TestCase):
    def setUp(self):
        env = {"VIGIA_URL": "https://auth.example", "VIGIA_ORIGIN": "https://vigia.example",
               "RMH_STORE_ID": "A", "VIGIA_PUBLIC_KEY": "test", "RMH_ODBC_CONNECTION": "test"}
        with patch.dict(os.environ, env):
            self.client = TestClient(create_app())
        self.params = {"json": {"mode": "barcode", "query": "001"},
                       "headers": {"Authorization": "Bearer test"}}

    def auth_response(self, store, live=True):
        return httpx.Response(200, json={"app_metadata": {"rmh_store": store, "rmh_live_read": live}},
                              request=httpx.Request("GET", "https://auth.example"))

    @patch("live.read_products")
    @patch("live.httpx.get")
    def test_store_guard(self, auth, read):
        auth.return_value = self.auth_response("B")
        self.assertEqual(self.client.post("/products", **self.params).status_code, 403)
        self.assertEqual(self.client.post("/products", json=self.params["json"]).status_code, 401)
        auth.return_value = self.auth_response("A", live=False)
        self.assertEqual(self.client.post("/products", **self.params).status_code, 403)
        read.assert_not_called()

    @patch("live.read_products")
    @patch("live.httpx.get")
    def test_lookup(self, auth, read):
        auth.return_value = self.auth_response("A")
        read.return_value = [{"barcode": "001", "name": "Café", "price": None, "stock": 0}]
        result = self.client.post("/products", **self.params)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["products"][0]["barcode"], "001")
        self.assertEqual(result.json()["products"][0]["stock"], 0)
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        read.assert_called_once_with("test", "barcode", "001")
        read.return_value = []
        self.assertEqual(self.client.post("/products", **self.params).json()["products"], [])
        read.return_value = [{"barcode": str(i), "name": "Café", "stock": -1, "price": 15}
                             for i in range(26)]
        self.params["json"] = {"mode": "name", "query": "Café"}
        result = self.client.post("/products", **self.params).json()
        self.assertEqual(len(result["products"]), 25)
        self.assertTrue(result["more"])

    def test_local_preflight(self):
        headers = {"Origin": "https://vigia.example", "Access-Control-Request-Method": "POST",
                   "Access-Control-Request-Headers": "Authorization, Content-Type",
                   "Access-Control-Request-Private-Network": "true"}
        result = self.client.options("/products", headers=headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers["Access-Control-Allow-Private-Network"], "true")
        headers["Origin"] = "https://other.example"
        self.assertEqual(self.client.options("/products", headers=headers).status_code, 400)
