"""
RESQ-X person-detection worker (optional companion service).

Pulls frames from the ESP32-CAM MJPEG stream, runs a lightweight person
detector, and publishes results to MQTT in the exact shape the Node
backend expects on resqx/<UNIT_ID>/detection.

Install:
    pip install opencv-python paho-mqtt ultralytics

Run:
    python detect.py --cam-url http://192.168.1.60:81/stream --unit-id unit-01 --broker 192.168.1.50
"""

import argparse
import json
import time

import cv2
import paho.mqtt.client as mqtt
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cam-url", required=True, help="ESP32-CAM MJPEG stream URL")
    parser.add_argument("--unit-id", required=True)
    parser.add_argument("--broker", default="localhost")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--model", default="yolov8n.pt", help="Ultralytics model path/name")
    parser.add_argument("--interval", type=float, default=1.5, help="Seconds between inferences")
    args = parser.parse_args()

    model = YOLO(args.model)
    client = mqtt.Client(client_id=f"resqx-detector-{args.unit_id}")
    client.connect(args.broker, args.broker_port, keepalive=30)
    client.loop_start()

    topic = f"resqx/{args.unit_id}/detection"
    cap = cv2.VideoCapture(args.cam_url)

    if not cap.isOpened():
        raise SystemExit(f"Could not open camera stream at {args.cam_url}")

    print(f"Publishing detections to {topic} every {args.interval}s")
    last_run = 0.0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.5)
                continue

            now = time.time()
            if now - last_run < args.interval:
                continue
            last_run = now

            results = model(frame, classes=[0], verbose=False)  # class 0 = person (COCO)
            boxes = results[0].boxes

            count = len(boxes)
            confidence = float(boxes.conf.max()) if count > 0 else 0.0
            bounding_boxes = [
                {"x1": float(b[0]), "y1": float(b[1]), "x2": float(b[2]), "y2": float(b[3])}
                for b in boxes.xyxy.tolist()
            ]

            payload = {
                "personDetected": count > 0,
                "confidence": round(confidence, 3),
                "count": count,
                "boundingBoxes": bounding_boxes,
            }

            client.publish(topic, json.dumps(payload))
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
