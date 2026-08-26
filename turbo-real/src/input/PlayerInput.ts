import { mobileRuntime } from '../platform/MobileRuntime';
import type { DecisionChoice } from '../simulation/decisions/types';
import type { FinanceInputAction } from '../simulation/finance/FinanceController';
import type { DrivingInput } from '../simulation/vehicle';
import { keyboardBindings, type GameAction } from './actions';

export type InputPhase = 'racing' | 'paused' | 'decision' | 'finished';

const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_PRESS_THRESHOLD = 0.55;

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function applyDeadzone(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  const normalized = (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
  return Math.sign(value) * Math.min(normalized, 1);
}

function buttonValue(buttons: readonly GamepadButton[], index: number): number {
  const button = buttons[index];
  return button ? Math.max(button.value, button.pressed ? 1 : 0) : 0;
}

function buttonPressed(buttons: readonly GamepadButton[], index: number): boolean {
  return buttonValue(buttons, index) >= GAMEPAD_PRESS_THRESHOLD;
}

export class PlayerInput {
  private readonly keyboardPressed = new Set<GameAction>();
  private readonly touchPressed = new Set<GameAction>();
  private readonly triggered = new Set<GameAction>();
  private readonly touchRoot: HTMLElement;
  private readonly touchCapable: boolean;
  private readonly touchWheel: HTMLElement | null;
  private readonly touchWheelKnob: HTMLElement | null;
  private gamepadIndex: number | null = null;
  private previousGamepadButtons: boolean[] = [];
  private gamepadSteer = 0;
  private gamepadThrottle = 0;
  private gamepadBrake = 0;
  private gamepadDrift = false;
  private touchSteer = 0;
  private phase: InputPhase = 'racing';
  private decisionActive = false;

  constructor(host: HTMLElement = document.body) {
    this.touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('tr-touch-capable', this.touchCapable);

    this.touchRoot = document.createElement('div');
    this.touchRoot.className = 'touch-controls';
    this.touchRoot.dataset.phase = 'racing';
    this.touchRoot.dataset.decision = 'false';
    this.touchRoot.setAttribute('aria-label', 'Controles de toque');
    this.touchRoot.innerHTML = `
      <button class="touch-pause" type="button" data-touch-trigger="pause" aria-label="Pausar corrida">Ⅱ</button>

      <div class="touch-finance" aria-label="Reserva de emergência">
        <button type="button" data-touch-trigger="withdraw-reserve" aria-label="Retirar dez reais da reserva"><span>R$−</span><small>RETIRAR</small></button>
        <button type="button" data-touch-trigger="save-reserve" aria-label="Guardar dez reais na reserva"><span>R$+</span><small>GUARDAR</small></button>
      </div>

      <div class="touch-steering" data-touch-wheel role="slider" aria-label="Direção analógica" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0">
        <span class="touch-wheel__axis" aria-hidden="true"></span>
        <span class="touch-wheel__knob" aria-hidden="true"></span>
        <small class="touch-wheel__label">DIREÇÃO</small>
      </div>

      <div class="touch-actions" aria-label="Ações do kart">
        <button class="touch-action touch-action--drift" type="button" data-touch-hold="drift"><strong>DRIFT</strong><small>segure</small></button>
        <button class="touch-action touch-action--item" type="button" data-touch-trigger="use-item"><strong>ITEM</strong><small>usar</small></button>
      </div>

      <div class="touch-pedals" aria-label="Pedais">
        <button class="touch-pedal touch-pedal--brake" type="button" data-touch-hold="brake"><strong>FREIO</strong><small>ré</small></button>
        <button class="touch-pedal touch-pedal--gas" type="button" data-touch-hold="accelerate"><strong>ACEL.</strong><small>segure</small></button>
      </div>

      <div class="touch-decisions" aria-label="Escolha financeira">
        <button type="button" data-touch-trigger="decision-1"><strong>1</strong><span>OPÇÃO 1</span></button>
        <button type="button" data-touch-trigger="decision-2"><strong>2</strong><span>OPÇÃO 2</span></button>
      </div>

      <div class="touch-orientation" aria-hidden="true">↻ Paisagem oferece mais visão da pista</div>
    `;
    host.append(this.touchRoot);
    this.touchWheel = this.touchRoot.querySelector<HTMLElement>('[data-touch-wheel]');
    this.touchWheelKnob = this.touchRoot.querySelector<HTMLElement>('.touch-wheel__knob');
    this.bindTouchButtons();
    this.bindTouchWheel();

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  update(phase: InputPhase, decisionActive: boolean): void {
    this.phase = phase;
    this.decisionActive = decisionActive;
    this.touchRoot.dataset.phase = phase;
    this.touchRoot.dataset.decision = decisionActive ? 'true' : 'false';
    if (phase !== 'racing' || decisionActive) this.resetTouchDriving();
    this.pollGamepad();
  }

  readDrivingInput(): DrivingInput {
    const accelerating = this.keyboardPressed.has('accelerate') || this.touchPressed.has('accelerate');
    const braking = this.keyboardPressed.has('brake') || this.touchPressed.has('brake');
    const steeringLeft = this.keyboardPressed.has('steer-left') || this.touchPressed.has('steer-left');
    const steeringRight = this.keyboardPressed.has('steer-right') || this.touchPressed.has('steer-right');

    const digitalSteer = steeringLeft === steeringRight ? 0 : steeringLeft ? -1 : 1;
    const touchOrDigitalSteer = Math.abs(this.touchSteer) > 0.01 ? this.touchSteer : digitalSteer;
    const steer = Math.abs(this.gamepadSteer) > 0.01 ? this.gamepadSteer : touchOrDigitalSteer;
    const forward = Math.max(accelerating ? 1 : 0, this.gamepadThrottle);
    const reverse = Math.max(braking ? 1 : 0, this.gamepadBrake);

    return {
      throttle: Math.max(-1, Math.min(1, forward - reverse)),
      steer: Math.max(-1, Math.min(1, steer)),
      drift: this.keyboardPressed.has('drift') || this.touchPressed.has('drift') || this.gamepadDrift,
    };
  }

  consumeUseItem(): boolean {
    return this.consume('use-item');
  }

  consumeFinanceAction(): FinanceInputAction | null {
    if (this.consume('save-reserve')) return 'save';
    if (this.consume('withdraw-reserve')) return 'withdraw';
    return null;
  }

  consumeDecisionChoice(): DecisionChoice | null {
    if (this.consume('decision-1')) return 1;
    if (this.consume('decision-2')) return 2;
    return null;
  }

  consumePause(): boolean {
    return this.consume('pause');
  }

  clearTransientActions(): void {
    this.triggered.clear();
    this.touchPressed.clear();
    this.resetTouchDriving();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.keyboardPressed.clear();
    this.touchPressed.clear();
    this.triggered.clear();
    this.resetTouchDriving();
    this.touchRoot.remove();
    if (this.touchCapable) document.body.classList.remove('tr-touch-capable');
  }

  private consume(action: GameAction): boolean {
    if (!this.triggered.has(action)) return false;
    this.triggered.delete(action);
    return true;
  }

  private bindTouchButtons(): void {
    for (const button of this.touchRoot.querySelectorAll<HTMLButtonElement>('[data-touch-hold]')) {
      const action = button.dataset.touchHold as GameAction;
      const release = (): void => {
        this.touchPressed.delete(action);
        button.classList.remove('is-pressed');
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.touchPressed.add(action);
        button.classList.add('is-pressed');
        mobileRuntime.vibrate('tap');
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }

    for (const button of this.touchRoot.querySelectorAll<HTMLButtonElement>('[data-touch-trigger]')) {
      const action = button.dataset.touchTrigger as GameAction;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.triggered.add(action);
        button.classList.add('is-pressed');
        mobileRuntime.vibrate(action === 'use-item' || action === 'decision-1' || action === 'decision-2' ? 'confirm' : 'tap');
        window.setTimeout(() => button.classList.remove('is-pressed'), 90);
      });
    }

    this.touchRoot.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private bindTouchWheel(): void {
    const wheel = this.touchWheel;
    if (wheel === null) return;

    const updateFromPointer = (event: PointerEvent): void => {
      const rect = wheel.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const usableRadius = Math.max(1, rect.width * 0.38);
      this.setTouchSteer((event.clientX - center) / usableRadius);
    };

    const release = (): void => this.setTouchSteer(0);

    wheel.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      wheel.setPointerCapture(event.pointerId);
      updateFromPointer(event);
      mobileRuntime.vibrate('tap');
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!wheel.hasPointerCapture(event.pointerId)) return;
      event.preventDefault();
      updateFromPointer(event);
    });
    wheel.addEventListener('pointerup', release);
    wheel.addEventListener('pointercancel', release);
    wheel.addEventListener('lostpointercapture', release);
  }

  private setTouchSteer(value: number): void {
    this.touchSteer = Math.max(-1, Math.min(1, value));
    this.touchWheel?.setAttribute('aria-valuenow', String(Math.round(this.touchSteer * 100)));
    if (this.touchWheelKnob) {
      const offset = this.touchSteer * 38;
      this.touchWheelKnob.style.transform = `translate(calc(-50% + ${offset}px), -50%)`;
    }
  }

  private resetTouchDriving(): void {
    this.touchPressed.delete('accelerate');
    this.touchPressed.delete('brake');
    this.touchPressed.delete('drift');
    this.setTouchSteer(0);
  }

  private pollGamepad(): void {
    const pads = typeof navigator.getGamepads === 'function'
      ? Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => pad !== null && pad.connected)
      : [];
    const pad = pads.find((candidate) => candidate.mapping === 'standard') ?? pads[0] ?? null;

    if (pad === null) {
      this.gamepadIndex = null;
      this.previousGamepadButtons = [];
      this.gamepadSteer = 0;
      this.gamepadThrottle = 0;
      this.gamepadBrake = 0;
      this.gamepadDrift = false;
      this.touchRoot.dataset.gamepad = 'disconnected';
      return;
    }

    this.touchRoot.dataset.gamepad = 'connected';
    const currentButtons = pad.buttons.map((button) => button.pressed || button.value >= GAMEPAD_PRESS_THRESHOLD);
    const isNewPad = this.gamepadIndex !== pad.index;

    if (!isNewPad) {
      const justPressed = (index: number): boolean => currentButtons[index] === true && this.previousGamepadButtons[index] !== true;

      if (this.phase === 'racing' && !this.decisionActive) {
        if (justPressed(2)) this.triggered.add('use-item');
        if (justPressed(3)) this.triggered.add('save-reserve');
        if (justPressed(1)) this.triggered.add('withdraw-reserve');
        if (justPressed(9)) this.triggered.add('pause');
      } else if (this.phase === 'paused') {
        if (justPressed(9)) this.triggered.add('pause');
      } else if (this.phase === 'decision' || this.decisionActive) {
        if (justPressed(0)) this.triggered.add('decision-1');
        if (justPressed(1)) this.triggered.add('decision-2');
      }
    }

    this.gamepadIndex = pad.index;
    this.previousGamepadButtons = currentButtons;

    if (this.phase !== 'racing' || this.decisionActive) {
      this.gamepadSteer = 0;
      this.gamepadThrottle = 0;
      this.gamepadBrake = 0;
      this.gamepadDrift = false;
      return;
    }

    const analogSteer = applyDeadzone(pad.axes[0] ?? 0);
    const dpadLeft = buttonPressed(pad.buttons, 14);
    const dpadRight = buttonPressed(pad.buttons, 15);
    const dpadSteer = dpadLeft === dpadRight ? 0 : dpadLeft ? -1 : 1;
    this.gamepadSteer = Math.abs(analogSteer) > 0.01 ? analogSteer : dpadSteer;
    this.gamepadThrottle = buttonValue(pad.buttons, 7);
    this.gamepadBrake = buttonValue(pad.buttons, 6);
    this.gamepadDrift = buttonPressed(pad.buttons, 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const action = keyboardBindings[event.code];
    if (!action) return;
    event.preventDefault();
    if (!this.keyboardPressed.has(action)) this.triggered.add(action);
    this.keyboardPressed.add(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const action = keyboardBindings[event.code];
    if (!action) return;
    event.preventDefault();
    this.keyboardPressed.delete(action);
  };

  private readonly onBlur = (): void => {
    this.keyboardPressed.clear();
    this.touchPressed.clear();
    this.triggered.clear();
    this.resetTouchDriving();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'hidden') return;
    this.onBlur();
  };
}
