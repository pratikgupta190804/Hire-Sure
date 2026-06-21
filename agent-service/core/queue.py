# core/queue.py

import os
import redis
import json

redis_url = os.getenv("REDIS_URL")
if redis_url:
    redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
else:
    redis_client = redis.Redis(
        host="localhost",
        port=6379,
        decode_responses=True
    )

QUEUE_KEY = "problem_generation_queue"


def enqueue(task):
    redis_client.lpush(
        QUEUE_KEY,
        json.dumps(task)
    )


def dequeue(timeout=30):
    item = redis_client.brpop(
        QUEUE_KEY,
        timeout=timeout
    )

    if not item:
        return None

    return json.loads(item[1])