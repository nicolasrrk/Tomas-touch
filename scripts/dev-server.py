"""Servidor estático local para desarrollo, sin caché.
Evita que el navegador sirva versiones viejas de los archivos (algo que
el `python -m http.server` por defecto puede hacer por su resolución de
1 segundo en las cabeceras de fecha, generando 304 falsos)."""
import http.server
import socketserver
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


with ReusableTCPServer(("", port), NoCacheHandler) as httpd:
    print(f"Serving (no-cache) on port {port}")
    httpd.serve_forever()
