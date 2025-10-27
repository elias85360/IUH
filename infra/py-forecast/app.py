from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

class Point(BaseModel):
    ts: int
    value: float

class ForecastRequest(BaseModel):
    series: List[Point]
    horizonMs: int
    stepMs: Optional[int] = None

@app.post('/forecast')
def forecast(req: ForecastRequest):
    s = req.series
    if not s or len(s) < 2:
        return { 'points': [] }
    s = sorted(s, key=lambda p: p.ts)
    p1 = s[-2]
    p2 = s[-1]
    dt = max(1, (p2.ts - p1.ts))
    rate = (p2.value - p1.value) / dt
    step = req.stepMs or dt
    points = []
    end_ts = p2.ts + req.horizonMs
    t = p2.ts + step
    while t <= end_ts:
        v = p2.value + rate * (t - p2.ts)
        points.append({ 'ts': int(t), 'value': float(v) })
        t += step
    return { 'points': points }

