# core/queue.py

import redis
import json

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