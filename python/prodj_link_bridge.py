"""Passive Pioneer/AlphaTheta PRO DJ LINK listener.

The process never announces itself as a player and never transmits packets. It only
listens for device announcements, beat packets, and CDJ-3000 precise-position
packets, then writes newline-delimited JSON to stdout for the Electron parent.
"""

from __future__ import annotations

import json
import select
import signal
import socket
import sys
import time
from typing import Any


MAGIC = b"Qspt1WmJOL"
KEEP_ALIVE_PORT = 50000
BEAT_PORT = 50001
running = True


def emit(event: dict[str, Any]) -> None:
    print(json.dumps(event, separators=(",", ":")), flush=True)


def now_ms() -> int:
    return int(time.time() * 1000)


def uint(data: bytes, offset: int, length: int) -> int:
    return int.from_bytes(data[offset : offset + length], byteorder="big", signed=False)


def decode_name(data: bytes, offset: int) -> str:
    raw = data[offset : offset + 20].split(b"\x00", 1)[0]
    return raw.decode("ascii", errors="replace").strip() or "PRO DJ LINK device"


def decode_keep_alive(data: bytes, address: str) -> dict[str, Any] | None:
    if len(data) < 0x30 or data[:10] != MAGIC or data[0x0A] != 0x06:
        return None
    device_number = data[0x24]
    if device_number == 0:
        return None
    packet_ip = ".".join(str(part) for part in data[0x2C:0x30])
    return {
        "type": "device",
        "device": {
            "deviceNumber": device_number,
            "name": decode_name(data, 0x0C),
            "address": packet_ip if packet_ip != "0.0.0.0" else address,
            "lastSeenAt": now_ms(),
        },
    }


def decode_beat(data: bytes, address: str) -> dict[str, Any] | None:
    if len(data) != 0x60 or data[:10] != MAGIC or data[0x0A] != 0x28:
        return None
    device_number = data[0x21]
    raw_pitch = uint(data, 0x55, 3)
    pitch_multiplier = raw_pitch / float(0x100000)
    track_bpm = uint(data, 0x5A, 2) / 100.0
    return {
        "type": "beat",
        "beat": {
            "deviceNumber": device_number,
            "name": decode_name(data, 0x0B),
            "address": address,
            "bpm": round(track_bpm * pitch_multiplier, 2),
            "beatWithinBar": data[0x5C],
            "pitchPercent": round((pitch_multiplier - 1.0) * 100.0, 3),
            "receivedAt": now_ms(),
        },
    }


def decode_precise_position(data: bytes, address: str) -> dict[str, Any] | None:
    if len(data) != 0x3C or data[:10] != MAGIC or data[0x0A] != 0x0B:
        return None
    device_number = data[0x21]
    raw_pitch = int.from_bytes(data[0x2C:0x30], byteorder="big", signed=True)
    raw_bpm = uint(data, 0x38, 4)
    return {
        "type": "position",
        "position": {
            "deviceNumber": device_number,
            "name": decode_name(data, 0x0B),
            "address": address,
            "bpm": 0 if raw_bpm == 0xFFFFFFFF else round(raw_bpm / 10.0, 2),
            "positionMs": uint(data, 0x28, 4),
            "trackLengthSeconds": uint(data, 0x24, 4),
            "pitchPercent": round(raw_pitch / 100.0, 3),
            "receivedAt": now_ms(),
        },
    }


def open_listener(port: int) -> socket.socket | None:
    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        listener.bind(("", port))
    except OSError as error:
        listener.close()
        emit({"type": "warning", "message": f"No se pudo escuchar UDP {port}: {error}"})
        return None
    listener.setblocking(False)
    return listener


def stop_process(_signum: int, _frame: Any) -> None:
    global running
    running = False


def self_test() -> int:
    beat = bytearray(0x60)
    beat[:10] = MAGIC
    beat[0x0A] = 0x28
    beat[0x0B:0x12] = b"CDJ3000"
    beat[0x21] = 2
    beat[0x55:0x58] = (0x100000).to_bytes(3, "big")
    beat[0x5A:0x5C] = (12800).to_bytes(2, "big")
    beat[0x5C] = 1
    decoded_beat = decode_beat(bytes(beat), "192.168.1.20")
    assert decoded_beat is not None
    assert decoded_beat["beat"]["bpm"] == 128.0
    assert decoded_beat["beat"]["beatWithinBar"] == 1

    position = bytearray(0x3C)
    position[:10] = MAGIC
    position[0x0A] = 0x0B
    position[0x0B:0x12] = b"CDJ3000"
    position[0x21] = 2
    position[0x24:0x28] = (360).to_bytes(4, "big")
    position[0x28:0x2C] = (123456).to_bytes(4, "big")
    position[0x2C:0x30] = (325).to_bytes(4, "big", signed=True)
    position[0x38:0x3C] = (1322).to_bytes(4, "big")
    decoded_position = decode_precise_position(bytes(position), "192.168.1.20")
    assert decoded_position is not None
    assert decoded_position["position"]["positionMs"] == 123456
    assert decoded_position["position"]["bpm"] == 132.2
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    signal.signal(signal.SIGINT, stop_process)
    signal.signal(signal.SIGTERM, stop_process)

    listeners = [
        listener
        for listener in (open_listener(KEEP_ALIVE_PORT), open_listener(BEAT_PORT))
        if listener is not None
    ]
    if not listeners:
        emit({"type": "error", "message": "No hay puertos PRO DJ LINK disponibles"})
        return 2

    emit(
        {
            "type": "ready",
            "message": "Listener pasivo PRO DJ LINK activo en UDP 50000/50001",
        }
    )

    last_device_emit: dict[tuple[int, str], float] = {}
    last_position_emit: dict[int, float] = {}

    try:
        while running:
            readable, _, _ = select.select(listeners, [], [], 0.5)
            for listener in readable:
                try:
                    data, peer = listener.recvfrom(4096)
                except OSError:
                    continue

                address = peer[0]
                event: dict[str, Any] | None = None
                if listener.getsockname()[1] == KEEP_ALIVE_PORT:
                    event = decode_keep_alive(data, address)
                    if event:
                        key = (event["device"]["deviceNumber"], address)
                        current = time.monotonic()
                        if current - last_device_emit.get(key, 0) < 1.5:
                            continue
                        last_device_emit[key] = current
                else:
                    event = decode_beat(data, address)
                    if event is None:
                        event = decode_precise_position(data, address)
                        if event:
                            device_number = event["position"]["deviceNumber"]
                            current = time.monotonic()
                            if current - last_position_emit.get(device_number, 0) < 0.2:
                                continue
                            last_position_emit[device_number] = current

                if event:
                    emit(event)
    finally:
        for listener in listeners:
            listener.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
