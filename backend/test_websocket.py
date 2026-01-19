import asyncio
import websockets
import json
import logging
import sys

# ロギング設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_websocket_connection():
    uri = "ws://localhost:8000/ws"

    try:
        logger.info(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            logger.info("Connected to WebSocket")

            # メッセージ受信待機（10秒間）
            start_time = asyncio.get_event_loop().time()
            message_count = 0

            while asyncio.get_event_loop().time() - start_time < 10:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    data = json.loads(message)
                    logger.info(f"Received message type: {data.get('type')}")

                    if data.get('type') == 'market_update':
                        price = data.get('data', {}).get('price')
                        logger.info(f"Market Update - Price: {price}")
                        message_count += 1

                except asyncio.TimeoutError:
                    logger.info("Waiting for next message...")
                    continue
                except websockets.exceptions.ConnectionClosed:
                    logger.error("Connection closed unexpectedly")
                    break

            if message_count > 0:
                logger.info(f"Test PASSED: Received {message_count} market updates.")
                return True
            else:
                logger.warning("Test FAILED: No market updates received.")
                return False

    except Exception as e:
        logger.error(f"Connection failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_websocket_connection())
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
