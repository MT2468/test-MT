export type MobileQuality = 'high' | 'balanced' | 'economy';

interface DeferredInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockNavigator extends Navigator {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
  deviceMemory?: number;
  standalone?: boolean;
}

interface OrientationScreen extends Screen {
  orientation?: ScreenOrientation & {
    lock?(orientation: OrientationLockType): Promise<void>;
  };
}

export interface MobileProfile {
  readonly touchCapable: boolean;
  readonly mobile: boolean;
  readonly quality: MobileQuality;
  readonly maxPixelRatio: number;
  readonly shadowMapSize: number;
  readonly shadowsEnabled: boolean;
  readonly effectsEnabled: boolean;
  readonly hapticsEnabled: boolean;
}

function detectProfile(): MobileProfile {
  const nav = navigator as WakeLockNavigator;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hoverless = window.matchMedia('(hover: none)').matches;
  const touchCapable = nav.maxTouchPoints > 0 || coarse;
  const shortEdge = Math.min(window.screen.width, window.screen.height);
  const mobile = touchCapable && (hoverless || shortEdge <= 1100);
  const memory = nav.deviceMemory ?? 6;
  const cores = nav.hardwareConcurrency ?? 6;

  let quality: MobileQuality = 'high';
  if (mobile && (memory <= 4 || cores <= 4)) quality = 'economy';
  else if (mobile) quality = 'balanced';

  if (quality === 'economy') {
    return {
      touchCapable,
      mobile,
      quality,
      maxPixelRatio: 1,
      shadowMapSize: 512,
      shadowsEnabled: false,
      effectsEnabled: false,
      hapticsEnabled: 'vibrate' in navigator,
    };
  }

  if (quality === 'balanced') {
    return {
      touchCapable,
      mobile,
      quality,
      maxPixelRatio: 1.35,
      shadowMapSize: 1024,
      shadowsEnabled: true,
      effectsEnabled: true,
      hapticsEnabled: 'vibrate' in navigator,
    };
  }

  return {
    touchCapable,
    mobile,
    quality,
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    effectsEnabled: true,
    hapticsEnabled: false,
  };
}

export class MobileRuntime {
  readonly profile = detectProfile();

  private initialized = false;
  private host: HTMLElement | null = null;
  private viewport: VisualViewport | null = null;
  private installPrompt: DeferredInstallPrompt | null = null;
  private companion: HTMLElement | null = null;
  private installButton: HTMLButtonElement | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
  private sessionActive = false;
  private paused = false;

  initialize(host: HTMLElement = document.body): void {
    if (this.initialized) return;
    this.initialized = true;
    this.host = host;
    this.viewport = window.visualViewport;

    document.documentElement.classList.toggle('tr-touch-capable', this.profile.touchCapable);
    document.body.classList.toggle('tr-mobile', this.profile.mobile);
    document.body.classList.toggle('tr-mobile-economy', this.profile.quality === 'economy');
    document.body.dataset.mobileQuality = this.profile.quality;

    this.updateViewport();
    window.addEventListener('resize', this.updateViewport);
    window.addEventListener('orientationchange', this.updateViewport);
    this.viewport?.addEventListener('resize', this.updateViewport);
    this.viewport?.addEventListener('scroll', this.updateViewport);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', this.onAppInstalled);

    if (this.profile.mobile) this.createCompanion();
    this.registerServiceWorker();
  }

  setSessionActive(active: boolean): void {
    this.sessionActive = active;
    if (!active) this.paused = false;
    document.body.classList.toggle('tr-session-active', active);
    document.body.classList.toggle('tr-session-paused', active && this.paused);
    this.syncCompanionVisibility();
    void this.syncWakeLock();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    document.body.classList.toggle('tr-session-paused', this.sessionActive && paused);
    void this.syncWakeLock();
  }

  vibrate(kind: 'tap' | 'confirm' | 'impact'): void {
    if (!this.profile.mobile || !this.profile.hapticsEnabled) return;
    const pattern = kind === 'impact' ? [18, 14, 28] : kind === 'confirm' ? 22 : 10;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibração é apenas feedback opcional.
    }
  }

  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    window.removeEventListener('resize', this.updateViewport);
    window.removeEventListener('orientationchange', this.updateViewport);
    this.viewport?.removeEventListener('resize', this.updateViewport);
    this.viewport?.removeEventListener('scroll', this.updateViewport);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt as EventListener);
    window.removeEventListener('appinstalled', this.onAppInstalled);
    this.companion?.remove();
    this.companion = null;
    this.installButton = null;
    void this.releaseWakeLock();
  }

  private createCompanion(): void {
    if (this.host === null || this.companion !== null) return;
    const companion = document.createElement('aside');
    companion.className = 'mobile-companion';
    companion.setAttribute('aria-label', 'Ações para celular');
    companion.innerHTML = `
      <button type="button" data-mobile-fullscreen aria-label="Abrir em tela cheia">⛶ <span>TELA CHEIA</span></button>
      <button type="button" data-mobile-install aria-label="Instalar Turbo Real" hidden>＋ <span>INSTALAR</span></button>
      <small data-mobile-quality>${this.profile.quality === 'economy' ? 'MODO ECONOMIA' : this.profile.quality === 'balanced' ? 'MODO EQUILIBRADO' : 'ALTA QUALIDADE'}</small>
    `;
    this.host.append(companion);
    this.companion = companion;
    this.installButton = companion.querySelector<HTMLButtonElement>('[data-mobile-install]');
    companion.querySelector<HTMLButtonElement>('[data-mobile-fullscreen]')?.addEventListener('click', () => {
      this.vibrate('confirm');
      void this.enterImmersiveMode();
    });
    this.installButton?.addEventListener('click', () => void this.promptInstall());
    this.syncCompanionVisibility();
  }

  private syncCompanionVisibility(): void {
    if (this.companion === null) return;
    this.companion.hidden = this.sessionActive;
  }

  private async promptInstall(): Promise<void> {
    const prompt = this.installPrompt;
    if (prompt === null) return;
    this.vibrate('confirm');
    await prompt.prompt();
    await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const, platform: 'unknown' }));
    this.installPrompt = null;
    if (this.installButton) this.installButton.hidden = true;
  }

  private async enterImmersiveMode(): Promise<void> {
    try {
      if (document.fullscreenElement === null && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Fullscreen depende da política do navegador.
    }

    try {
      const orientation = (window.screen as OrientationScreen).orientation;
      await orientation?.lock?.('landscape');
    } catch {
      // Bloqueio de orientação também é best-effort.
    }
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error: unknown) => {
        console.warn('Service worker do Turbo Real indisponível.', error);
      });
    }, { once: true });
  }

  private async syncWakeLock(): Promise<void> {
    const nav = navigator as WakeLockNavigator;
    const shouldHold = this.profile.mobile && this.sessionActive && !this.paused && document.visibilityState === 'visible';
    if (!shouldHold) {
      await this.releaseWakeLock();
      return;
    }
    if (this.wakeLock !== null || nav.wakeLock === undefined) return;
    try {
      this.wakeLock = await nav.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      }, { once: true });
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (lock === null || lock.released) return;
    try {
      await lock.release();
    } catch {
      // Wake Lock é opcional.
    }
  }

  private readonly updateViewport = (): void => {
    const viewport = this.viewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--tr-vw', `${width}px`);
    document.documentElement.style.setProperty('--tr-vh', `${height}px`);
    document.documentElement.style.setProperty('--tr-vh-unit', `${height * 0.01}px`);
    document.body.classList.toggle('tr-portrait', this.profile.mobile && height >= width);
    document.body.classList.toggle('tr-landscape', this.profile.mobile && width > height);
    document.body.classList.toggle('tr-short-screen', height < 520);
  };

  private readonly onBeforeInstallPrompt = (event: DeferredInstallPrompt): void => {
    event.preventDefault();
    this.installPrompt = event;
    if (this.installButton) this.installButton.hidden = false;
  };

  private readonly onAppInstalled = (): void => {
    this.installPrompt = null;
    if (this.installButton) this.installButton.hidden = true;
  };

  private readonly onVisibilityChange = (): void => {
    void this.syncWakeLock();
  };
}

export const mobileRuntime = new MobileRuntime();
