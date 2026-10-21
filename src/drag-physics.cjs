// Drag/release calculations ported from dsh-pet's shared physics module.
// Source: https://github.com/PC2005-cloud/dsh-pet/blob/main/dsh-pet/src/shared/physics.ts
const SPRING_K = 200;
const SPRING_C = 30;
const TRAIL_KEEP_MS = 200;
const RELEASE_WINDOW_MS = 150;
const RELEASE_STALE_MS = 150;
const MIN_SPAN_MS = 20;
const SEG_MIN_DT_MS = 8;
const DEAD_ZONE_SPEED = 500;
const MAX_THROW_SPEED = 3600;
const PEAK_WEIGHT = 0.5;
const ACCEL_REF = 8000;
const ACCEL_GAIN_MAX = 0.6;

function trimTrail(trail, now) {
  const cutoff = now - TRAIL_KEEP_MS;
  let index = 0;
  while (index < trail.length && trail[index].t < cutoff) index += 1;
  return index === 0 ? trail : trail.slice(index);
}

function springStep(velocity, position, target, dt, power = 1) {
  return velocity + ((target - position) * SPRING_K - velocity * SPRING_C) * power * dt;
}

function softClampSpeed(speed) {
  if (speed <= 0) return 0;
  return MAX_THROW_SPEED * (1 - Math.exp(-speed / MAX_THROW_SPEED));
}

function estimateReleaseVelocity(trail, now, throwPower = 1) {
  if (trail.length === 0) return null;
  const last = trail[trail.length - 1];
  if (now - last.t > RELEASE_STALE_MS) return null;
  const samples = trail.filter(sample => now - sample.t <= RELEASE_WINDOW_MS);
  if (samples.length < 2) return null;
  const first = samples[0];
  const end = samples[samples.length - 1];
  const spanMs = end.t - first.t;
  if (spanMs < MIN_SPAN_MS) return null;
  const baseVx = ((end.x - first.x) / spanMs) * 1000;
  const baseVy = ((end.y - first.y) / spanMs) * 1000;
  const baseSpeed = Math.hypot(baseVx, baseVy);
  if (baseSpeed < 1e-6) return null;

  const segmentSpeeds = [];
  let px = first.x;
  let py = first.y;
  let pt = first.t;
  for (const sample of samples.slice(1)) {
    const dt = sample.t - pt;
    if (dt >= SEG_MIN_DT_MS) {
      segmentSpeeds.push({ speed: (Math.hypot(sample.x - px, sample.y - py) / dt) * 1000, tEnd: sample.t });
      px = sample.x;
      py = sample.y;
      pt = sample.t;
    }
  }
  const peakSpeed = segmentSpeeds.length
    ? Math.max(...segmentSpeeds.map(segment => segment.speed))
    : baseSpeed;
  let acceleration = 0;
  if (segmentSpeeds.length >= 2) {
    const firstSegment = segmentSpeeds[0];
    const lastSegment = segmentSpeeds[segmentSpeeds.length - 1];
    acceleration = (lastSegment.speed - firstSegment.speed) /
      Math.max((lastSegment.tEnd - firstSegment.tEnd) / 1000, MIN_SPAN_MS / 1000);
  }
  const speedBeforeClamp =
    ((1 - PEAK_WEIGHT) * baseSpeed + PEAK_WEIGHT * peakSpeed) *
    (1 + Math.min(Math.max(acceleration, 0) / ACCEL_REF, 1) * ACCEL_GAIN_MAX);
  const speed = softClampSpeed(speedBeforeClamp) * throwPower;
  if (speed < DEAD_ZONE_SPEED) return null;
  return { vx: (baseVx / baseSpeed) * speed, vy: (baseVy / baseSpeed) * speed };
}

module.exports = {
  DEAD_ZONE_SPEED,
  RELEASE_WINDOW_MS,
  estimateReleaseVelocity,
  springStep,
  trimTrail
};
