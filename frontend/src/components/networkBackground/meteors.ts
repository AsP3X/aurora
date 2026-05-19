// Human: Shooting stars with cruise → flare → fade burn-up; optional fragment breakup; tier-aware spawn caps.
// Agent: MeteorField.update(dt); config maxConcurrent/spawnCooldownScale; SURFACE_CEILING; EMITS GlMeteorSlot[].

/** Shader uniform array size — slots beyond maxConcurrent stay empty. */
export const MAX_METEORS = 8;

export const SURFACE_CEILING = 0.36;

const BURN_ZONE_START = 0.5;
const BURN_DURATION = 0.85;
const BREAKUP_CHANCE = 0.38;

export interface GlMeteorSlot {
  headX: number;
  headY: number;
  velX: number;
  velY: number;
  tailLength: number;
  mineral: number;
  life01: number;
  burn01: number;
  phase: number;
}

export interface MeteorFieldConfig {
  maxConcurrent: number;
  spawnCooldownScale: number;
  enabled: boolean;
}

interface ActiveMeteor {
  headX: number;
  headY: number;
  velX: number;
  velY: number;
  tailLength: number;
  mineral: number;
  life: number;
  maxLife: number;
  phase: number;
  burn01: number;
  willBreakup: boolean;
  fragmentSpawned: boolean;
  isFragment: boolean;
}

const EMPTY_SLOT: GlMeteorSlot = {
  headX: 0,
  headY: 0,
  velX: 0,
  velY: 0,
  tailLength: 0,
  mineral: 0,
  life01: 0,
  burn01: 0,
  phase: 0,
};

const DEFAULT_CONFIG: MeteorFieldConfig = {
  maxConcurrent: MAX_METEORS,
  spawnCooldownScale: 1,
  enabled: true,
};

const MINERAL_WEIGHTS = [0, 0, 1, 1, 1, 1, 1, 2, 3, 4];

function pickMineral(): number {
  return MINERAL_WEIGHTS[Math.floor(Math.random() * MINERAL_WEIGHTS.length)] ?? 1;
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawnMeteor(): ActiveMeteor {
  const maxLife = randBetween(0.55, 1.35);
  const fromRight = Math.random() > 0.4;
  const headX = randBetween(fromRight ? 0.5 : 0.02, fromRight ? 1.02 : 0.45);
  const headY = randBetween(0.84, 1.04);
  const speed = randBetween(0.52, 1.05);
  const angle = randBetween(fromRight ? -2.72 : -2.42, fromRight ? -2.12 : -1.82);

  return {
    headX,
    headY,
    velX: Math.cos(angle) * speed,
    velY: Math.sin(angle) * speed,
    tailLength: randBetween(0.22, 0.44),
    mineral: pickMineral(),
    life: maxLife,
    maxLife,
    phase: Math.random() * 1000,
    burn01: 0,
    willBreakup: Math.random() < BREAKUP_CHANCE,
    fragmentSpawned: false,
    isFragment: false,
  };
}

function spawnFragments(parent: ActiveMeteor): ActiveMeteor[] {
  const count = Math.random() > 0.45 ? 3 : 2;
  const pieces: ActiveMeteor[] = [];

  for (let i = 0; i < count; i++) {
    const spread = randBetween(-0.55, 0.55);
    const fragLife = randBetween(0.18, 0.42);
    pieces.push({
      headX: parent.headX + randBetween(-0.018, 0.018),
      headY: parent.headY + randBetween(-0.012, 0.012),
      velX: parent.velX * 0.65 + Math.cos(spread) * randBetween(0.12, 0.32),
      velY: parent.velY * 0.65 + Math.sin(spread) * randBetween(0.08, 0.22),
      tailLength: parent.tailLength * randBetween(0.22, 0.42),
      mineral: parent.mineral,
      life: fragLife,
      maxLife: fragLife,
      phase: parent.phase + (i + 1) * 17.3,
      burn01: randBetween(0.48, 0.72),
      willBreakup: false,
      fragmentSpawned: true,
      isFragment: true,
    });
  }

  return pieces;
}

function toSlot(meteor: ActiveMeteor): GlMeteorSlot {
  return {
    headX: meteor.headX,
    headY: meteor.headY,
    velX: meteor.velX,
    velY: meteor.velY,
    tailLength: meteor.tailLength,
    mineral: meteor.mineral,
    life01: Math.max(0, meteor.life / meteor.maxLife),
    burn01: meteor.burn01,
    phase: meteor.phase,
  };
}

export class MeteorField {
  private readonly active: ActiveMeteor[] = [];
  private config: MeteorFieldConfig = { ...DEFAULT_CONFIG };
  private spawnCooldown = randBetween(4, 12);

  // Human: React quality tier changes update spawn limits without recreating the field.
  // Agent: MUTATES config; CLAMPS maxConcurrent to MAX_METEORS.
  setConfig(config: MeteorFieldConfig) {
    this.config = {
      maxConcurrent: Math.min(Math.max(1, config.maxConcurrent), MAX_METEORS),
      spawnCooldownScale: Math.max(0.5, config.spawnCooldownScale),
      enabled: config.enabled,
    };
  }

  update(dt: number): GlMeteorSlot[] {
    const slots: GlMeteorSlot[] = [];
    for (let i = 0; i < MAX_METEORS; i++) {
      slots.push(EMPTY_SLOT);
    }

    if (!this.config.enabled) {
      return slots;
    }

    const maxActive = this.config.maxConcurrent;
    const cooldownScale = this.config.spawnCooldownScale;

    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && this.active.length < maxActive - 1) {
      this.active.push(spawnMeteor());
      this.spawnCooldown = randBetween(5, 14) * cooldownScale;
    }

    const pendingFragments: ActiveMeteor[] = [];

    for (let i = this.active.length - 1; i >= 0; i--) {
      const meteor = this.active[i];
      meteor.headX += meteor.velX * dt;
      meteor.headY += meteor.velY * dt;
      meteor.life -= dt;

      const enteringBurn = meteor.headY < BURN_ZONE_START;
      if (enteringBurn) {
        if (meteor.burn01 <= 0) {
          meteor.burn01 = 0.02;
        }
        meteor.burn01 = Math.min(1, meteor.burn01 + dt / BURN_DURATION);

        if (
          meteor.willBreakup &&
          !meteor.fragmentSpawned &&
          !meteor.isFragment &&
          meteor.burn01 > 0.34 &&
          maxActive >= 3
        ) {
          meteor.fragmentSpawned = true;
          meteor.tailLength *= 0.32;
          meteor.velX *= 0.55;
          meteor.velY *= 0.55;
          pendingFragments.push(...spawnFragments(meteor));
        }
      }

      if (meteor.burn01 > 0.5) {
        meteor.tailLength = Math.max(0.06, meteor.tailLength - dt * 0.35);
        meteor.life -= dt * (meteor.isFragment ? 0.45 : 0.25);
      }

      const burnComplete = meteor.burn01 >= 0.99;
      const expired = meteor.life <= 0;
      const belowSurface = meteor.headY < SURFACE_CEILING - 0.012;
      const offScreen =
        meteor.headY < -0.1 || meteor.headX < -0.22 || meteor.headX > 1.22;

      if (expired || (belowSurface && burnComplete) || (offScreen && burnComplete)) {
        this.active.splice(i, 1);
      }
    }

    for (const fragment of pendingFragments) {
      if (this.active.length < maxActive) {
        this.active.push(fragment);
      }
    }

    for (let i = 0; i < this.active.length && i < MAX_METEORS; i++) {
      slots[i] = toSlot(this.active[i]);
    }

    return slots;
  }
}
