#!/bin/zsh
cd -- "${0:A:h}" || exit
if curl -fsS --max-time 2 http://127.0.0.1:8765/api/data >/dev/null; then
  open http://127.0.0.1:8765/
  exit
fi
exec python3 server.py --open
