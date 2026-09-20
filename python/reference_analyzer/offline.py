"""Process guard: model/package downloads are setup operations, never analysis."""
import os
import socket


def enforce_offline():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "protocol_whitelist;file,pipe|format_whitelist;mov,matroska,webm,avi"

    def blocked(*args, **kwargs):
        raise RuntimeError("Network access is disabled for reference analysis.")

    socket.create_connection = blocked
    socket.getaddrinfo = blocked
    socket.socket.connect = blocked
    socket.socket.connect_ex = blocked
    socket.socket.bind = blocked
    socket.socket.sendto = blocked

