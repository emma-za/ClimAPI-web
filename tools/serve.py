"""Servidor local de desarrollo, sin caché.

Uso (desde cualquier carpeta):
    python tools/serve.py          ->  http://localhost:8080
    python tools/serve.py 9000     ->  http://localhost:9000
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # carpeta del proyecto
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

os.chdir(ROOT)   # sirve siempre la carpeta del proyecto (compatible con Python 3.6+)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as server:
    print("Climapi en http://localhost:%d  (Ctrl+C para detener)" % PORT)
    server.serve_forever()
