import type { TrackDefinition } from '../track/firstTrack';

export interface TrackSelectorController {
  select(trackId: string): void;
  dispose(): void;
}

export function createTrackSelector(
  host: ParentNode,
  tracks: readonly TrackDefinition[],
  initialTrack: TrackDefinition,
  onSelect: (track: TrackDefinition) => void,
): TrackSelectorController {
  const menuPanel = host.querySelector<HTMLElement>('.game-menu__panel');
  const raceCard = host.querySelector<HTMLElement>('.race-select-card');
  const trackName = host.querySelector<HTMLElement>('[data-track-name]');
  const trackSubtitle = host.querySelector<HTMLElement>('[data-track-subtitle]');
  const trackLaps = host.querySelector<HTMLElement>('[data-track-laps]');
  const kicker = host.querySelector<HTMLElement>('.game-menu .menu-kicker');

  if (!menuPanel || !raceCard || !trackName || !trackSubtitle || !trackLaps) {
    throw new Error('Superfície de seleção de pistas indisponível.');
  }

  if (kicker) kicker.textContent = 'MOBILE EDITION · COPA PRIMEIRO SALÁRIO';

  const selector = document.createElement('section');
  selector.className = 'track-selector';
  selector.setAttribute('aria-label', 'Circuitos da Copa Primeiro Salário');

  const heading = document.createElement('div');
  heading.className = 'track-selector__heading';
  const headingText = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'COPA PRIMEIRO SALÁRIO';
  const title = document.createElement('strong');
  title.textContent = 'Escolha o circuito';
  headingText.append(eyebrow, title);
  const count = document.createElement('small');
  count.textContent = `${tracks.length} pistas`;
  heading.append(headingText, count);

  const grid = document.createElement('div');
  grid.className = 'track-selector__grid';
  const buttons = new Map<string, HTMLButtonElement>();

  for (const track of tracks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track-card';
    button.dataset.trackId = track.id;
    button.style.setProperty('--track-accent', `#${track.visuals.accentColor.toString(16).padStart(6, '0')}`);

    const top = document.createElement('span');
    top.className = 'track-card__top';
    const order = document.createElement('b');
    order.textContent = String(track.content.cupOrder).padStart(2, '0');
    const difficulty = document.createElement('em');
    difficulty.textContent = track.content.difficulty;
    top.append(order, difficulty);

    const name = document.createElement('strong');
    name.textContent = track.name;
    const concept = document.createElement('span');
    concept.className = 'track-card__concept';
    concept.textContent = track.content.concept;
    const economy = document.createElement('small');
    economy.textContent = `+R$${track.economy.checkpointIncome}/setor · -R$${track.economy.lapOperatingCost}/volta`;
    button.append(top, name, concept, economy);

    button.addEventListener('click', () => select(track.id));
    buttons.set(track.id, button);
    grid.append(button);
  }

  selector.append(heading, grid);
  raceCard.insertAdjacentElement('afterend', selector);

  function select(trackId: string): void {
    const track = tracks.find((candidate) => candidate.id === trackId) ?? tracks[0];
    for (const [id, button] of buttons) {
      const selected = id === track.id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
    trackName!.textContent = track.name;
    trackSubtitle!.textContent = `${track.subtitle} · ${track.content.financialHook}`;
    trackLaps!.textContent = String(track.race.totalLaps);
    raceCard!.dataset.theme = track.visuals.theme;
    onSelect(track);
  }

  select(initialTrack.id);

  return {
    select,
    dispose(): void {
      selector.remove();
    },
  };
}
