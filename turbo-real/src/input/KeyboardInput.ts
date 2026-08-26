import { keyboardBindings, type GameAction } from './actions';
import type { DrivingInput } from '../simulation/vehicle';

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

export class KeyboardInput {
  private readonly pressed = new Set<GameAction>();
  private readonly triggered = new Set<GameAction>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
  }

  readDrivingInput(): DrivingInput {
    const accelerating = this.pressed.has('accelerate');
    const braking = this.pressed.has('brake');
    const steeringLeft = this.pressed.has('steer-left');
    const steeringRight = this.pressed.has('steer-right');

    return {
      throttle: accelerating === braking ? 0 : accelerating ? 1 : -1,
      steer: steeringLeft === steeringRight ? 0 : steeringLeft ? -1 : 1,
      drift: this.pressed.has('drift'),
    };
  }

  consumeUseItem(): boolean {
    if (!this.triggered.has('use-item')) return false;
    this.triggered.delete('use-item');
    return true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
    this.triggered.clear();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const action = keyboardBindings[event.code];
    if (!action) return;
    event.preventDefault();
    if (!this.pressed.has(action)) this.triggered.add(action);
    this.pressed.add(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const action = keyboardBindings[event.code];
    if (!action) return;
    event.preventDefault();
    this.pressed.delete(action);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.triggered.clear();
  };
}
